const axios  = require('axios')
const prisma = require('../lib/prisma')
const { encrypt, decrypt } = require('../lib/encryption')
const { invalidateApifyTokensCache } = require('../lib/apifyTokens')

const TOKEN_SELECT = {
  id: true, label: true, order: true, active: true,
  lastUsedAt: true, lastFailedAt: true, lastErrorMsg: true, createdAt: true,
}

// ─── CRUD de tokens (SuperAdmin → Scraping) ────────────────────────────────────
// El valor cifrado (`token`) nunca se devuelve en ningún response.

/**
 * GET /api/superadmin/apify-tokens
 */
async function listTokens(req, res, next) {
  try {
    const tokens = await prisma.apifyToken.findMany({ orderBy: { order: 'asc' }, select: TOKEN_SELECT })
    res.json(tokens)
  } catch (err) { next(err) }
}

/**
 * POST /api/superadmin/apify-tokens
 * Body: { label, token }
 */
async function createToken(req, res, next) {
  try {
    const { label, token } = req.body
    if (!label?.trim()) return res.status(400).json({ error: 'El nombre es requerido' })
    if (!token?.trim())  return res.status(400).json({ error: 'El token es requerido' })

    const maxOrder = await prisma.apifyToken.aggregate({ _max: { order: true } })
    const created = await prisma.apifyToken.create({
      data: {
        label: label.trim(),
        token: encrypt(token.trim()),
        order: (maxOrder._max.order ?? 0) + 1,
      },
      select: TOKEN_SELECT,
    })
    invalidateApifyTokensCache()
    res.status(201).json(created)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/apify-tokens/:id
 * Body: { label?, token? }
 */
async function updateToken(req, res, next) {
  try {
    const id = Number(req.params.id)
    const { label, token } = req.body
    const existing = await prisma.apifyToken.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Token no encontrado' })

    const data = {}
    if (label !== undefined) {
      if (!label.trim()) return res.status(400).json({ error: 'El nombre no puede estar vacío' })
      data.label = label.trim()
    }
    if (token !== undefined) {
      if (!token.trim()) return res.status(400).json({ error: 'El token no puede estar vacío' })
      data.token = encrypt(token.trim())
    }

    const updated = await prisma.apifyToken.update({ where: { id }, data, select: TOKEN_SELECT })
    invalidateApifyTokensCache()
    res.json(updated)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/apify-tokens/reorder
 * Body: { items: [{ id, order }] }
 */
async function reorderTokens(req, res, next) {
  try {
    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items debe ser un array' })
    }

    await prisma.$transaction(
      items.map(({ id, order }) =>
        prisma.apifyToken.update({ where: { id: Number(id) }, data: { order: Number(order) } })
      )
    )
    invalidateApifyTokensCache()

    const tokens = await prisma.apifyToken.findMany({ orderBy: { order: 'asc' }, select: TOKEN_SELECT })
    res.json(tokens)
  } catch (err) { next(err) }
}

/**
 * PATCH /api/superadmin/apify-tokens/:id/toggle
 */
async function toggleToken(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.apifyToken.findUnique({ where: { id }, select: { active: true } })
    if (!existing) return res.status(404).json({ error: 'Token no encontrado' })

    const updated = await prisma.apifyToken.update({
      where:  { id },
      data:   { active: !existing.active },
      select: TOKEN_SELECT,
    })
    invalidateApifyTokensCache()
    res.json(updated)
  } catch (err) { next(err) }
}

/**
 * DELETE /api/superadmin/apify-tokens/:id
 * Hard delete siempre permitido (a diferencia de Avatar): ApifyUsageLog.tokenId
 * es FK nullable (onDelete: SetNull) y cada fila guarda `tokenLabel` como
 * snapshot, así el historial de uso se mantiene legible.
 */
async function deleteToken(req, res, next) {
  try {
    const id = Number(req.params.id)
    const existing = await prisma.apifyToken.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Token no encontrado' })

    await prisma.apifyToken.delete({ where: { id } })
    invalidateApifyTokensCache()
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ─── Consumo (ApifyUsageLog) ────────────────────────────────────────────────────

/**
 * GET /api/superadmin/apify-usage?period=all|30d|7d
 * Distribución de llamados por plataforma+función y por workspace→proyecto.
 * No incluye $ (eso sale de getAccountsUsage, en vivo contra la API de Apify).
 */
async function getUsageStats(req, res, next) {
  try {
    const { period = 'all' } = req.query
    let dateFilter = {}
    if (period === '30d') {
      const from = new Date(); from.setDate(from.getDate() - 30)
      dateFilter = { createdAt: { gte: from } }
    } else if (period === '7d') {
      const from = new Date(); from.setDate(from.getDate() - 7)
      dateFilter = { createdAt: { gte: from } }
    }

    const [byFunctionRaw, byWsProjRaw, workspaces] = await Promise.all([
      prisma.apifyUsageLog.groupBy({
        by:      ['platform', 'action', 'success'],
        where:   dateFilter,
        _count:  { _all: true },
        _sum:    { itemCount: true },
      }),
      prisma.apifyUsageLog.groupBy({
        by:     ['workspaceId', 'projectId', 'success'],
        where:  dateFilter,
        _count: { _all: true },
        _sum:   { itemCount: true },
      }),
      prisma.workspace.findMany({ select: { id: true, name: true, slug: true, status: true } }),
    ])

    const wsMap = Object.fromEntries(workspaces.map(w => [w.id, w]))
    const projectIds = [...new Set(byWsProjRaw.map(r => r.projectId).filter(Boolean))]
    const projects = projectIds.length
      ? await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } })
      : []
    const projMap = Object.fromEntries(projects.map(p => [p.id, p]))

    // Uso por plataforma + función
    const fnMap = {}
    for (const row of byFunctionRaw) {
      const key = `${row.platform}::${row.action}`
      if (!fnMap[key]) fnMap[key] = { platform: row.platform, action: row.action, calls: 0, success: 0, errors: 0, items: 0 }
      const n = row._count._all
      fnMap[key].calls += n
      if (row.success) fnMap[key].success += n
      else fnMap[key].errors += n
      fnMap[key].items += row._sum.itemCount || 0
    }
    const byFunction = Object.values(fnMap).sort((a, b) => b.calls - a.calls)

    // Ranking por workspace, expandible a proyecto
    const wsAgg = {}
    for (const row of byWsProjRaw) {
      const wid = row.workspaceId
      if (!wsAgg[wid]) {
        wsAgg[wid] = {
          workspaceId: wid,
          name:        wid != null ? (wsMap[wid]?.name  ?? `Workspace #${wid}`) : 'Sin workspace',
          slug:        wid != null ? (wsMap[wid]?.slug  ?? '') : '',
          status:      wid != null ? (wsMap[wid]?.status ?? 'unknown') : '',
          calls: 0, success: 0, errors: 0, items: 0,
          byProject: {},
        }
      }
      const n = row._count._all
      wsAgg[wid].calls += n
      if (row.success) wsAgg[wid].success += n
      else wsAgg[wid].errors += n
      wsAgg[wid].items += row._sum.itemCount || 0

      const pkey = row.projectId ?? 'none'
      if (!wsAgg[wid].byProject[pkey]) {
        wsAgg[wid].byProject[pkey] = {
          projectId: row.projectId,
          name:      row.projectId != null ? (projMap[row.projectId]?.name ?? `Proyecto #${row.projectId}`) : 'Sin proyecto',
          calls: 0, success: 0, errors: 0, items: 0,
        }
      }
      wsAgg[wid].byProject[pkey].calls += n
      if (row.success) wsAgg[wid].byProject[pkey].success += n
      else wsAgg[wid].byProject[pkey].errors += n
      wsAgg[wid].byProject[pkey].items += row._sum.itemCount || 0
    }
    const byWorkspace = Object.values(wsAgg)
      .map(w => ({ ...w, byProject: Object.values(w.byProject).sort((a, b) => b.calls - a.calls) }))
      .sort((a, b) => b.calls - a.calls)

    const totalCalls   = byFunction.reduce((s, r) => s + r.calls, 0)
    const totalSuccess = byFunction.reduce((s, r) => s + r.success, 0)
    const totalErrors  = byFunction.reduce((s, r) => s + r.errors, 0)
    const totalItems   = byFunction.reduce((s, r) => s + r.items, 0)

    res.json({ period, totalCalls, totalSuccess, totalErrors, totalItems, byFunction, byWorkspace })
  } catch (err) { next(err) }
}

// Caché in-memory 5 min para no pegarle a la API de Apify en cada render del panel.
const ACCOUNTS_USAGE_TTL_MS = 5 * 60 * 1000
let accountsUsageCache = null // { data, expiresAt }

/**
 * GET /api/superadmin/apify-accounts-usage
 * Gasto real del mes en curso por cada cuenta de Apify, consultado en vivo
 * (GET /v2/users/me/usage/monthly) — mismo número que el dashboard de Apify.
 * Best-effort por cuenta: si una falla, el resto se muestra igual.
 */
async function getAccountsUsage(req, res, next) {
  try {
    const now = Date.now()
    if (accountsUsageCache && accountsUsageCache.expiresAt > now) {
      return res.json(accountsUsageCache.data)
    }

    const tokens = await prisma.apifyToken.findMany({ orderBy: { order: 'asc' } })
    const today = new Date()
    const dateParam = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

    const results = await Promise.all(tokens.map(async (t) => {
      try {
        const plain = decrypt(t.token)
        const { data } = await axios.get('https://api.apify.com/v2/users/me/usage/monthly', {
          params:  { token: plain, date: dateParam },
          timeout: 15000,
        })
        const d = data?.data ?? {}
        return {
          tokenId: t.id,
          label:   t.label,
          active:  t.active,
          totalUsageCreditsUsdAfterVolumeDiscount: d.totalUsageCreditsUsdAfterVolumeDiscount ?? null,
          usageCycle: d.usageCycle ?? null,
          error: null,
        }
      } catch (err) {
        return {
          tokenId: t.id,
          label:   t.label,
          active:  t.active,
          totalUsageCreditsUsdAfterVolumeDiscount: null,
          usageCycle: null,
          error: err.response?.data?.error?.message || err.message,
        }
      }
    }))

    accountsUsageCache = { data: results, expiresAt: now + ACCOUNTS_USAGE_TTL_MS }
    res.json(results)
  } catch (err) { next(err) }
}

module.exports = {
  listTokens, createToken, updateToken, reorderTokens, toggleToken, deleteToken,
  getUsageStats, getAccountsUsage,
}
