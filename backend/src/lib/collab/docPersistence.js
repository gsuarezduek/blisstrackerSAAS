// Persistencia de los documentos colaborativos: cómo leer/escribir el par
// (notesYdoc binario, notes HTML derivado) de cada tipo de recurso. Un handler
// por prefijo de docKey ("meeting:<id>", "lead:<id>", "eosMeeting:<week>") — sumar
// un 4° campo colaborativo a futuro es agregar una entrada acá, sin tocar
// hocuspocusServer.js ni docAccess.js.
const prisma = require('../prisma')
const Y = require('yjs')
const { TiptapTransformer } = require('@hocuspocus/transformer')
const { generateHTML, generateJSON } = require('@tiptap/html/server')
const { collabExtensions } = require('./extensions')

// Mismo nombre de field que usa `Collaboration.configure({ field: 'default' })`
// (default de la extensión) del lado del cliente — tiene que matchear para que
// el servidor lea/escriba el fragmento correcto del Y.Doc.
const FIELD = 'default'

function parseDocKey(docKey) {
  const idx = typeof docKey === 'string' ? docKey.indexOf(':') : -1
  if (idx <= 0) return null
  const kind = docKey.slice(0, idx)
  const rawId = docKey.slice(idx + 1)
  if (!rawId) return null
  return { kind, rawId }
}

const HANDLERS = {
  meeting: {
    async load(rawId, workspaceId) {
      const id = Number(rawId)
      if (!id) return null
      return prisma.projectMeeting.findFirst({
        where: { id, workspaceId },
        select: { notes: true, notesYdoc: true },
      })
    },
    async save(rawId, data) {
      const id = Number(rawId)
      if (!id) return
      await prisma.projectMeeting.update({ where: { id }, data })
    },
  },
  lead: {
    async load(rawId, workspaceId) {
      const id = Number(rawId)
      if (!id) return null
      return prisma.lead.findFirst({
        where: { id, workspaceId },
        select: { notes: true, notesYdoc: true },
      })
    },
    async save(rawId, data) {
      const id = Number(rawId)
      if (!id) return
      await prisma.lead.update({ where: { id }, data })
    },
  },
  eosMeeting: {
    // La reunión L10 se crea al vuelo (mismo criterio que upsertMeeting en
    // eosTraction.controller.js) — si todavía no hay fila para esta semana, no
    // hay nada que cargar; se crea recién cuando hay algo que guardar.
    async load(rawId, workspaceId) {
      return prisma.eOSMeeting.findUnique({
        where: { workspaceId_week: { workspaceId, week: rawId } },
        select: { notes: true, notesYdoc: true },
      })
    },
    async save(rawId, data, workspaceId) {
      await prisma.eOSMeeting.upsert({
        where: { workspaceId_week: { workspaceId, week: rawId } },
        create: { workspaceId, week: rawId, ...data },
        update: data,
      })
    },
  },
}

// { notes: string|null, notesYdoc: Buffer|null } | null (null = el recurso no
// existe en este workspace, o el docKey no matchea ningún tipo conocido).
async function loadDoc(docKey, workspaceId) {
  const parsed = parseDocKey(docKey)
  const handler = parsed && HANDLERS[parsed.kind]
  if (!handler) return null
  return handler.load(parsed.rawId, workspaceId)
}

async function saveDoc(docKey, workspaceId, ydoc) {
  const parsed = parseDocKey(docKey)
  const handler = parsed && HANDLERS[parsed.kind]
  if (!handler) return
  const bytes = Buffer.from(Y.encodeStateAsUpdate(ydoc))
  const html = ydocToHtml(ydoc)
  await handler.save(parsed.rawId, { notes: html, notesYdoc: bytes }, workspaceId)
}

function ydocToHtml(ydoc) {
  const json = TiptapTransformer.fromYdoc(ydoc, FIELD)
  return generateHTML(json, collabExtensions)
}

// Bootstrap: HTML plano existente (de antes de este cambio) → bytes de un Y.Doc
// nuevo, para aplicar sobre el doc real de la sesión (ver onLoadDocument en
// hocuspocusServer.js). Se usa una sola vez por documento — después de la primera
// conversión, `notesYdoc` queda poblado y este camino no se vuelve a tomar.
function htmlToYdocBytes(html) {
  const json = generateJSON(html, collabExtensions)
  const ydoc = TiptapTransformer.toYdoc(json, FIELD, collabExtensions)
  return Buffer.from(Y.encodeStateAsUpdate(ydoc))
}

module.exports = { parseDocKey, loadDoc, saveDoc, ydocToHtml, htmlToYdocBytes, FIELD }
