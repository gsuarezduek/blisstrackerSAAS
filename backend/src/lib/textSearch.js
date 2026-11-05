// Búsqueda por texto tolerante a tildes, sin extensiones de Postgres.
//
// `contains` + `mode: 'insensitive'` de Prisma es ILIKE: ignora mayúsculas pero NO
// tildes ("aprobacion" no encuentra "aprobación"), y exige la subcadena exacta
// ("redactar posteos" no encuentra "Redactar 3 posteos"). Para un agente que busca
// antes de crear, cualquiera de las dos cosas le hace creer que la tarea no existe
// y la duplica.
//
// La solución canónica es la extensión `unaccent` + un índice de expresión, pero eso
// es una migración y un cambio que debería abarcar también al buscador global de la
// app (controllers/search.controller.js, que tiene la misma limitación). Mientras
// tanto, acá se explota una regla de la ortografía española: **una palabra lleva
// como máximo una tilde**. Así las variantes de una palabra escrita sin tildes son
// LINEALES (una por vocal), no combinatorias, y la consulta se puede expresar con
// Prisma puro: cada palabra es un OR de variantes, y las palabras se combinan con AND.

// Vocal (y ñ) → su forma acentuada. La ñ entra porque "manana" por "mañana" es el
// mismo tipo de error de tipeo que la tilde.
const ACCENTED = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', n: 'ñ' }
const PLAIN = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', à: 'a', è: 'e', ì: 'i', ò: 'o', ù: 'u', ä: 'a', ë: 'e', ï: 'i', ö: 'o' }

const MIN_WORD = 2       // una sola letra matchea todo: no aporta nada como filtro
const MAX_WORDS = 6      // más que eso no es una búsqueda, y cada palabra cuesta un OR
const MAX_WORD_LEN = 30  // una "palabra" más larga que esto no es una palabra

/** Quita tildes y diéresis de un texto (deja la ñ como n). */
function stripAccents(text) {
  return String(text).replace(/[áéíóúüñàèìòùäëïö]/gi, ch => {
    const lower = ch.toLowerCase()
    const plain = PLAIN[lower] ?? lower
    return ch === lower ? plain : plain.toUpperCase()
  })
}

/**
 * Variantes de una palabra que ILIKE no encontraría por culpa de las tildes:
 * la palabra tal cual, su versión sin tildes, y la versión sin tildes con UNA
 * tilde en cada posición posible (la regla del español: una tilde por palabra).
 * Siempre en minúscula — de la diferencia de mayúsculas se encarga ILIKE.
 */
function accentVariants(word) {
  const lower = String(word).toLowerCase()
  const base = stripAccents(lower)
  const out = new Set([lower, base])
  for (let i = 0; i < base.length; i++) {
    const accented = ACCENTED[base[i]]
    if (accented) out.add(base.slice(0, i) + accented + base.slice(i + 1))
  }
  return [...out]
}

// Normaliza la forma de declarar los campos a buscar. Un campo puede ser:
//   - el nombre de una columna: 'description'
//   - una función que recibe el patrón y devuelve el fragmento de where, para los
//     campos de una relación: p => ({ company: { name: p } })
// Así un solo helper cubre tanto "buscá en el título" como "buscá en el título, en el
// nombre de la empresa o en algún mensaje de la conversación".
function toPlacers(fields) {
  return (Array.isArray(fields) ? fields : [fields]).map(field =>
    typeof field === 'function' ? field : (pattern => ({ [field]: pattern }))
  )
}

/**
 * Filtro de Prisma para buscar `q` en uno o varios campos de texto: las palabras se
 * combinan con AND (pueden estar en cualquier orden y con cualquier cosa en el medio),
 * cada palabra tolera tildes, y con varios campos cada palabra puede aparecer en
 * cualquiera de ellos ("acme propuesta" encuentra un lead titulado "Propuesta" de la
 * empresa "ACME").
 *
 * Devuelve un array de condiciones para poner en un `AND`, o null si no hay nada
 * que buscar. El caller decide dónde enchufarlo.
 *
 *   buildTextSearchFilters('aprobacion posteos', 'description')
 *   → [{ OR: [{ description: { contains: 'aprobacion', mode: 'insensitive' } }, …] },
 *      { OR: [{ description: { contains: 'posteos',    mode: 'insensitive' } }, …] }]
 *
 *   buildTextSearchFilters('acme', ['title', p => ({ company: { name: p } })])
 *   → [{ OR: [{ title: {…} }, { company: { name: {…} } }, …] }]
 */
function buildTextSearchFilters(q, fields) {
  if (typeof q !== 'string' || !q.trim()) return null
  const placers = toPlacers(fields)
  const pattern = value => ({ contains: value, mode: 'insensitive' })

  const words = q.trim().split(/\s+/)
    .filter(w => w.length >= MIN_WORD && w.length <= MAX_WORD_LEN)
    .slice(0, MAX_WORDS)

  // Sin palabras útiles (ej. "a 1") se busca la frase tal cual: mejor eso que
  // devolver todo porque el filtro se evaporó.
  if (words.length === 0) {
    const literal = pattern(q.trim())
    return [{ OR: placers.map(place => place(literal)) }]
  }

  return words.map(word => ({
    OR: accentVariants(word).flatMap(variant => placers.map(place => place(pattern(variant)))),
  }))
}

/**
 * Igual que buildTextSearchFilters pero devuelve un único objeto listo para mezclar
 * en un `where` (`{ AND: […] }`), o `null`. Azucar para los controllers que ya tienen
 * su where armado y solo quieren sumarle la búsqueda.
 */
function textSearchWhere(q, fields) {
  const filters = buildTextSearchFilters(q, fields)
  return filters ? { AND: filters } : null
}

module.exports = { stripAccents, accentVariants, buildTextSearchFilters, textSearchWhere, MAX_WORDS }
