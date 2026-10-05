// Helpers puros (sin JSX) del V/TO (Vision/Traction Organizer™) de EOS —
// detección de HTML legado y formato de trimestre/fecha. Compartidos por
// VisionTab, VTOView y printVTO.

// Detecta si un string contiene HTML (vs. texto plano legado)
export function isHtml(value) {
  return typeof value === 'string' && /<\/?[a-z][\s\S]*>/i.test(value)
}

// ─── Helpers de tiempo (para VTO) ────────────────────────────────────────────

export function currentQuarterStr() {
  const now = new Date()
  return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`
}

export function quarterLabel(q) {
  if (!q) return ''
  const [year, qPart] = q.split('-')
  return `${qPart} ${year}`
}

// Formatea una fecha "YYYY-MM-DD" a algo legible (ej: "31 dic 2026"). Sin parseo TZ
// (se arma la fecha en local con los componentes para evitar corrimientos de día).
export function formatDateLabel(value) {
  if (!value) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return value
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (isNaN(d)) return value
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}
