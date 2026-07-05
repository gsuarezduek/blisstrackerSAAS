const prisma = require('../lib/prisma')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeParseArr(str) {
  try { return JSON.parse(str || '[]') } catch { return [] }
}

// coreValues se almacena como JSON [{name, description}]. Para datos legacy
// (strings sueltos), se normaliza al leer y al guardar.
function normalizeCoreValue(item) {
  if (typeof item === 'string') {
    const name = item.trim()
    return name ? { name, description: '' } : null
  }
  if (item && typeof item === 'object') {
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 200) : ''
    if (!name) return null
    const description = typeof item.description === 'string' ? item.description.trim().slice(0, 1000) : ''
    return { name, description }
  }
  return null
}

function parseCoreValues(raw) {
  return safeParseArr(raw).map(normalizeCoreValue).filter(Boolean)
}

function coreValuesArr(v, max = 7) {
  if (!Array.isArray(v)) return undefined
  return JSON.stringify(v.map(normalizeCoreValue).filter(Boolean).slice(0, max))
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
    coreValues:    parseCoreValues(r.coreValues),
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
    oneYearDate:    r.oneYearDate    ?? '',
    oneYearRevenue: r.oneYearRevenue ?? '',
    oneYearProfit:  r.oneYearProfit  ?? '',
    oneYearGoals:   safeParseArr(r.oneYearGoals),
    // Reuniones L10 — proyecto por defecto para las tareas de participantes
    meetingProjectId: r.meetingProjectId ?? null,
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
    if (Array.isArray(b.coreValues))    u.coreValues    = coreValuesArr(b.coreValues, 7)
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
    if (b.oneYearDate    !== undefined)  u.oneYearDate    = str(b.oneYearDate,    20)
    if (b.oneYearRevenue !== undefined)  u.oneYearRevenue = str(b.oneYearRevenue, 200)
    if (b.oneYearProfit  !== undefined)  u.oneYearProfit  = str(b.oneYearProfit,  200)
    if (Array.isArray(b.oneYearGoals))   u.oneYearGoals   = arr(b.oneYearGoals, 7)

    // Reuniones L10 — proyecto por defecto para las tareas de participantes
    if (b.meetingProjectId !== undefined) {
      const pid = b.meetingProjectId ? Number(b.meetingProjectId) : null
      if (pid) {
        const project = await prisma.project.findFirst({
          where: { id: pid, workspaceId, active: true }, select: { id: true },
        })
        if (!project) return res.status(400).json({ error: 'Proyecto inválido' })
      }
      u.meetingProjectId = pid
    }

    const record = await prisma.eOSData.upsert({
      where:  { workspaceId },
      update: u,
      create: { workspaceId, ...u },
    })
    res.json(formatRecord(record))
  } catch (err) { next(err) }
}

module.exports = { getEOS, updateEOS }
