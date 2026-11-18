// Bases (MailingList) y contactos (MailingContact) de un proyecto.
const prisma = require('../../lib/prisma')
const { normalizeEmail } = require('../../lib/normalizeEmail')
const { buildTextSearchFilters } = require('../../lib/textSearch')
const { resolveCtx, intParam, sendError } = require('./_shared')
const { ownListIds } = require('../../services/mailing/audience')

const EMAIL_RE = /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[a-z]{2,}$/i
const STATUSES = ['pending', 'subscribed', 'unsubscribed', 'bounced', 'complained']
const MAX_IMPORT_ROWS = 2000
const MAX_FIELDS = 30

function cleanFields(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const [k, v] of Object.entries(raw).slice(0, MAX_FIELDS)) {
    const key = String(k).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
    if (!key || v == null) continue
    const val = String(v).trim().slice(0, 500)
    if (val) out[key] = val
  }
  return out
}

function cleanName(v) {
  const s = String(v ?? '').trim().slice(0, 80)
  return s || null
}

// ─── Bases ───────────────────────────────────────────────────────────────────

/** GET /projects/:id/mailing/lists — con total y suscriptos por base. */
async function listLists(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const [lists, subscribed, totals] = await Promise.all([
      prisma.mailingList.findMany({
        where: { projectId: ctx.projectId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, description: true, doubleOptIn: true, createdAt: true, _count: { select: { members: true } } },
      }),
      prisma.mailingListMember.groupBy({
        by: ['listId'],
        where: { list: { projectId: ctx.projectId }, contact: { status: 'subscribed' } },
        _count: { _all: true },
      }),
      prisma.mailingContact.groupBy({
        by: ['status'],
        where: { projectId: ctx.projectId },
        _count: { _all: true },
      }),
    ])
    const subs = new Map(subscribed.map(s => [s.listId, s._count._all]))
    const counts = Object.fromEntries(STATUSES.map(s => [s, 0]))
    for (const t of totals) counts[t.status] = t._count._all
    res.json({
      lists: lists.map(({ _count, ...l }) => ({ ...l, total: _count.members, subscribed: subs.get(l.id) || 0 })),
      contactCounts: { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) },
    })
  } catch (err) { next(err) }
}

async function createList(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const name = String(req.body?.name || '').trim().slice(0, 80)
    if (!name) return res.status(400).json({ error: 'La base necesita un nombre' })
    const exists = await prisma.mailingList.findFirst({ where: { projectId: ctx.projectId, name } })
    if (exists) return res.status(409).json({ error: 'Ya hay una base con ese nombre' })
    const list = await prisma.mailingList.create({
      data: {
        workspaceId: ctx.workspaceId, projectId: ctx.projectId, name,
        description: String(req.body?.description || '').trim().slice(0, 300) || null,
      },
    })
    res.status(201).json({ ...list, total: 0, subscribed: 0 })
  } catch (err) { next(err) }
}

async function updateList(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const listId = intParam(req.params.listId)
    const list = listId && await prisma.mailingList.findFirst({ where: { id: listId, projectId: ctx.projectId } })
    if (!list) return res.status(404).json({ error: 'Base no encontrada' })
    const data = {}
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim().slice(0, 80)
      if (!name) return res.status(400).json({ error: 'La base necesita un nombre' })
      const dup = await prisma.mailingList.findFirst({ where: { projectId: ctx.projectId, name, id: { not: list.id } } })
      if (dup) return res.status(409).json({ error: 'Ya hay una base con ese nombre' })
      data.name = name
    }
    if (req.body?.description !== undefined) data.description = String(req.body.description || '').trim().slice(0, 300) || null
    res.json(await prisma.mailingList.update({ where: { id: list.id }, data }))
  } catch (err) { next(err) }
}

/** DELETE — los contactos quedan (pueden estar en otras bases), solo se van las pertenencias. */
async function deleteList(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const listId = intParam(req.params.listId)
    const list = listId && await prisma.mailingList.findFirst({ where: { id: listId, projectId: ctx.projectId } })
    if (!list) return res.status(404).json({ error: 'Base no encontrada' })
    await prisma.mailingList.delete({ where: { id: list.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ─── Contactos ───────────────────────────────────────────────────────────────

const CONTACT_SELECT = {
  id: true, email: true, firstName: true, lastName: true, fields: true, status: true,
  source: true, consentAt: true, unsubscribedAt: true, bouncedAt: true, createdAt: true,
  memberships: { select: { listId: true } },
}

function shapeContact(c) {
  const { memberships, ...rest } = c
  return { ...rest, listIds: (memberships || []).map(m => m.listId) }
}

/** GET /projects/:id/mailing/contacts?listId=&status=&q=&page=&pageSize= */
async function listContacts(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res)
    if (!ctx) return
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize) || 50))
    const where = { projectId: ctx.projectId }
    const listId = intParam(req.query.listId)
    if (listId) where.memberships = { some: { listId } }
    if (STATUSES.includes(req.query.status)) where.status = req.query.status
    const q = String(req.query.q || '').trim()
    const search = q ? buildTextSearchFilters(q, ['email', 'firstName', 'lastName']) : null
    if (search) where.AND = search
    const [items, total] = await Promise.all([
      prisma.mailingContact.findMany({ where, select: CONTACT_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.mailingContact.count({ where }),
    ])
    res.json({ items: items.map(shapeContact), total, page, pageSize })
  } catch (err) { next(err) }
}

async function addMemberships(contactIds, listIds) {
  if (!contactIds.length || !listIds.length) return
  const data = []
  for (const contactId of contactIds) for (const listId of listIds) data.push({ contactId, listId })
  for (let i = 0; i < data.length; i += 5000) {
    await prisma.mailingListMember.createMany({ data: data.slice(i, i + 5000), skipDuplicates: true })
  }
}

/**
 * POST /projects/:id/mailing/contacts
 * Si el email ya existe en el proyecto, se suma a las bases pedidas pero NO se
 * re-suscribe: una baja o un rebote no se deshacen cargando el contacto de nuevo.
 */
async function createContact(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const email = normalizeEmail(String(req.body?.email || ''))
    if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'Email inválido' })
    const listIds = await ownListIds(ctx.projectId, req.body?.listIds)
    const existing = await prisma.mailingContact.findUnique({ where: { projectId_email: { projectId: ctx.projectId, email } } })
    let contact
    if (existing) {
      contact = existing
    } else {
      contact = await prisma.mailingContact.create({
        data: {
          workspaceId: ctx.workspaceId, projectId: ctx.projectId, email,
          firstName: cleanName(req.body?.firstName), lastName: cleanName(req.body?.lastName),
          fields: cleanFields(req.body?.fields), source: 'manual',
          consentAt: new Date(), consentSource: 'manual',
        },
      })
    }
    await addMemberships([contact.id], listIds)
    const full = await prisma.mailingContact.findUnique({ where: { id: contact.id }, select: CONTACT_SELECT })
    res.status(existing ? 200 : 201).json({ contact: shapeContact(full), existed: !!existing })
  } catch (err) { next(err) }
}

/**
 * PATCH /projects/:id/mailing/contacts/:contactId
 * Estados que se pueden poner a mano: `unsubscribed` (desde cualquiera) y
 * `subscribed` solo desde `bounced` (la dirección se corrigió) — nunca se
 * re-suscribe a quien pidió la baja o marcó spam.
 */
async function updateContact(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const contactId = intParam(req.params.contactId)
    const contact = contactId && await prisma.mailingContact.findFirst({ where: { id: contactId, projectId: ctx.projectId } })
    if (!contact) return res.status(404).json({ error: 'Contacto no encontrado' })
    const b = req.body || {}
    const data = {}
    if (b.firstName !== undefined) data.firstName = cleanName(b.firstName)
    if (b.lastName !== undefined) data.lastName = cleanName(b.lastName)
    if (b.fields !== undefined) data.fields = cleanFields(b.fields)
    if (b.email !== undefined) {
      const email = normalizeEmail(String(b.email || ''))
      if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'Email inválido' })
      if (email !== contact.email) {
        const dup = await prisma.mailingContact.findUnique({ where: { projectId_email: { projectId: ctx.projectId, email } } })
        if (dup) return res.status(409).json({ error: 'Ya hay un contacto con ese email' })
        data.email = email
      }
    }
    if (b.status !== undefined && b.status !== contact.status) {
      if (b.status === 'unsubscribed') {
        data.status = 'unsubscribed'
        data.unsubscribedAt = new Date()
        data.unsubscribeReason = 'Baja manual'
      } else if (b.status === 'subscribed' && contact.status === 'bounced') {
        data.status = 'subscribed'
        data.bouncedAt = null
      } else {
        return res.status(400).json({ error: 'No se puede volver a suscribir a alguien que pidió la baja o marcó el mail como spam.' })
      }
    }
    if (Array.isArray(b.listIds)) {
      const listIds = await ownListIds(ctx.projectId, b.listIds)
      await prisma.mailingListMember.deleteMany({ where: { contactId: contact.id, listId: { notIn: listIds } } })
      await addMemberships([contact.id], listIds)
    }
    const updated = await prisma.mailingContact.update({ where: { id: contact.id }, data, select: CONTACT_SELECT })
    res.json(shapeContact(updated))
  } catch (err) { next(err) }
}

async function deleteContact(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const contactId = intParam(req.params.contactId)
    const r = contactId ? await prisma.mailingContact.deleteMany({ where: { id: contactId, projectId: ctx.projectId } }) : { count: 0 }
    if (!r.count) return res.status(404).json({ error: 'Contacto no encontrado' })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

/**
 * POST /projects/:id/mailing/contacts/bulk
 * { action: 'add-to-list' | 'remove-from-list' | 'unsubscribe' | 'delete', contactIds, listId? }
 */
async function bulkContacts(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { action } = req.body || {}
    const ids = (Array.isArray(req.body?.contactIds) ? req.body.contactIds : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 5000)
    if (!ids.length) return res.status(400).json({ error: 'No hay contactos seleccionados' })
    const own = (await prisma.mailingContact.findMany({ where: { projectId: ctx.projectId, id: { in: ids } }, select: { id: true } })).map(c => c.id)
    if (action === 'add-to-list' || action === 'remove-from-list') {
      const [listId] = await ownListIds(ctx.projectId, [req.body.listId])
      if (!listId) return res.status(404).json({ error: 'Base no encontrada' })
      if (action === 'add-to-list') await addMemberships(own, [listId])
      else await prisma.mailingListMember.deleteMany({ where: { listId, contactId: { in: own } } })
    } else if (action === 'unsubscribe') {
      await prisma.mailingContact.updateMany({
        where: { id: { in: own }, status: { in: ['subscribed', 'pending'] } },
        data: { status: 'unsubscribed', unsubscribedAt: new Date(), unsubscribeReason: 'Baja manual' },
      })
    } else if (action === 'delete') {
      await prisma.mailingContact.deleteMany({ where: { id: { in: own } } })
    } else {
      return res.status(400).json({ error: 'Acción desconocida' })
    }
    res.json({ ok: true, affected: own.length })
  } catch (err) { next(err) }
}

/**
 * POST /projects/:id/mailing/contacts/import
 * { rows: [{ email, firstName?, lastName?, fields? }], listIds, consent: true, dryRun }
 *
 * El CSV se parsea y se mapea en el browser y llega en tandas de hasta 2000 filas
 * (el body corta en 1 MB). En dos pasos, como la importación de enlaces: con
 * `dryRun` devuelve qué pasaría sin escribir nada.
 *
 * - Un email que ya existe completa los datos que faltan (no pisa un nombre con
 *   un vacío) y se suma a las bases, pero conserva su estado: un dado de baja
 *   sigue dado de baja. Se informa aparte para que se vea.
 * - `consent` es obligatorio: quien importa declara que esas personas aceptaron
 *   recibir mails. Queda registrado en cada contacto nuevo.
 */
async function importContacts(req, res, next) {
  try {
    const ctx = await resolveCtx(req, res, { write: true })
    if (!ctx) return
    const { rows, dryRun } = req.body || {}
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'No hay filas para importar' })
    if (rows.length > MAX_IMPORT_ROWS) return res.status(400).json({ error: `Máximo ${MAX_IMPORT_ROWS} filas por tanda` })
    if (!dryRun && req.body.consent !== true) return res.status(400).json({ error: 'Tenés que confirmar que estos contactos aceptaron recibir mails.' })
    const listIds = await ownListIds(ctx.projectId, req.body.listIds)

    const invalid = []
    const seen = new Map()
    let duplicatesInFile = 0
    rows.forEach((r, i) => {
      const email = normalizeEmail(String(r?.email || ''))
      if (!EMAIL_RE.test(email || '')) { invalid.push({ row: i + 1, email: String(r?.email || '').slice(0, 120) }); return }
      if (seen.has(email)) { duplicatesInFile++; return }
      seen.set(email, { email, firstName: cleanName(r.firstName), lastName: cleanName(r.lastName), fields: cleanFields(r.fields) })
    })

    const emails = [...seen.keys()]
    const existing = emails.length
      ? await prisma.mailingContact.findMany({
        where: { projectId: ctx.projectId, email: { in: emails } },
        select: { id: true, email: true, firstName: true, lastName: true, fields: true, status: true },
      })
      : []
    const byEmail = new Map(existing.map(c => [c.email, c]))
    const toCreate = emails.filter(e => !byEmail.has(e)).map(e => seen.get(e))
    const suppressed = existing.filter(c => c.status !== 'subscribed').length

    const summary = {
      total: rows.length,
      valid: emails.length,
      new: toCreate.length,
      existing: existing.length,
      suppressed,
      duplicatesInFile,
      invalid: invalid.slice(0, 50),
      invalidCount: invalid.length,
    }
    if (dryRun) return res.json({ dryRun: true, ...summary })

    const now = new Date()
    if (toCreate.length) {
      await prisma.mailingContact.createMany({
        data: toCreate.map(c => ({
          workspaceId: ctx.workspaceId, projectId: ctx.projectId, ...c,
          source: 'csv', consentAt: now, consentSource: 'csv',
        })),
        skipDuplicates: true,
      })
    }
    // Completar datos faltantes de los que ya estaban.
    const updates = []
    for (const c of existing) {
      const inc = seen.get(c.email)
      const data = {}
      if (!c.firstName && inc.firstName) data.firstName = inc.firstName
      if (!c.lastName && inc.lastName) data.lastName = inc.lastName
      const merged = { ...inc.fields, ...(c.fields || {}) }
      if (Object.keys(merged).length !== Object.keys(c.fields || {}).length) data.fields = merged
      if (Object.keys(data).length) updates.push(prisma.mailingContact.update({ where: { id: c.id }, data }))
    }
    for (let i = 0; i < updates.length; i += 200) await prisma.$transaction(updates.slice(i, i + 200))

    if (listIds.length) {
      const all = await prisma.mailingContact.findMany({ where: { projectId: ctx.projectId, email: { in: emails } }, select: { id: true } })
      await addMemberships(all.map(c => c.id), listIds)
    }
    res.json({ dryRun: false, ...summary, created: toCreate.length, updated: updates.length })
  } catch (err) { sendError(res, next, err) }
}

module.exports = {
  listLists, createList, updateList, deleteList,
  listContacts, createContact, updateContact, deleteContact, bulkContacts, importContacts,
  cleanFields, EMAIL_RE,
}
