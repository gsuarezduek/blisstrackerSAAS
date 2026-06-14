// People Score del equipo (EOS — Analizador de Personas).
// Fuente única de la fórmula, compartida entre la sección Personas (EOS) y RRHH.
//
// Puntos por calificación: + = 1 (100%) · +/− = 0.5 (50%) · − = 0 (0%).
// El score es el promedio SOLO de las celdas calificadas (las vacías no cuentan).

const RATING_POINTS = { '+': 1, '+/-': 0.5, '-': 0 }
const GWC_KEYS = ['gwc_get', 'gwc_want', 'gwc_capacity']

// Construye las claves de columna del analizador: un Valor Medular por nombre + G/W/C.
// coreValues puede ser un array de strings o de objetos { name, description }.
export function peopleColumnKeys(coreValues = []) {
  const valueKeys = (coreValues || [])
    .map(v => (typeof v === 'string' ? v : v?.name ?? ''))
    .filter(Boolean)
  return [...valueKeys, ...GWC_KEYS]
}

// Devuelve { score, rightPeople, total }.
//  - score: 0–100 (promedio de celdas calificadas) o null si no hay ninguna.
//  - rightPeople: personas con + en TODAS sus columnas (Right Person, Right Seat).
//  - total: cantidad de personas evaluadas.
export function computePeopleScore(members = [], columnKeys = [], ratingsMap = {}) {
  let sum = 0, rated = 0, rightPeople = 0
  members.forEach(m => {
    const r = ratingsMap[m.id] || {}
    let allPlus = columnKeys.length > 0
    columnKeys.forEach(key => {
      const v = r[key]
      if (v != null) { sum += RATING_POINTS[v]; rated++ }
      if (v !== '+') allPlus = false
    })
    if (allPlus) rightPeople++
  })
  return {
    score: rated > 0 ? Math.round((sum / rated) * 100) : null,
    rightPeople,
    total: members.length,
  }
}

// Banda de color + etiqueta según el score (≥80 verde · ≥50 ámbar · <50 rojo).
export function scoreBand(score) {
  if (score == null) return { label: 'Sin evaluar',       text: 'text-gray-500 dark:text-gray-400',   bar: 'bg-gray-300 dark:bg-gray-600', ring: 'border-gray-200 dark:border-gray-700' }
  if (score >= 80)   return { label: 'Equipo saludable',  text: 'text-green-600 dark:text-green-400',  bar: 'bg-green-500',                 ring: 'border-green-200 dark:border-green-800' }
  if (score >= 50)   return { label: 'Requiere atención', text: 'text-amber-600 dark:text-amber-400',  bar: 'bg-amber-500',                 ring: 'border-amber-200 dark:border-amber-800' }
  return               { label: 'Crítico',                text: 'text-red-600 dark:text-red-400',      bar: 'bg-red-500',                   ring: 'border-red-200 dark:border-red-800' }
}
