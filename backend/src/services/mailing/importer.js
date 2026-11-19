// Alta masiva de contactos de Mailing — la comparten la importación de CSV y la
// de Ventas. Reglas:
//   - un email existente completa los datos que faltan (nunca pisa un dato con
//     un vacío) y se suma a las bases, pero CONSERVA SU ESTADO: una baja, un
//     rebote o una queja no se deshacen importando de nuevo;
//   - los nuevos entran `subscribed` con el consentimiento declarado (`source`).
const prisma = require('../../lib/prisma')
const { normalizeEmail } = require('../../lib/normalizeEmail')

const EMAIL_RE = /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[a-z]{2,}$/i
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

async function addMemberships(contactIds, listIds) {
  if (!contactIds.length || !listIds.length) return
  const data = []
  for (const contactId of contactIds) for (const listId of listIds) data.push({ contactId, listId })
  for (let i = 0; i < data.length; i += 5000) {
    await prisma.mailingListMember.createMany({ data: data.slice(i, i + 5000), skipDuplicates: true })
  }
}

/**
 * @param {object} p
 * @param {number} p.workspaceId
 * @param {number} p.projectId
 * @param {Array<{email, firstName?, lastName?, fields?, crmContactId?}>} p.rows
 * @param {number[]} p.listIds  ya validadas como del proyecto
 * @param {boolean} p.dryRun
 * @param {'csv'|'crm'|'agent'|'manual'} p.source
 */
async function importRows({ workspaceId, projectId, rows, listIds, dryRun, source }) {
  const invalid = []
  const seen = new Map()
  let duplicatesInFile = 0
  rows.forEach((r, i) => {
    const email = normalizeEmail(String(r?.email || ''))
    if (!EMAIL_RE.test(email || '')) { invalid.push({ row: i + 1, email: String(r?.email || '').slice(0, 120) }); return }
    if (seen.has(email)) { duplicatesInFile++; return }
    seen.set(email, {
      email, firstName: cleanName(r.firstName), lastName: cleanName(r.lastName), fields: cleanFields(r.fields),
      ...(r.crmContactId ? { crmContactId: r.crmContactId } : {}),
    })
  })

  const emails = [...seen.keys()]
  const existing = emails.length
    ? await prisma.mailingContact.findMany({
      where: { projectId, email: { in: emails } },
      select: { id: true, email: true, firstName: true, lastName: true, fields: true, status: true, crmContactId: true },
    })
    : []
  const byEmail = new Map(existing.map(c => [c.email, c]))
  const toCreate = emails.filter(e => !byEmail.has(e)).map(e => seen.get(e))

  const summary = {
    total: rows.length,
    valid: emails.length,
    new: toCreate.length,
    existing: existing.length,
    suppressed: existing.filter(c => c.status !== 'subscribed').length,
    duplicatesInFile,
    invalid: invalid.slice(0, 50),
    invalidCount: invalid.length,
  }
  if (dryRun) return { dryRun: true, ...summary }

  const now = new Date()
  if (toCreate.length) {
    for (let i = 0; i < toCreate.length; i += 2000) {
      await prisma.mailingContact.createMany({
        data: toCreate.slice(i, i + 2000).map(c => ({
          workspaceId, projectId, ...c, source, consentAt: now, consentSource: source,
        })),
        skipDuplicates: true,
      })
    }
  }
  const updates = []
  for (const c of existing) {
    const inc = seen.get(c.email)
    const data = {}
    if (!c.firstName && inc.firstName) data.firstName = inc.firstName
    if (!c.lastName && inc.lastName) data.lastName = inc.lastName
    if (!c.crmContactId && inc.crmContactId) data.crmContactId = inc.crmContactId
    const merged = { ...inc.fields, ...(c.fields || {}) }
    if (Object.keys(merged).length !== Object.keys(c.fields || {}).length) data.fields = merged
    if (Object.keys(data).length) updates.push(prisma.mailingContact.update({ where: { id: c.id }, data }))
  }
  for (let i = 0; i < updates.length; i += 200) await prisma.$transaction(updates.slice(i, i + 200))

  if (listIds.length && emails.length) {
    const all = await prisma.mailingContact.findMany({ where: { projectId, email: { in: emails } }, select: { id: true } })
    await addMemberships(all.map(c => c.id), listIds)
  }
  return { dryRun: false, ...summary, created: toCreate.length, updated: updates.length }
}

module.exports = { importRows, addMemberships, cleanFields, cleanName, EMAIL_RE }
