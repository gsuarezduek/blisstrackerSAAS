/**
 * Auditoría genérica de Finanzas — un único modelo (FinanceAuditLog) reusado
 * por todas las entidades del módulo, en vez de un log por entidad. Mismo
 * shape de propósito que PlatformSettingLog (oldValue/newValue), generalizado
 * a un array de diffs por campo + una línea legible precomputada (mismo
 * criterio que LeadActivity.content: el frontend no tiene que saber formatear
 * cada tipo de campo, solo pintar `summary`).
 *
 * Best-effort: `logFinanceAudit` nunca lanza (mismo criterio que
 * `logLeadEvent` en controllers/ventas/_shared.js) — un fallo de logging no
 * debe tumbar la operación principal.
 */
const prisma = require('./prisma')

function fmtAuditDate(v) {
  if (v == null) return '—'
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleDateString('es-AR')
}

function fmtAuditMoney(v) {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
}

function fmtAuditPercent(v) {
  if (v == null) return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return `${n.toLocaleString('es-AR', { maximumFractionDigits: 3 })}%`
}

function fmtAuditBoolean(v) {
  return v ? 'Sí' : 'No'
}

function fmtAuditPlain(v) {
  if (v == null || v === '') return '—'
  if (typeof v === 'boolean') return fmtAuditBoolean(v)
  return String(v)
}

const FORMATTERS = {
  money:   fmtAuditMoney,
  date:    fmtAuditDate,
  percent: fmtAuditPercent,
  boolean: fmtAuditBoolean,
  plain:   fmtAuditPlain,
}

// Compara dos valores tolerando que uno venga como Decimal/string (Prisma
// Decimal) y el otro como number del body — evita falsos "cambios" por mera
// diferencia de representación (ej. "1200000.00000000" vs 1200000).
function valuesEqual(a, b) {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (a instanceof Date || b instanceof Date) {
    return new Date(a).getTime() === new Date(b).getTime()
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b
  const na = Number(a)
  const nb = Number(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb) && a !== '' && b !== '') return na === nb
  return a === b
}

/**
 * Diffea `before`/`after` contra `fieldLabels` ({ field: { label, format? } })
 * — solo compara los campos listados (evita que relaciones/campos internos
 * ensucien el diff). `format` es una key de FORMATTERS (default 'plain').
 */
function diffFields(before, after, fieldLabels) {
  const changes = []
  for (const [field, meta] of Object.entries(fieldLabels || {})) {
    const oldValue = before ? before[field] : undefined
    const newValue = after ? after[field] : undefined
    if (valuesEqual(oldValue, newValue)) continue
    const format = FORMATTERS[meta.format] || fmtAuditPlain
    changes.push({
      field,
      label: meta.label,
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
      oldDisplay: format(oldValue),
      newDisplay: format(newValue),
    })
  }
  return changes
}

function summarize(action, entityLabel, changes) {
  if (action === 'create')  return `Creó ${entityLabel}`
  if (action === 'delete')  return `Eliminó ${entityLabel}`
  if (action === 'restore') return `Restauró ${entityLabel}`
  if (!changes.length) return `Editó ${entityLabel}`
  if (changes.length === 1) {
    const c = changes[0]
    return `Cambió ${c.label.toLowerCase()}: ${c.oldDisplay} → ${c.newDisplay}`
  }
  return `Cambió ${changes.map(c => c.label.toLowerCase()).join(', ')}`
}

/**
 * Registra una entrada de auditoría. En 'update' con `before`/`after` +
 * `fieldLabels`, si no hay ningún cambio real no escribe nada (evita ensuciar
 * el historial con un "Editó X" vacío).
 * @param {object} params
 * @param {number} params.workspaceId
 * @param {string} params.entityType - ver financeCatalog.js AUDIT_ENTITY_TYPES
 * @param {number} params.entityId
 * @param {'create'|'update'|'delete'|'restore'} params.action
 * @param {number|null} [params.userId]
 * @param {object} [params.before] - solo para 'update'
 * @param {object} [params.after] - solo para 'update'
 * @param {object} [params.fieldLabels] - solo para 'update', { field: { label, format? } }
 * @param {string} [params.entityLabel] - texto humano de la entidad para el summary (ej. nombre del item/cuenta). Default: entityType.
 * @param {string} [params.summary] - override del summary autogenerado, para cambios que no son un diff de campos simples (ej. sincronizar una relación N a N). Si se pasa, `before`/`after`/`fieldLabels` se ignoran.
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} [params.client] - prisma o una tx
 */
async function logFinanceAudit({ workspaceId, entityType, entityId, action, userId = null, before, after, fieldLabels, entityLabel, summary: summaryOverride, client = prisma }) {
  try {
    const changes = (action === 'update' && !summaryOverride) ? diffFields(before, after, fieldLabels) : null
    if (action === 'update' && !summaryOverride && (!changes || changes.length === 0)) return null
    const summary = summaryOverride || summarize(action, entityLabel || entityType, changes || [])
    return await client.financeAuditLog.create({
      data: {
        workspaceId,
        entityType,
        entityId,
        action,
        summary,
        changes: changes && changes.length ? changes : undefined,
        userId,
      },
    })
  } catch (err) {
    console.error('[financeAudit] fallo al registrar auditoría:', err)
    return null
  }
}

module.exports = {
  logFinanceAudit,
  diffFields,
  fmtAuditMoney,
  fmtAuditDate,
  fmtAuditPercent,
  fmtAuditBoolean,
  fmtAuditPlain,
}
