// Motor de edición colaborativa en tiempo real (Yjs + Hocuspocus) para las notas
// de reuniones. Corre sobre el MISMO httpServer/puerto que ya sirve Express y
// Socket.IO (backend/src/lib/socket.js) — no es un servicio nuevo a desplegar en
// Railway, solo una ruta de upgrade distinta (`/collab`) sobre el mismo proceso.
//
// Instancia única, sin adapter de Redis: el estado en memoria (Y.Docs activos,
// awareness/cursores) vive únicamente en el proceso que atendió la conexión —
// misma limitación ya documentada para `voiceRooms` en socket.js. Railway hoy
// corre un solo proceso backend, así que no es un problema nuevo; si en el
// futuro se escala a múltiples instancias, esto necesitaría `@hocuspocus/extension-redis`
// (no implementado ahora, deuda conocida y anotada).
const { Hocuspocus } = require('@hocuspocus/server')
const { WebSocketServer } = require('ws')
const Y = require('yjs')
const { resolveDocAccess } = require('./docAccess')
const { loadDoc, saveDoc, htmlToYdocBytes } = require('./docPersistence')

const COLLAB_PATH = '/collab'

const hocuspocus = new Hocuspocus({
  debounce: 2000,
  maxDebounce: 10000,
  quiet: true,

  // Se dispara antes de crear/cargar el documento. `documentName` es el docKey
  // ("meeting:<id>" / "lead:<id>" / "eosMeeting:<week>"). Lanzar acá rechaza la
  // conexión — nadie sin permiso llega a ver el texto en vivo.
  async onAuthenticate(data) {
    data.context = await resolveDocAccess(data.documentName, data.token)
  },

  // Primera carga del documento en memoria (una vez por doc activo, no por
  // conexión). Reconstruye el Y.Doc desde el estado binario persistido, o —si
  // nunca se abrió en modo colaborativo pero ya tenía HTML de antes— lo convierte
  // una sola vez y persiste el resultado para no repetir la conversión.
  async onLoadDocument(data) {
    const { document, documentName, context } = data
    // Guardado en el propio Y.Doc (no en `context`, que es por-conexión) para que
    // onStoreDocument y el flush de shutdown sepan a qué workspace pertenece sin
    // depender de qué conexión disparó el guardado.
    document.workspaceId = context.workspaceId

    const row = await loadDoc(documentName, context.workspaceId)
    if (row?.notesYdoc) {
      Y.applyUpdate(document, row.notesYdoc)
    } else if (row?.notes) {
      Y.applyUpdate(document, htmlToYdocBytes(row.notes))
      await saveDoc(documentName, context.workspaceId, document)
    }
  },

  // Debounced (2s/máx 10s) — persiste el estado binario + el HTML derivado.
  async onStoreDocument(data) {
    await saveDoc(data.documentName, data.document.workspaceId, data.document)
  },
})

let wss = null

// Engancha el `upgrade` del httpServer en `/collab`, sin pisar el que ya usa
// Socket.IO (cada listener de `upgrade` filtra por su propio path y no hace nada
// si no matchea — así conviven varios en el mismo servidor).
function initCollabServer(httpServer) {
  wss = new WebSocketServer({ noServer: true })
  httpServer.on('upgrade', (request, socket, head) => {
    let pathname
    try {
      pathname = new URL(request.url, 'http://localhost').pathname
    } catch {
      return
    }
    if (pathname !== COLLAB_PATH) return
    wss.handleUpgrade(request, socket, head, (ws) => {
      hocuspocus.handleConnection(ws, request)
    })
  })
}

// Fuerza a persistir cualquier documento con cambios pendientes (dentro de la
// ventana de debounce) antes de que Railway mate el proceso en un redeploy —
// mismo espíritu que el resto del cierre prolijo de backend/src/index.js.
async function shutdownCollabServer() {
  const docs = [...hocuspocus.documents.values()]
  await Promise.all(docs.map((document) => hocuspocus.storeDocumentHooks(document, {
    document,
    documentName: document.name,
    context: {},
    instance: hocuspocus,
    clientsCount: document.getConnectionsCount(),
    requestHeaders: {},
    requestParameters: new URLSearchParams(),
    socketId: 'shutdown',
  }, true)))
  wss?.close()
}

module.exports = { initCollabServer, shutdownCollabServer }
