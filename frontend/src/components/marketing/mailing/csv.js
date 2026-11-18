// Parser de CSV del lado del browser para importar contactos (espejo del de
// backend/src/lib/backlinksCsv.js): RFC-4180, BOM de Excel, CRLF y separador
// autodetectado — `;` en el Excel en español, tab en algunas herramientas.
// Se parsea acá y no en el servidor para poder mostrar el mapeo de columnas
// antes de mandar nada, y mandar tandas que entren en el límite de 1 MB del body.

export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function detectSeparator(headerLine) {
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (const ch of headerLine) {
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (!inQuotes && ch in counts) counts[ch]++
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : ','
}

export function parseCsv(text, sep) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === sep) { row.push(field); field = '' }
    else if (ch === '\r') continue
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.length > 1 || (r[0] ?? '').trim() !== '')
}

function norm(h) {
  return String(h || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const GUESS = {
  email:     ['email', 'e mail', 'mail', 'correo', 'correo electronico', 'email address'],
  firstName: ['nombre', 'first name', 'firstname', 'name', 'nombres'],
  lastName:  ['apellido', 'last name', 'lastname', 'apellidos', 'surname'],
}

/** Sugiere a qué campo va cada columna: 'email' | 'firstName' | 'lastName' | 'field' | 'skip'. */
export function guessMapping(headers) {
  const used = new Set()
  return headers.map(h => {
    const n = norm(h)
    for (const [target, names] of Object.entries(GUESS)) {
      if (!used.has(target) && names.includes(n)) { used.add(target); return target }
    }
    if (!used.has('email') && /mail|correo/.test(n)) { used.add('email'); return 'email' }
    return n ? 'field' : 'skip'
  })
}

/** Clave de variable personalizada a partir del encabezado: {{campo.<clave>}}. */
export function fieldKey(header) {
  return norm(header).replace(/ /g, '_').slice(0, 40) || 'campo'
}

/** Filas del CSV → filas para el backend según el mapeo. */
export function mapRows(rows, headers, mapping) {
  return rows.map(r => {
    const out = { email: '', firstName: '', lastName: '', fields: {} }
    mapping.forEach((m, i) => {
      const v = (r[i] ?? '').trim()
      if (m === 'email' || m === 'firstName' || m === 'lastName') out[m] = v
      else if (m === 'field' && v) out.fields[fieldKey(headers[i])] = v
    })
    return out
  })
}

export function readCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = stripBom(String(reader.result || ''))
      const firstLine = text.split(/\r?\n/, 1)[0] || ''
      const all = parseCsv(text, detectSeparator(firstLine))
      if (!all.length) return reject(new Error('El archivo está vacío'))
      resolve({ headers: all[0].map(h => h.trim()), rows: all.slice(1) })
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsText(file)
  })
}
