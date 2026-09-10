// Analizador de Personas (EOS) — helpers puros compartidos entre el controller y el
// servicio de snapshots mensuales. Espejo de frontend/src/utils/peopleScore.js (no hay
// código compartido entre frontend/backend en este repo, se mantienen en sync a mano).

function safeArr(str) { try { return JSON.parse(str || '[]') } catch { return [] } }

// Normaliza coreValues — soporta legacy (strings) y nuevo formato ({name, description})
function parseCoreValues(raw) {
  return safeArr(raw).map(item => {
    if (typeof item === 'string') {
      const name = item.trim()
      return name ? { name, description: '' } : null
    }
    if (item && typeof item === 'object' && typeof item.name === 'string' && item.name.trim()) {
      return {
        name: item.name.trim(),
        description: typeof item.description === 'string' ? item.description : '',
      }
    }
    return null
  }).filter(Boolean)
}

const GWC_KEYS = ['gwc_get', 'gwc_want', 'gwc_capacity']
const RATING_POINTS = { '+': 1, '+/-': 0.5, '-': 0 }

// Construye las claves de columna del analizador: un Valor Medular por nombre + G/W/C.
function peopleColumnKeys(coreValues = []) {
  const valueKeys = (coreValues || [])
    .map(v => (typeof v === 'string' ? v : v?.name ?? ''))
    .filter(Boolean)
  return [...valueKeys, ...GWC_KEYS]
}

// Devuelve { score, rightPeople, total }.
//  - score: 0–100 (promedio de celdas calificadas) o null si no hay ninguna.
//  - rightPeople: personas con + en TODAS sus columnas (Right Person, Right Seat).
//  - total: cantidad de personas evaluadas.
function computePeopleScore(members = [], columnKeys = [], ratingsMap = {}) {
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

module.exports = { safeArr, parseCoreValues, peopleColumnKeys, computePeopleScore, GWC_KEYS }
