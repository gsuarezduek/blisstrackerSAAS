const prisma = require('../lib/prisma')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeParseArr(str) {
  try { return JSON.parse(str || '[]') } catch { return [] }
}

function str(v, max = 500)  { return v !== undefined ? String(v).slice(0, max) : undefined }
function arr(v, max = 7)    {
  if (!Array.isArray(v)) return undefined
  return JSON.stringify(
    v.map(x => (typeof x === 'string' ? x.trim() : '')).filter(Boolean).slice(0, max)
  )
}

function formatRecord(r) {
  return {
    // Enfoque Medular
    coreValues:    safeParseArr(r.coreValues),
    purpose:       r.purpose ?? '',
    niche:         r.niche   ?? '',
    // Meta a 10 años
    tenYearTarget: r.tenYearTarget ?? '',
    // Estrategia de Marketing
    marketingTarget:    r.marketingTarget    ?? '',
    marketingUniques:   safeParseArr(r.marketingUniques),
    marketingProcess:   r.marketingProcess   ?? '',
    marketingGuarantee: r.marketingGuarantee ?? '',
    // Imagen a 3 años
    threeYearRevenue:     r.threeYearRevenue     ?? '',
    threeYearProfit:      r.threeYearProfit      ?? '',
    threeYearHeadcount:   r.threeYearHeadcount   ?? '',
    threeYearDescription: r.threeYearDescription ?? '',
    threeYearGoals:       safeParseArr(r.threeYearGoals),
    // Plan a 1 año
    oneYearRevenue: r.oneYearRevenue ?? '',
    oneYearProfit:  r.oneYearProfit  ?? '',
    oneYearGoals:   safeParseArr(r.oneYearGoals),
  }
}

// ─── Controladores ────────────────────────────────────────────────────────────

async function getEOS(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    let record = await prisma.eOSData.findUnique({ where: { workspaceId } })
    if (!record) record = await prisma.eOSData.create({ data: { workspaceId } })
    res.json(formatRecord(record))
  } catch (err) { next(err) }
}

async function updateEOS(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const b = req.body
    const u = {}

    // Enfoque Medular
    if (Array.isArray(b.coreValues))    u.coreValues    = arr(b.coreValues, 7)
    if (b.purpose       !== undefined)  u.purpose       = str(b.purpose, 500)
    if (b.niche         !== undefined)  u.niche         = str(b.niche,   500)
    // Meta a 10 años
    if (b.tenYearTarget !== undefined)  u.tenYearTarget = str(b.tenYearTarget, 1000)
    // Estrategia de Marketing
    if (b.marketingTarget    !== undefined) u.marketingTarget    = str(b.marketingTarget, 1000)
    if (Array.isArray(b.marketingUniques))  u.marketingUniques   = arr(b.marketingUniques, 3)
    if (b.marketingProcess   !== undefined) u.marketingProcess   = str(b.marketingProcess, 2000)
    if (b.marketingGuarantee !== undefined) u.marketingGuarantee = str(b.marketingGuarantee, 500)
    // Imagen a 3 años
    if (b.threeYearRevenue     !== undefined) u.threeYearRevenue     = str(b.threeYearRevenue,     200)
    if (b.threeYearProfit      !== undefined) u.threeYearProfit      = str(b.threeYearProfit,      200)
    if (b.threeYearHeadcount   !== undefined) u.threeYearHeadcount   = str(b.threeYearHeadcount,   200)
    if (b.threeYearDescription !== undefined) u.threeYearDescription = str(b.threeYearDescription, 2000)
    if (Array.isArray(b.threeYearGoals))      u.threeYearGoals       = arr(b.threeYearGoals, 7)
    // Plan a 1 año
    if (b.oneYearRevenue !== undefined)  u.oneYearRevenue = str(b.oneYearRevenue, 200)
    if (b.oneYearProfit  !== undefined)  u.oneYearProfit  = str(b.oneYearProfit,  200)
    if (Array.isArray(b.oneYearGoals))   u.oneYearGoals   = arr(b.oneYearGoals, 7)

    const record = await prisma.eOSData.upsert({
      where:  { workspaceId },
      update: u,
      create: { workspaceId, ...u },
    })
    res.json(formatRecord(record))
  } catch (err) { next(err) }
}

module.exports = { getEOS, updateEOS }
