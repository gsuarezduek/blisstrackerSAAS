const prisma = require('../lib/prisma')
const { safeArr, parseCoreValues } = require('../lib/peopleScore')
const { captureCurrentMonth } = require('../services/peopleAnalyzerSnapshot.service')
const { prevMonthsArr, monthLabel } = require('../lib/monthUtils')
const { MAX_ACTIVE_STRIKES, strikeExpiresAt, activeStrikeWhere, shapeStrikes } = require('../lib/strikes')

// ─── GET /api/eos/personas ────────────────────────────────────────────────────
// Devuelve todo lo necesario para el tab Personas en una sola llamada.

async function getPersonas(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const [members, eosData, ratings, strikes, nodes] = await Promise.all([
      // Miembros activos del workspace
      prisma.workspaceMember.findMany({
        where:   { workspaceId, active: true },
        include: { user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { user: { name: 'asc' } },
      }),
      // Core values para las columnas del analizador
      prisma.eOSData.findUnique({ where: { workspaceId }, select: { coreValues: true } }),
      // Ratings del analizador
      prisma.peopleAnalyzerRating.findMany({ where: { workspaceId } }),
      // Strikes
      prisma.eOSStrike.findMany({
        where:   { workspaceId },
        include: {
          createdBy: { select: { id: true, name: true } },
          liftedBy:  { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Nodos del organigrama
      prisma.accountabilityNode.findMany({
        where:   { workspaceId },
        orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
      }),
    ])

    const coreValues = parseCoreValues(eosData?.coreValues)

    // Snapshot perezoso del mes actual: cada visita al tab Personas actualiza el punto
    // del mes, así se construye el historial del People Score. Aislado para no romper
    // el tab si falla (best-effort, mismo patrón que RrhhMetricSnapshot en RRHH).
    captureCurrentMonth(workspaceId, req.workspace.timezone)
      .catch(err => console.error('[PeopleAnalyzerSnapshot] upsert mes actual:', err.message))

    // Ratings indexados: { [userId]: { [valueKey]: rating } }
    const ratingsMap = {}
    for (const r of ratings) {
      if (!ratingsMap[r.userId]) ratingsMap[r.userId] = {}
      ratingsMap[r.userId][r.valueKey] = r.rating
    }

    // Strikes agrupados por userId. El shape (y sobre todo QUÉ cuenta como activo
    // y qué número le toca) sale de `lib/strikes.js`, no de la columna: un strike
    // vencido o levantado sigue en la tabla pero ya no pesa. Se agrupa primero
    // para que la numeración de cada persona sea independiente de las demás.
    const byUser = {}
    for (const s of strikes) (byUser[s.userId] ||= []).push(s)
    const strikesMap = {}
    for (const [uid, rows] of Object.entries(byUser)) strikesMap[uid] = shapeStrikes(rows)

    res.json({
      members: members.map(m => ({
        id:       m.user.id,
        name:     m.user.name,
        avatar:   m.user.avatar,
        role:     m.role,
        teamRole: m.teamRole,
      })),
      coreValues,
      ratingsMap,
      strikesMap,
      nodes: nodes.map(n => ({
        id:               n.id,
        parentId:         n.parentId,
        seat:             n.seat,
        userId:           n.userId,
        accountabilities: safeArr(n.accountabilities),
        order:            n.order,
      })),
    })
  } catch (err) { next(err) }
}

// ─── GET /api/eos/personas/history ───────────────────────────────────────────
// Evolución mensual del People Score (para el gráfico de historial). Sin ?year → últimos
// 12 meses; con ?year=YYYY → los 12 meses de ese año calendario. Mismo shape de respuesta
// que GET /api/admin/rrhh/metric-history.

async function getPersonasHistory(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const tz = req.workspace.timezone
    const yearParam = req.query.year ? Number(req.query.year) : null

    const all = await prisma.peopleAnalyzerSnapshot.findMany({
      where:   { workspaceId },
      select:  { month: true, score: true, rightPeople: true, total: true },
      orderBy: { month: 'asc' },
    })

    const availableYears = [...new Set(all.map(s => Number(s.month.slice(0, 4))))].sort((a, b) => a - b)
    const byMonth = Object.fromEntries(all.map(s => [s.month, s]))

    let months
    if (yearParam) {
      months = Array.from({ length: 12 }, (_, i) => `${yearParam}-${String(i + 1).padStart(2, '0')}`)
    } else {
      const curMonth = new Date().toLocaleDateString('en-CA', { timeZone: tz }).slice(0, 7)
      months = prevMonthsArr(curMonth, 12)
    }

    const snapshots = months.map(m => {
      const s = byMonth[m]
      return {
        month:       m,
        label:       monthLabel(m),
        score:       s ? s.score : null,
        rightPeople: s ? s.rightPeople : null,
        total:       s ? s.total : null,
      }
    })

    res.json({ snapshots, availableYears })
  } catch (err) { next(err) }
}

// ─── GET /api/eos/personas/history/:month ────────────────────────────────────
// Detalle de un mes puntual: la tabla completa (members, coreValues, ratingsMap) tal cual
// estaba capturada ese mes, para reconstruirla en modo solo lectura.

async function getPersonasHistoryMonth(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const month = req.params.month

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'month inválido (formato YYYY-MM)' })
    }

    const snapshot = await prisma.peopleAnalyzerSnapshot.findUnique({
      where: { workspaceId_month: { workspaceId, month } },
    })
    if (!snapshot) return res.status(404).json({ error: 'No hay captura para ese mes' })

    res.json({
      month:       snapshot.month,
      label:       monthLabel(snapshot.month),
      score:       snapshot.score,
      rightPeople: snapshot.rightPeople,
      total:       snapshot.total,
      members:     snapshot.data?.members ?? [],
      coreValues:  snapshot.data?.coreValues ?? [],
      ratingsMap:  snapshot.data?.ratingsMap ?? {},
    })
  } catch (err) { next(err) }
}

// ─── PATCH /api/eos/people-analyzer ──────────────────────────────────────────
// body: { userId, valueKey, rating }   rating = '+' | '+/-' | '-' | null (borrar)

async function upsertRating(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { userId, valueKey, rating } = req.body

    if (!userId || !valueKey) return res.status(400).json({ error: 'userId y valueKey son requeridos' })

    // Verificar que el usuario pertenece al workspace
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: Number(userId) } },
    })
    if (!member) return res.status(404).json({ error: 'Usuario no encontrado en el workspace' })

    if (!rating) {
      // Borrar rating
      await prisma.peopleAnalyzerRating.deleteMany({ where: { workspaceId, userId: Number(userId), valueKey } })
      return res.json({ deleted: true })
    }

    if (!['+', '+/-', '-'].includes(rating)) {
      return res.status(400).json({ error: 'Rating inválido. Usar +, +/- o -' })
    }

    const record = await prisma.peopleAnalyzerRating.upsert({
      where:  { workspaceId_userId_valueKey: { workspaceId, userId: Number(userId), valueKey } },
      update: { rating },
      create: { workspaceId, userId: Number(userId), valueKey, rating },
    })

    res.json({ id: record.id, userId: record.userId, valueKey: record.valueKey, rating: record.rating })
  } catch (err) { next(err) }
}

// ─── POST /api/eos/strikes ───────────────────────────────────────────────────
// body: { userId, reason }

async function addStrike(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const createdById = req.user.userId
    const { userId, reason, agreement } = req.body

    if (!userId || !reason?.trim()) {
      return res.status(400).json({ error: 'userId y reason son requeridos' })
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: Number(userId) } },
    })
    if (!member) return res.status(404).json({ error: 'Usuario no encontrado en el workspace' })

    // El tope cuenta solo los ACTIVOS: uno vencido o levantado ya no pesa, que es
    // justamente para qué sirve que venzan.
    const activeCount = await prisma.eOSStrike.count({
      where: { workspaceId, userId: Number(userId), ...activeStrikeWhere() },
    })
    if (activeCount >= MAX_ACTIVE_STRIKES) {
      return res.status(400).json({ error: `Esta persona ya tiene ${MAX_ACTIVE_STRIKES} faltas activas` })
    }

    const now = new Date()
    const strike = await prisma.eOSStrike.create({
      data: {
        workspaceId,
        userId:       Number(userId),
        strikeNumber: activeCount + 1,
        reason:       reason.trim().slice(0, 1000),
        agreement:    agreement?.trim() ? agreement.trim().slice(0, 1000) : null,
        createdById,
        expiresAt:    strikeExpiresAt(now, req.workspace.strikeExpiryMonths),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        liftedBy:  { select: { id: true, name: true } },
      },
    })

    res.status(201).json(shapeStrikes([strike])[0])
  } catch (err) { next(err) }
}

// ─── PATCH /api/eos/strikes/:id ──────────────────────────────────────────────
// Corregir el motivo o cargar el acuerdo al que se llegó (que muchas veces se
// define después de la conversación, no en el momento de registrar la falta).
async function updateStrike(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const strike = await prisma.eOSStrike.findFirst({ where: { id, workspaceId } })
    if (!strike) return res.status(404).json({ error: 'Falta no encontrada' })

    const data = {}
    if ('reason' in req.body) {
      if (!req.body.reason?.trim()) return res.status(400).json({ error: 'El motivo no puede quedar vacío' })
      data.reason = req.body.reason.trim().slice(0, 1000)
    }
    // '' borra el acuerdo; una clave ausente no lo toca.
    if ('agreement' in req.body) {
      data.agreement = req.body.agreement?.trim() ? req.body.agreement.trim().slice(0, 1000) : null
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nada para actualizar' })

    const updated = await prisma.eOSStrike.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, name: true } },
        liftedBy:  { select: { id: true, name: true } },
      },
    })
    res.json(shapeStrikes([updated])[0])
  } catch (err) { next(err) }
}

// ─── PATCH /api/eos/strikes/:id/lift ─────────────────────────────────────────
// Levantar una falta antes de que venza, dejando por qué. NO la borra: la
// diferencia con DELETE es la que hay entre "esto se resolvió" y "esto nunca
// debió registrarse". Lo primero es parte del historial de la persona y es,
// justamente, lo que uno quiere poder mostrar.
async function liftStrike(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const { reason } = req.body

    const strike = await prisma.eOSStrike.findFirst({ where: { id, workspaceId } })
    if (!strike) return res.status(404).json({ error: 'Falta no encontrada' })
    if (strike.liftedAt) return res.status(409).json({ error: 'Esta falta ya estaba levantada' })
    if (!reason?.trim()) return res.status(400).json({ error: 'Contá por qué se levanta la falta' })

    const updated = await prisma.eOSStrike.update({
      where: { id },
      data: {
        liftedAt:   new Date(),
        liftedById: req.user.userId,
        liftReason: reason.trim().slice(0, 1000),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        liftedBy:  { select: { id: true, name: true } },
      },
    })
    res.json(shapeStrikes([updated])[0])
  } catch (err) { next(err) }
}

// ─── DELETE /api/eos/strikes/:id ─────────────────────────────────────────────
// Borrar de verdad, para la falta cargada por error. Lo normal es levantarla.
async function removeStrike(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)

    const strike = await prisma.eOSStrike.findFirst({ where: { id, workspaceId } })
    if (!strike) return res.status(404).json({ error: 'Falta no encontrada' })

    await prisma.eOSStrike.delete({ where: { id } })
    // Ya no hace falta renumerar: `strikeNumber` se deriva en lectura sobre los
    // activos (ver lib/strikes.js), así que la columna de los que quedan no miente
    // sobre nada que se muestre.
    res.json({ deleted: true })
  } catch (err) { next(err) }
}

// ─── POST /api/eos/accountability ────────────────────────────────────────────
// body: { parentId?, seat, userId?, accountabilities? }

async function createNode(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { parentId, seat, userId, accountabilities } = req.body

    if (!seat?.trim()) return res.status(400).json({ error: 'seat es requerido' })

    // Calcular order (al final de sus hermanos)
    const siblingCount = await prisma.accountabilityNode.count({
      where: { workspaceId, parentId: parentId ?? null },
    })

    const node = await prisma.accountabilityNode.create({
      data: {
        workspaceId,
        parentId:         parentId ? Number(parentId) : null,
        seat:             seat.trim().slice(0, 100),
        userId:           userId ? Number(userId) : null,
        accountabilities: JSON.stringify(
          Array.isArray(accountabilities)
            ? accountabilities.map(a => String(a).trim()).filter(Boolean).slice(0, 10)
            : []
        ),
        order: siblingCount,
      },
    })

    res.status(201).json(formatNode(node))
  } catch (err) { next(err) }
}

// ─── PATCH /api/eos/accountability/:id ───────────────────────────────────────

async function updateNode(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)
    const { seat, userId, accountabilities, parentId, order } = req.body

    const existing = await prisma.accountabilityNode.findFirst({ where: { id, workspaceId } })
    if (!existing) return res.status(404).json({ error: 'Nodo no encontrado' })

    const data = {}
    if (seat             !== undefined) data.seat             = seat.trim().slice(0, 100)
    if (userId           !== undefined) data.userId           = userId ? Number(userId) : null
    if (accountabilities !== undefined) data.accountabilities = JSON.stringify(
      Array.isArray(accountabilities)
        ? accountabilities.map(a => String(a).trim()).filter(Boolean).slice(0, 10)
        : []
    )
    if (parentId !== undefined) data.parentId = parentId ? Number(parentId) : null
    if (order    !== undefined) data.order    = Number(order)

    const node = await prisma.accountabilityNode.update({ where: { id }, data })
    res.json(formatNode(node))
  } catch (err) { next(err) }
}

// ─── DELETE /api/eos/accountability/:id ──────────────────────────────────────

async function deleteNode(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)

    const node = await prisma.accountabilityNode.findFirst({ where: { id, workspaceId } })
    if (!node) return res.status(404).json({ error: 'Nodo no encontrado' })

    // Reasignar hijos al padre del nodo eliminado
    await prisma.accountabilityNode.updateMany({
      where: { workspaceId, parentId: id },
      data:  { parentId: node.parentId ?? null },
    })

    await prisma.accountabilityNode.delete({ where: { id } })
    res.json({ deleted: true })
  } catch (err) { next(err) }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function formatNode(n) {
  return {
    id:               n.id,
    parentId:         n.parentId,
    seat:             n.seat,
    userId:           n.userId,
    accountabilities: safeArr(n.accountabilities),
    order:            n.order,
  }
}

module.exports = {
  getPersonas, getPersonasHistory, getPersonasHistoryMonth,
  upsertRating, addStrike, updateStrike, liftStrike, removeStrike, createNode, updateNode, deleteNode,
}
