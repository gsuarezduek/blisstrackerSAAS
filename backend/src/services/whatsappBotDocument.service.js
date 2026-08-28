const path = require('path')
const prisma = require('../lib/prisma')
const objectStorage = require('./objectStorage.service')
const { getSetting } = require('../lib/platformSettings')
const { detectDocumentType } = require('../lib/documentType')

// Contexto simple (no RAG): el texto extraído se pega completo (truncado) en el
// system prompt del bot en cada respuesta — ver whatsappBot.service.js
// `buildKnowledgeBlock`. Alcanza para pocos documentos tipo brochure/FAQ/manual
// de servicios; documentos muy grandes o muchos documentos disparan el costo de
// tokens por mensaje (mitigado con prompt caching de Anthropic, ver ese archivo).
const MAX_CHARS_PER_DOC = 20_000 // ≈ 5k tokens
const MAX_KNOWLEDGE_CHARS = 40_000 // tope total agregado entre todos los documentos

const MIME_BY_KIND = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
}

function truncate(text, maxChars) {
  const trimmed = (text || '').trim()
  if (trimmed.length <= maxChars) return { text: trimmed, truncated: false }
  return { text: trimmed.slice(0, maxChars), truncated: true }
}

/**
 * Extrae texto plano de un buffer según el `kind` detectado por magic bytes.
 * PDF vía pdf-parse v2 (`result.pages` en vez de `result.text` — evita los
 * separadores "-- N of M --" que mete el `text` combinado). DOCX vía mammoth
 * (`extractRawText`, ignora estilos/formato, solo el contenido). TXT es
 * decodificación directa. Puede lanzar (PDF corrupto, DOCX que en realidad es
 * otro tipo de ZIP) — el caller lo captura y marca el documento `status:'error'`.
 */
async function extractText(buffer, kind) {
  if (kind === 'pdf') {
    const { PDFParse } = require('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return result.pages.map(p => p.text).join('\n\n')
    } finally {
      await parser.destroy()
    }
  }
  if (kind === 'docx') {
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  if (kind === 'txt') {
    return buffer.toString('utf8')
  }
  throw new Error('Tipo de documento no soportado')
}

/**
 * Sube y procesa un documento de contexto del bot. Valida tipo real (magic
 * bytes) + tamaño + cuota de cantidad, extrae el texto UNA SOLA VEZ (no en cada
 * mensaje del bot) y lo trunca. Si la extracción falla, el archivo igual se
 * guarda (para que el admin vea qué subió) pero con `status:'error'` — nunca
 * rompe la subida en sí. Devuelve la fila creada.
 */
async function uploadDocument({ workspaceId, uploadedById, buffer, originalName }) {
  const declaredExt = (path.extname(originalName || '').slice(1) || '').toLowerCase()
  const kind = detectDocumentType(buffer, declaredExt)
  if (!kind) {
    const err = new Error('El archivo no es un PDF, DOCX o TXT válido.')
    err.status = 400
    throw err
  }

  const maxMb = await getSetting('whatsappBotDocumentMaxMb')
  if (buffer.length > maxMb * 1024 * 1024) {
    const err = new Error(`El archivo supera el máximo permitido (${maxMb}MB).`)
    err.status = 413
    throw err
  }

  const maxCount = await getSetting('whatsappBotDocumentMaxCount')
  const currentCount = await prisma.whatsappBotDocument.count({ where: { workspaceId } })
  if (currentCount >= maxCount) {
    const err = new Error(`Ya hay ${maxCount} documentos cargados (el máximo). Eliminá alguno antes de subir otro.`)
    err.status = 400
    throw err
  }

  const mimeType = MIME_BY_KIND[kind]
  const storage = objectStorage.isConfigured()
    ? await (async () => {
        const { key, size } = await objectStorage.putObject(buffer, mimeType, { prefix: `whatsapp-bot-doc/${workspaceId}` })
        return { objectKey: key, fileData: null, sizeBytes: size }
      })()
    : { objectKey: null, fileData: buffer, sizeBytes: buffer.length }

  let extractedText = null, charCount = 0, truncated = false, status = 'ready', errorMsg = null
  try {
    const raw = await extractText(buffer, kind)
    const result = truncate(raw, MAX_CHARS_PER_DOC)
    extractedText = result.text
    charCount = result.text.length
    truncated = result.truncated
    if (!extractedText) { status = 'error'; errorMsg = 'No se pudo extraer texto del archivo (¿está vacío o es una imagen escaneada?).' }
  } catch (err) {
    status = 'error'
    errorMsg = err.message?.slice(0, 300) || 'Error al extraer el texto del archivo.'
  }

  return prisma.whatsappBotDocument.create({
    data: {
      workspaceId,
      uploadedById,
      fileName: (originalName || 'documento').slice(0, 200),
      mimeType,
      ...storage,
      extractedText,
      charCount,
      truncated,
      status,
      errorMsg,
    },
    select: DOCUMENT_LIST_SELECT, // nunca devolver fileData (bytes crudos) ni extractedText completo al frontend
  })
}

// Metadata liviana para listar/confirmar una subida — nunca `fileData`
// (bytes crudos del archivo) ni `extractedText` completo, que no hace falta
// en el frontend y puede ser pesado.
const DOCUMENT_LIST_SELECT = {
  id: true, fileName: true, mimeType: true, sizeBytes: true,
  charCount: true, truncated: true, status: true, errorMsg: true, createdAt: true,
}

async function listDocuments(workspaceId) {
  return prisma.whatsappBotDocument.findMany({
    where: { workspaceId },
    select: DOCUMENT_LIST_SELECT,
    orderBy: { createdAt: 'desc' },
  })
}

async function deleteDocument(workspaceId, id) {
  const doc = await prisma.whatsappBotDocument.findFirst({ where: { id: Number(id), workspaceId } })
  if (!doc) return null
  if (doc.objectKey) await objectStorage.deleteObject(doc.objectKey)
  await prisma.whatsappBotDocument.delete({ where: { id: doc.id } })
  return doc
}

/**
 * Arma el bloque de "base de conocimiento" para el system prompt del bot,
 * concatenando el texto ya extraído de todos los documentos `status:'ready'`
 * del workspace, con un tope TOTAL agregado (además del tope por documento ya
 * aplicado al subir) para no descontrolar el costo por mensaje aunque haya
 * varios documentos grandes. Devuelve '' si no hay documentos — el caller lo
 * concatena condicionalmente, igual que servicesBlock.
 */
async function buildKnowledgeBlock(workspaceId) {
  const docs = await prisma.whatsappBotDocument.findMany({
    where: { workspaceId, status: 'ready' },
    select: { fileName: true, extractedText: true },
    orderBy: { createdAt: 'asc' },
  })
  if (docs.length === 0) return ''

  let combined = docs
    .filter(d => d.extractedText)
    .map(d => `--- Documento: ${d.fileName} ---\n${d.extractedText}`)
    .join('\n\n')
  if (combined.length > MAX_KNOWLEDGE_CHARS) combined = combined.slice(0, MAX_KNOWLEDGE_CHARS)

  return combined ? `\n\nBase de conocimiento (documentos cargados por la agencia):\n${combined}` : ''
}

module.exports = { uploadDocument, listDocuments, deleteDocument, buildKnowledgeBlock, truncate, MAX_CHARS_PER_DOC, MAX_KNOWLEDGE_CHARS }
