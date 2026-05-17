const prisma = require('../lib/prisma')
const {
  getAllSettings,
  invalidateCache,
  clampToBounds,
} = require('../lib/platformSettings')
const { SETTINGS_BY_KEY } = require('../config/platformSettings')
const { previewWeeklyCleanup, runWeeklyCleanup } = require('../services/cleanup.service')

/**
 * GET /api/superadmin/settings
 * Devuelve todos los settings con su metadata + valor actual.
 */
async function listSettings(req, res, next) {
  try {
    const settings = await getAllSettings()
    res.json({ settings })
  } catch (err) { next(err) }
}

/**
 * PUT /api/superadmin/settings
 * Body: { changes: { key1: value1, key2: value2, ... } }
 * Valida tipos, bounds, cross-field. Aplica en transacción.
 * Escribe PlatformSettingLog por cada cambio efectivo.
 */
async function updateSettings(req, res, next) {
  try {
    const { changes } = req.body
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      return res.status(400).json({ error: 'Body debe ser { changes: { key: value, ... } }' })
    }

    const entries = Object.entries(changes)
    if (entries.length === 0) return res.status(400).json({ error: 'No hay cambios' })

    // 1. Validar tipos + bounds por key
    const errors = {}
    for (const [key, value] of entries) {
      const meta = SETTINGS_BY_KEY[key]
      if (!meta) {
        errors[key] = `Key desconocida: ${key}`
        continue
      }
      const clamped = clampToBounds(meta, value)
      if (clamped == null && value !== null) {
        const range = meta.min != null || meta.max != null
          ? ` (rango: ${meta.min ?? '-∞'}–${meta.max ?? '∞'})`
          : ''
        errors[key] = `Valor inválido para tipo ${meta.type}${range}`
      }
    }
    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Validación falló', details: errors })
    }

    // 2. Validación cross-field — tokenCriticalPct debe ser > tokenWarningPct
    // (considerando los valores actuales en DB para los que no están en el batch)
    if ('tokenWarningPct' in changes || 'tokenCriticalPct' in changes) {
      const currentRows = await prisma.platformSetting.findMany({
        where: { key: { in: ['tokenWarningPct', 'tokenCriticalPct'] } },
      })
      const current = Object.fromEntries(
        currentRows.map(r => [r.key, r.value?.value])
      )
      const warning  = changes.tokenWarningPct  ?? current.tokenWarningPct  ?? SETTINGS_BY_KEY.tokenWarningPct.default
      const critical = changes.tokenCriticalPct ?? current.tokenCriticalPct ?? SETTINGS_BY_KEY.tokenCriticalPct.default
      if (critical <= warning) {
        return res.status(400).json({
          error: 'Validación cross-field falló',
          details: { tokenCriticalPct: 'Debe ser mayor que tokenWarningPct' },
        })
      }
    }

    // 3. Aplicar en transacción + audit log
    const userId = req.user.userId
    const applied = await prisma.$transaction(async tx => {
      const result = []
      for (const [key, value] of entries) {
        const existing = await tx.platformSetting.findUnique({ where: { key } })
        const oldValue = existing?.value ?? null
        const newValue = { value }

        // Skip si el valor es idéntico (evita logs ruidosos)
        if (oldValue && JSON.stringify(oldValue.value) === JSON.stringify(value)) continue

        await tx.platformSetting.upsert({
          where:  { key },
          create: { key, value: newValue, description: SETTINGS_BY_KEY[key].help },
          update: { value: newValue },
        })
        await tx.platformSettingLog.create({
          data: { settingKey: key, oldValue, newValue, changedById: userId },
        })
        result.push({ key, oldValue: oldValue?.value, newValue: value })
      }
      return result
    })

    invalidateCache()

    res.json({ updated: applied.length, changes: applied })
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/settings/log?key=&limit=20
 * Historial de cambios. Filtrable por key.
 */
async function listLog(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 200)
    const where = {}
    if (req.query.key) where.settingKey = req.query.key

    const logs = await prisma.platformSettingLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take:    limit,
      include: {
        changedBy: { select: { id: true, name: true, email: true, avatar: true } },
      },
    })

    res.json({ logs })
  } catch (err) { next(err) }
}

/**
 * GET /api/superadmin/settings/cleanup-preview?tables=notifications,emailLog
 * Cuántas filas se borrarían con los retention settings actuales.
 */
async function previewCleanup(req, res, next) {
  try {
    const tables = req.query.tables ? req.query.tables.split(',').map(s => s.trim()) : null
    const preview = await previewWeeklyCleanup(tables)
    res.json({ preview })
  } catch (err) { next(err) }
}

/**
 * POST /api/superadmin/settings/cleanup-now
 * Body: { tables?: string[] } — corre cleanup inmediato con los retention actuales.
 */
async function runCleanup(req, res, next) {
  try {
    const tables = Array.isArray(req.body?.tables) ? req.body.tables : null
    const deleted = await runWeeklyCleanup(tables)
    console.log(`[ManualCleanup] Disparado por user #${req.user.userId}:`, deleted)
    res.json({ deleted })
  } catch (err) { next(err) }
}

module.exports = { listSettings, updateSettings, listLog, previewCleanup, runCleanup }
