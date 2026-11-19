// Lectura de un resumen de tarjeta en PDF (Finanzas → "+ Cargar" → Tarjeta).
//
// Dos pasos:
//   1. Texto del PDF con pdf-parse (acepta la clave del PDF; la clave se usa en
//      memoria para abrirlo y no se guarda en ningún lado).
//   2. Claude convierte ese texto en renglones estructurados. Se le manda el
//      TEXTO y no el PDF: es el mismo camino para PDFs con y sin clave (la API
//      no abre PDFs cifrados) y cuesta bastante menos. Sirve para cualquier
//      banco porque no hay un lector por formato.
//
// La sugerencia de categoría (`suggestCategories`) es una segunda llamada,
// chica, solo para los comercios que la memoria de la tarjeta no conoce.
const { anthropic, assertTokenBudget } = require('../lib/claude')
const { logTokens } = require('../lib/logTokens')

const MODEL = 'claude-opus-5-5'

function businessError(status, message, code) {
  return Object.assign(new Error(message), { status, code, isOperational: true })
}

/**
 * Texto del PDF, página por página. Lanza 422 con `code`:
 *   PDF_PASSWORD_REQUIRED — el PDF tiene clave y no vino ninguna
 *   PDF_PASSWORD_INVALID  — vino una clave y no es la correcta
 *   PDF_NO_TEXT           — no hay texto (un escaneo / foto)
 */
async function extractPdfText(buffer, password) {
  const { PDFParse } = require('pdf-parse')
  const read = async (pw) => {
    const parser = new PDFParse({ data: buffer, ...(pw ? { password: pw } : {}) })
    try {
      const result = await parser.getText()
      return result.pages.map((p, i) => `--- Página ${i + 1} ---\n${p.text}`).join('\n\n')
    } finally {
      await parser.destroy().catch(() => {})
    }
  }

  let text
  let encrypted = false
  try {
    text = await read(null)
  } catch (err) {
    if (err?.name !== 'PasswordException') throw businessError(422, 'No se pudo leer el PDF. ¿Es un resumen válido?', 'PDF_UNREADABLE')
    encrypted = true
    if (!password) throw businessError(422, 'Este PDF tiene clave. Ingresala para poder leerlo.', 'PDF_PASSWORD_REQUIRED')
    try {
      text = await read(password)
    } catch (err2) {
      if (err2?.name === 'PasswordException') throw businessError(422, 'La clave del PDF no es correcta.', 'PDF_PASSWORD_INVALID')
      throw businessError(422, 'No se pudo leer el PDF. ¿Es un resumen válido?', 'PDF_UNREADABLE')
    }
  }
  if (!text || text.replace(/--- Página \d+ ---/g, '').trim().length < 50) {
    throw businessError(422, 'El PDF no tiene texto para leer (¿es un escaneo o una foto?). Descargá el resumen original desde el home banking.', 'PDF_NO_TEXT')
  }
  return { text, encrypted }
}

const NULLABLE_STRING = { anyOf: [{ type: 'string' }, { type: 'null' }] }

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isCardStatement', 'bank', 'cardBrand', 'last4', 'closingDate', 'dueDate', 'balances', 'lines'],
  properties: {
    isCardStatement: { type: 'boolean' },
    bank: NULLABLE_STRING,
    cardBrand: NULLABLE_STRING,
    last4: NULLABLE_STRING,
    closingDate: NULLABLE_STRING,
    dueDate: NULLABLE_STRING,
    balances: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['currency', 'previousBalance', 'currentBalance'],
        properties: {
          currency: { type: 'string', enum: ['ARS', 'USD'] },
          previousBalance: NULLABLE_STRING,
          currentBalance: NULLABLE_STRING,
        },
      },
    },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'voucher', 'description', 'installment', 'currency', 'amount', 'kind'],
        properties: {
          date: { type: 'string' },
          voucher: NULLABLE_STRING,
          description: { type: 'string' },
          installment: NULLABLE_STRING,
          currency: { type: 'string', enum: ['ARS', 'USD'] },
          amount: { type: 'string' },
          kind: { type: 'string', enum: ['purchase', 'charge', 'credit', 'payment'] },
        },
      },
    },
  },
}

const EXTRACTION_SYSTEM = `Extraés los renglones de un resumen de tarjeta de crédito (bancos argentinos, cualquier formato) a partir del texto plano del PDF. El texto viene de una extracción automática: las columnas pueden estar separadas por tabs o espacios y algún renglón puede aparecer partido o desordenado.

Devolvé cada movimiento del período, uno por renglón, sin agrupar ni omitir ninguno (si un comercio aparece 30 veces, son 30 renglones):
- date: fecha del renglón en formato YYYY-MM-DD (los años de dos dígitos son 20xx).
- voucher: número de comprobante/cupón si lo tiene, si no null.
- description: el detalle tal como aparece (sin el monto ni la moneda).
- installment: la cuota si el renglón la indica (ej. "01/06", "C.03/12"), si no null.
- currency: "ARS" si el importe está en la columna de pesos, "USD" si está en la de dólares. Un consumo en moneda extranjera que muestra el importe original y además el importe en la columna de dólares es USD, con el importe de la columna de dólares.
- amount: el importe que se cobra o acredita, siempre positivo, con punto decimal y sin separador de miles (ej. "29172.00"). Si el renglón muestra además una base de cálculo (ej. "IVA RG 4240 21%( 719254,28)" o "DB IVA $ 21% 41.826,39 8.783,54"), el importe es el cargo de la columna de moneda, no la base.
- kind:
  - "purchase": consumos y compras, incluidas las cuotas de compras.
  - "charge": impuestos, percepciones, IVA, sellos, intereses, comisiones, cargos y débitos del banco.
  - "credit": bonificaciones, devoluciones, reintegros, anulaciones, créditos de IVA, devoluciones de percepciones (los importes que vienen con signo menos y no son pagos).
  - "payment": los pagos del resumen anterior hechos por el titular ("SU PAGO", "PAGO EN PESOS", etc.).

No incluyas como renglón: saldo anterior, saldo actual, subtotales o totales ("Total consumos de..."), pago mínimo, límites, tasas, ofertas de planes de cuotas, puntos ni texto legal.

Del encabezado: bank (nombre del banco), cardBrand (Visa, Mastercard, Amex...), last4 (últimos 4 dígitos de la tarjeta si aparecen), closingDate (cierre actual) y dueDate (vencimiento actual) en YYYY-MM-DD, y balances: por cada moneda, el saldo anterior y el saldo actual del resumen con punto decimal (negativo con "-" adelante si es saldo a favor; null si no figura).

Si el texto no es un resumen de tarjeta de crédito, devolvé isCardStatement=false y listas vacías.`

/** Llama a Claude en streaming (los resúmenes largos superan el timeout de una llamada común) con presupuesto y log de tokens. */
async function callStructured({ system, user, schema, effort, maxTokens, workspaceId, userId, source }) {
  await assertTokenBudget(workspaceId)
  const msg = await anthropic.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: user }],
  }).finalMessage()
  logTokens(source, userId, msg.usage, workspaceId).catch(() => {})

  if (msg.stop_reason === 'refusal') throw businessError(422, 'No se pudo procesar este resumen.', 'AI_REFUSAL')
  if (msg.stop_reason === 'max_tokens') throw businessError(422, 'El resumen es demasiado largo para leerlo de una vez.', 'AI_TOO_LONG')
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
  try {
    return JSON.parse(text)
  } catch {
    throw businessError(502, 'No se pudo interpretar la lectura del resumen. Probá de nuevo.', 'AI_BAD_JSON')
  }
}

/** Texto del resumen → { isCardStatement, bank, cardBrand, last4, closingDate, dueDate, balances, lines } (sin sanitizar). */
async function extractStatement(text, { workspaceId, userId }) {
  return callStructured({
    system: EXTRACTION_SYSTEM,
    user: `Texto del resumen:\n\n${text}`,
    schema: EXTRACTION_SCHEMA,
    effort: 'medium',
    maxTokens: 64000,
    workspaceId, userId, source: 'financeCardStatement',
  })
}

const SUGGESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'itemId', 'categoryId', 'newItemName'],
        properties: {
          key: { type: 'string' },
          itemId: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
          categoryId: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
          newItemName: NULLABLE_STRING,
        },
      },
    },
  },
}

const SUGGESTION_SYSTEM = `Clasificás gastos e ingresos de un resumen de tarjeta de crédito de una empresa argentina dentro de su plan de cuentas.

Cada movimiento se anota con un "item" (la contraparte: el proveedor o servicio, ej. "Netflix", "Facebook Ads") y una "categoría". Cada item tiene una categoría habitual.

Para cada comercio que te paso:
- Si alguno de los items existentes corresponde claramente a ese comercio, devolvé su itemId y su categoría habitual en categoryId (o una categoría más adecuada del mismo tipo si la habitual no corresponde), con newItemName null.
- Si ningún item corresponde, devolvé itemId null, newItemName con un nombre corto y legible para crear el item (ej. "FACEBK" → "Facebook Ads", "IVA RG" → "IVA servicios digitales (RG 4240)", "DB.RG" → "Percepción Ganancias (RG 5617)"), y en categoryId la categoría existente que mejor encaje.
- La categoría tiene que ser del mismo tipo que el movimiento (expense = egreso, income = ingreso). Si ninguna encaja razonablemente, categoryId null.

Usá solo ids de las listas. Devolvé una sugerencia por cada comercio, con la misma key.`

/**
 * Sugerencia de item + categoría para los comercios que la memoria no conoce.
 * `merchants` = [{ key, type, examples: [descripción, ...] }]; `catalog` =
 * { categories: [{ id, name, type }], items: [{ id, name, categoryId }] }.
 * Devuelve Map key → { itemId, categoryId, newItemName } ya validado contra el
 * catálogo (un id inventado o de otro tipo se descarta). Nunca lanza por un
 * problema de la IA: sin sugerencia, el usuario elige a mano.
 */
async function suggestCategories(merchants, catalog, { workspaceId, userId }) {
  const result = new Map()
  if (merchants.length === 0) return result
  const payload = {
    categories: catalog.categories.map(c => ({ id: c.id, name: c.name, type: c.type })),
    items: catalog.items.map(i => ({ id: i.id, name: i.name, categoryId: i.categoryId })),
    merchants: merchants.map(m => ({ key: m.key, type: m.type, examples: m.examples.slice(0, 3) })),
  }
  let parsed
  try {
    parsed = await callStructured({
      system: SUGGESTION_SYSTEM,
      user: JSON.stringify(payload),
      schema: SUGGESTION_SCHEMA,
      effort: 'low',
      maxTokens: 16000,
      workspaceId, userId, source: 'financeCardCategorize',
    })
  } catch (err) {
    if (err?.code === 'TOKEN_BUDGET_EXCEEDED') throw err
    console.error('[cardStatement] sugerencia de categorías falló:', err.message)
    return result
  }

  const categoriesById = new Map(catalog.categories.map(c => [c.id, c]))
  const itemsById = new Map(catalog.items.map(i => [i.id, i]))
  const typeByKey = new Map(merchants.map(m => [m.key, m.type]))
  for (const s of parsed?.suggestions || []) {
    const type = typeByKey.get(s?.key)
    if (!type) continue
    const category = categoriesById.get(s.categoryId)
    const categoryId = category && category.type === type ? category.id : null
    const item = itemsById.get(s.itemId)
    const newItemName = !item && typeof s.newItemName === 'string' && s.newItemName.trim() ? s.newItemName.trim().slice(0, 80) : null
    if (!item && !newItemName && !categoryId) continue
    result.set(s.key, { itemId: item ? item.id : null, categoryId: categoryId ?? (item && categoriesById.get(item.categoryId)?.type === type ? item.categoryId : null), newItemName })
  }
  return result
}

module.exports = { extractPdfText, extractStatement, suggestCategories, EXTRACTION_SCHEMA, SUGGESTION_SCHEMA, MODEL }
