const prisma = require('../lib/prisma')

function safeArr(str) { try { return JSON.parse(str || '[]') } catch { return [] } }

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
        include: { createdBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      // Nodos del organigrama
      prisma.accountabilityNode.findMany({
        where:   { workspaceId },
        orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
      }),
    ])

    const coreValues = safeArr(eosData?.coreValues)

    // Ratings indexados: { [userId]: { [valueKey]: rating } }
    const ratingsMap = {}
    for (const r of ratings) {
      if (!ratingsMap[r.userId]) ratingsMap[r.userId] = {}
      ratingsMap[r.userId][r.valueKey] = r.rating
    }

    // Strikes agrupados por userId
    const strikesMap = {}
    for (const s of strikes) {
      if (!strikesMap[s.userId]) strikesMap[s.userId] = []
      strikesMap[s.userId].push({
        id:           s.id,
        strikeNumber: s.strikeNumber,
        reason:       s.reason,
        createdAt:    s.createdAt,
        createdBy:    s.createdBy,
      })
    }

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
    const { userId, reason } = req.body

    if (!userId || !reason?.trim()) {
      return res.status(400).json({ error: 'userId y reason son requeridos' })
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: Number(userId) } },
    })
    if (!member) return res.status(404).json({ error: 'Usuario no encontrado en el workspace' })

    // Contar strikes actuales
    const count = await prisma.eOSStrike.count({ where: { workspaceId, userId: Number(userId) } })
    if (count >= 3) return res.status(400).json({ error: 'Esta persona ya tiene 3 faltas registradas' })

    const strike = await prisma.eOSStrike.create({
      data: {
        workspaceId,
        userId:       Number(userId),
        strikeNumber: count + 1,
        reason:       reason.trim().slice(0, 1000),
        createdById,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    })

    res.status(201).json({
      id:           strike.id,
      userId:       strike.userId,
      strikeNumber: strike.strikeNumber,
      reason:       strike.reason,
      createdAt:    strike.createdAt,
      createdBy:    strike.createdBy,
    })
  } catch (err) { next(err) }
}

// ─── DELETE /api/eos/strikes/:id ─────────────────────────────────────────────

async function removeStrike(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const id = Number(req.params.id)

    const strike = await prisma.eOSStrike.findFirst({ where: { id, workspaceId } })
    if (!strike) return res.status(404).json({ error: 'Falta no encontrada' })

    await prisma.eOSStrike.delete({ where: { id } })

    // Renumerar las faltas restantes del usuario para que queden consecutivas
    const remaining = await prisma.eOSStrike.findMany({
      where:   { workspaceId, userId: strike.userId },
      orderBy: { createdAt: 'asc' },
    })
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].strikeNumber !== i + 1) {
        await prisma.eOSStrike.update({ where: { id: remaining[i].id }, data: { strikeNumber: i + 1 } })
      }
    }

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

module.exports = { getPersonas, upsertRating, addStrike, removeStrike, createNode, updateNode, deleteNode }
