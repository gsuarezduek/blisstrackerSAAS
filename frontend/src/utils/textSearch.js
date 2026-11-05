// Búsqueda de texto que ignora tildes, para todos los filtros que corren en el
// browser (command palette, selectores de persona/proyecto/empresa, listas de RRHH,
// Wiki, etc.).
//
// El patrón que había en ~25 lugares era `campo.toLowerCase().includes(q.toLowerCase())`:
// ignora mayúsculas pero no tildes, así que buscar "perez" no encontraba a "Pérez" ni
// "diseno" a "Diseño". Acá se arregla de verdad y sin trucos, porque del lado del
// browser tenemos las DOS cadenas en memoria: se normalizan las dos y se comparan.
// (El backend no puede hacer esto — ahí la comparación la hace Postgres sobre filas
// que no están en memoria — y usa otra estrategia; ver backend/src/lib/textSearch.js.)
//
// NFD separa cada letra acentuada en letra + marca diacrítica, y la regex borra las
// marcas: "Pérez" → "Perez", "Diseño" → "Diseno", "pingüino" → "pinguino".

/** Minúsculas y sin tildes/diéresis. Tolera null/undefined/números. */
export function normalizeText(value) {
  if (value == null) return ''
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Posición de `needle` dentro de `haystack`, ignorando mayúsculas y tildes.
 * -1 si no está. Devuelve la posición (y no un booleano) porque varios lugares
 * ordenan los resultados por "qué tan al principio matcheó".
 */
export function searchIndexOf(haystack, needle) {
  const target = normalizeText(needle)
  if (!target) return 0
  return normalizeText(haystack).indexOf(target)
}

/** ¿`haystack` contiene `needle`, ignorando mayúsculas y tildes? */
export function matchesSearch(haystack, needle) {
  return searchIndexOf(haystack, needle) !== -1
}

/**
 * ¿Alguno de los campos contiene `needle`? Para las listas que buscan en varios
 * campos a la vez (nombre + email + rol). Ignora los campos vacíos.
 */
export function matchesAnyField(fields, needle) {
  if (!normalizeText(needle)) return true
  return fields.some(field => field != null && field !== '' && matchesSearch(field, needle))
}
