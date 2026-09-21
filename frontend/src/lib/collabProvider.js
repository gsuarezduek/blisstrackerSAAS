import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

// Igual que Marketing/etc., `VITE_API_URL` es la base HTTP del backend (ej.
// `http://localhost:3001` en dev) — Hocuspocus necesita el esquema ws(s)://,
// no http(s)://, así que se convierte acá.
function buildCollabUrl() {
  const apiUrl = import.meta.env.VITE_API_URL || ''
  return `${apiUrl.replace(/^http/, 'ws')}/collab`
}

// Un Y.Doc + HocuspocusProvider por editor colaborativo abierto en pantalla —
// a diferencia del socket.io singleton de socket.js (un socket compartido para
// todo el chat/voz), acá cada `docKey` sincroniza un documento distinto, así que
// cada uno necesita su propia conexión. El provider trae su propio reconnect con
// backoff (equivalente al que socket.io-client ya maneja para el chat).
// `handlers` pasa directo a la configuración de HocuspocusProvider (onStatus,
// onAuthenticationFailed, onAwarenessUpdate, etc.) — el caller (CollaborativeRichTextEditor)
// los usa para reflejar conexión/presencia en estado de React.
export function createCollabProvider(docKey, handlers = {}) {
  const document = new Y.Doc()
  return new HocuspocusProvider({
    url: buildCollabUrl(),
    name: docKey,
    document,
    token: () => localStorage.getItem('token') || '',
    ...handlers,
  })
}
