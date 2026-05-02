const prisma = require('../lib/prisma')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeParseArr(str) {
  try { return JSON.parse(str || '[]') } catch { return [] }
}

function formatRecord(record) {
  return {
    coreValues:    safeParseArr(record.coreValues),
    purpose:       record.purpose       ?? '',
    niche:         record.niche         ?? '',
    tenYearTarget: record.tenYearTarget ?? '',
  }
}

// ─── Controladores ────────────────────────────────────────────────────────────

/**
 * GET /api/eos
 * Obtiene (o crea) el registro EOSData del workspace actual.
 */
async function getEOS(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    let record = await prisma.eOSData.findUnique({ where: { workspaceId } })
    if (!record) {
      record = await prisma.eOSData.create({ data: { workspaceId } })
    }

    res.json(formatRecord(record))
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /api/eos
 * Actualiza campos del registro EOSData.
 * body: { coreValues?: string[], purpose?: string, niche?: string }
 */
async function updateEOS(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { coreValues, purpose, niche, tenYearTarget } = req.body

    const updateData = {}

    if (Array.isArray(coreValues)) {
      const clean = coreValues
        .map(v => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean)
        .slice(0, 7)
      updateData.coreValues = JSON.stringify(clean)
    }

    if (purpose       !== undefined) updateData.purpose       = String(purpose).slice(0, 500)
    if (niche         !== undefined) updateData.niche         = String(niche).slice(0, 500)
    if (tenYearTarget !== undefined) updateData.tenYearTarget = String(tenYearTarget).slice(0, 1000)

    const record = await prisma.eOSData.upsert({
      where:  { workspaceId },
      update: updateData,
      create: { workspaceId, ...updateData },
    })

    res.json(formatRecord(record))
  } catch (err) {
    next(err)
  }
}

module.exports = { getEOS, updateEOS }
