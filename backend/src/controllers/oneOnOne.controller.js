const prisma = require('../lib/prisma')
const { DEFAULT_TZ } = require('../utils/dates')

// ─── 1on1 y acuerdos ──────────────────────────────────────────────────────────
// La conversación de seguimiento entre quien lidera y la persona. Vive bajo RRHH
// y NO bajo `/api/eos/*` a propósito: un 1on1 es trabajo de RRHH y tiene que
// funcionar en un workspace que no usa EOS. Los strikes sí son de EOS (son la
// regla de las 3 faltas de Traction) y se quedaron allá; la sección Desempeño de
// RRHH muestra las dos cosas juntas, cada una con su propio permiso.
//
// No tiene cronómetro ni crea tareas, a diferencia de las reuniones de proyecto y
// de la L10: esas cuentan tiempo porque se le factura al cliente. Un 1on1 no se
// cobra, y lo que importa no es cuánto duró sino a qué se llegó.

const AGREEMENT_INCLUDE = { orderBy: { order: 'asc' } }
const INCLUDE = {
  user:      { select: { id: true, name: true, avatar: true } },
  leader:    { select: { id: true, name: true, avatar: true } },
  strike:    { select: { id: true, reason: true, agreement: true, createdAt: true } },
  agreements: AGREEMENT_INCLUDE,
}

const isYmd = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

// Normaliza los acuerdos que llegan del cliente: textos no vacíos, en orden, con tope.
function cleanAgreements(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map(a => (typeof a === 'string' ? { text: a } : a))
    .map(a => ({ text: String(a?.text ?? '').trim().slice(0, 500), done: !!a?.done }))
    .filter(a => a.text)
    .slice(0, 20)
    .map((a, i) => ({ ...a, order: i, doneAt: a.done ? new Date() : null }))
}

/**
 * GET /api/admin/rrhh/one-on-ones?userId=&limit=
 * Los 1on1 del workspace, del más nuevo al más viejo. Con `userId`, los de esa persona.
 */
async function listOneOnOnes(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const where = { workspaceId }
    if (req.query.userId) {
      const uid = Number(req.query.userId)
      if (!Number.isInteger(uid)) return res.status(400).json({ error: 'userId inválido' })
      where.userId = uid
    }
    const take = Math.min(Number(req.query.limit) || 50, 200)

    const rows = await prisma.oneOnOne.findMany({
      where, include: INCLUDE, orderBy: [{ date: 'desc' }, { id: 'desc' }], take,
    })
    res.json(rows)
  } catch (err) { next(err) }
}

/**
 * POST /api/admin/rrhh/one-on-ones
 * Body: { userId, date?, leaderId?, notes?, strikeId?, agreements? }
 */
async function createOneOnOne(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { userId, date, leaderId, notes, strikeId, agreements } = req.body

    const uid = Number(userId)
    if (!Number.isInteger(uid)) return res.status(400).json({ error: 'userId es requerido' })

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: uid } },
      select: { active: true },
    })
    if (!member) return res.status(404).json({ error: 'La persona no está en este workspace' })

    if (date != null && !isYmd(date)) {
      return res.status(400).json({ error: 'date debe ser "YYYY-MM-DD"' })
    }
    // Sin fecha, hoy en la zona del workspace (mismo criterio que WorkDay.date).
    const day = date ?? new Date().toLocaleDateString('en-CA', { timeZone: req.workspace.timezone || DEFAULT_TZ })

    // El strike vinculado tiene que ser de esta persona: "revisar el acuerdo del
    // último strike" no tiene sentido con la falta de otro.
    let linkedStrikeId = null
    if (strikeId != null) {
      const strike = await prisma.eOSStrike.findFirst({
        where: { id: Number(strikeId), workspaceId, userId: uid }, select: { id: true },
      })
      if (!strike) return res.status(400).json({ error: 'Esa falta no es de esta persona' })
      linkedStrikeId = strike.id
    }

    // Quien lidera es, por default, quien lo está cargando.
    let leader = leaderId != null ? Number(leaderId) : req.user.userId
    if (!Number.isInteger(leader)) leader = req.user.userId

    const created = await prisma.oneOnOne.create({
      data: {
        workspaceId, userId: uid, leaderId: leader, date: day,
        notes: typeof notes === 'string' ? notes.slice(0, 20000) : null,
        strikeId: linkedStrikeId,
        createdById: req.user.userId,
        agreements: { create: cleanAgreements(agreements) },
      },
      include: INCLUDE,
    })
    res.status(201).json(created)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/admin/rrhh/one-on-ones/:id
 * Body: { date?, notes?, leaderId?, agreements? }
 * `agreements` reemplaza la lista completa (igual que `PUT /projects/:id/links`):
 * el editor manda lo que quedó en pantalla, no un diff.
 */
async function updateOneOnOne(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.oneOnOne.findFirst({ where: { id, workspaceId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: '1on1 no encontrado' })

    const data = {}
    if ('date' in req.body) {
      if (!isYmd(req.body.date)) return res.status(400).json({ error: 'date debe ser "YYYY-MM-DD"' })
      data.date = req.body.date
    }
    if ('notes' in req.body) data.notes = typeof req.body.notes === 'string' ? req.body.notes.slice(0, 20000) : null
    if ('leaderId' in req.body) {
      const l = req.body.leaderId == null ? null : Number(req.body.leaderId)
      data.leaderId = Number.isInteger(l) ? l : null
    }

    const ops = []
    if (Object.keys(data).length > 0) ops.push(prisma.oneOnOne.update({ where: { id }, data }))
    if ('agreements' in req.body) {
      ops.push(prisma.oneOnOneAgreement.deleteMany({ where: { oneOnOneId: id } }))
      const next = cleanAgreements(req.body.agreements)
      if (next.length > 0) {
        ops.push(prisma.oneOnOneAgreement.createMany({ data: next.map(a => ({ ...a, oneOnOneId: id })) }))
      }
    }
    if (ops.length === 0) return res.status(400).json({ error: 'Nada para actualizar' })
    await prisma.$transaction(ops)

    res.json(await prisma.oneOnOne.findUnique({ where: { id }, include: INCLUDE }))
  } catch (err) { next(err) }
}

/**
 * PATCH /api/admin/rrhh/one-on-ones/:id/agreements/:agreementId
 * Body: { done }
 * Tildar un acuerdo es la acción que más se repite (se hace en el 1on1
 * siguiente, repasando uno por uno), así que tiene su endpoint en vez de obligar
 * a reenviar la lista entera.
 */
async function toggleAgreement(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const agreementId = Number(req.params.agreementId)

    const agreement = await prisma.oneOnOneAgreement.findFirst({
      where: { id: agreementId, oneOnOneId: id, oneOnOne: { workspaceId } },
      select: { id: true },
    })
    if (!agreement) return res.status(404).json({ error: 'Acuerdo no encontrado' })

    const done = !!req.body?.done
    const updated = await prisma.oneOnOneAgreement.update({
      where: { id: agreementId },
      data: { done, doneAt: done ? new Date() : null },
    })
    res.json(updated)
  } catch (err) { next(err) }
}

/** DELETE /api/admin/rrhh/one-on-ones/:id */
async function deleteOneOnOne(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const existing = await prisma.oneOnOne.findFirst({ where: { id, workspaceId }, select: { id: true } })
    if (!existing) return res.status(404).json({ error: '1on1 no encontrado' })
    await prisma.oneOnOne.delete({ where: { id } })   // los acuerdos caen en cascada
    res.json({ deleted: true })
  } catch (err) { next(err) }
}

module.exports = { listOneOnOnes, createOneOnOne, updateOneOnOne, toggleAgreement, deleteOneOnOne }
