/**
 * CollaborativeRichTextEditor — edición simultánea en tiempo real (varias
 * personas escribiendo a la vez, con cursores de las demás) sobre un campo de
 * notas colaborativo del backend (ver backend/src/lib/collab/). Hermano de
 * RichTextEditor.jsx, no lo reemplaza: ese sigue siendo el editor de un solo
 * autor (Project.situation, propuestas, Visión EOS, etc.) — este es solo para
 * los 3 campos con motor de colaboración: ProjectMeeting.notes, Lead.notes,
 * EOSMeeting.notes.
 *
 * Props:
 *   docKey          — identifica el documento colaborativo ("meeting:<id>",
 *                      "lead:<id>", "eosMeeting:<week>")
 *   editable        — false = no abre conexión, muestra `fallbackContent`
 *                      estático (igual criterio que RichTextEditor). default true
 *   fallbackContent — HTML a mostrar en modo solo-lectura, o mientras conecta
 *   emptyText       — texto cuando no hay contenido y no se puede editar
 *   minHeight       — altura mínima del área de texto (px, default 140)
 *
 * `docKey`/`editable` se asumen estables durante la vida del componente — si
 * cambian (otra reunión, o cambió el permiso), el padre debe forzar un remount
 * con `key` (ver ProjectMeetings.jsx/LeadNotes.jsx), igual que cualquier recurso
 * externo con conexión propia.
 */
import { useEffect, useMemo, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import { TableKit } from '@tiptap/extension-table'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import { Collaboration } from '@tiptap/extension-collaboration'
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret'
import DOMPurify from 'dompurify'
import { useAuth } from '../context/AuthContext'
import { createCollabProvider } from '../lib/collabProvider'
import { colorForUser } from '../lib/collabColor'
import { avatarUrl } from '../utils/avatarUrl'
import { Toolbar } from './RichTextEditor'
import './situation-editor.css'

const STATUS_LABEL = {
  connecting: 'Conectando…',
  connected: 'Conectado',
  disconnected: 'Reconectando…',
  denied: 'Sin acceso a este documento',
}

// Un peer por usuario (no por conexión/pestaña) — mismo criterio de dedup que
// `roomParticipantsList` en backend/src/lib/socket.js para la presencia de voz.
function peersFromAwareness(provider) {
  const byUser = new Map()
  for (const [clientId, state] of provider.awareness.getStates()) {
    if (clientId === provider.awareness.clientID) continue
    const u = state?.user
    if (u?.id != null && !byUser.has(u.id)) byUser.set(u.id, u)
  }
  return [...byUser.values()]
}

export default function CollaborativeRichTextEditor({
  docKey, editable = true, fallbackContent = '', emptyText = 'Sin información todavía.', minHeight = 140,
}) {
  const { user } = useAuth()
  const [status, setStatus] = useState('connecting')
  const [peers, setPeers] = useState([])

  // Lazy init: crea la conexión una sola vez, de forma sincrónica en el primer
  // render (no en un efecto) — así `provider` ya está listo cuando useEditor
  // arma sus extensiones más abajo, sin un parpadeo intermedio sin editor.
  const [provider] = useState(() => {
    if (!editable || !docKey) return null
    let p
    p = createCollabProvider(docKey, {
      onStatus: ({ status: s }) => setStatus(s),
      onAuthenticationFailed: () => setStatus('denied'),
      onAwarenessUpdate: () => setPeers(peersFromAwareness(p)),
    })
    return p
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  // Desconecta al desmontar (cambiar de reunión/lead remonta el componente vía
  // `key` en el padre, lo que dispara este cleanup para la instancia vieja).
  useEffect(() => () => provider?.destroy(), [provider])

  const myColor = useMemo(() => colorForUser(user?.id), [user?.id])

  const editor = useEditor(provider ? {
    extensions: [
      StarterKit.configure({ history: false }), // el undo lo maneja Yjs (y-undo, vía Collaboration)
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TableKit.configure({ table: { resizable: false } }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Collaboration.configure({ document: provider.document }),
      CollaborationCaret.configure({
        provider,
        user: { id: user?.id, name: user?.name || 'Alguien', color: myColor },
      }),
    ],
  } : null, [provider])

  const isEmpty = !fallbackContent || fallbackContent === '<p></p>'

  if (editable && editor) {
    return (
      <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
        <div className="flex items-center justify-end gap-1.5 px-2 py-1 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
          {peers.map(p => (
            <img
              key={p.id}
              src={avatarUrl(p.avatar)}
              alt={p.name}
              title={`${p.name} está viendo/editando`}
              className="w-5 h-5 rounded-full object-cover"
              style={{ boxShadow: `0 0 0 2px ${p.color}` }}
            />
          ))}
          <span className={`text-[10px] ${
            status === 'connected' ? 'text-green-600 dark:text-green-400'
              : status === 'denied' ? 'text-red-500'
              : 'text-gray-400 dark:text-gray-500'
          }`}>
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>
        <Toolbar editor={editor} />
        <EditorContent
          editor={editor}
          className="situation-editor p-3 text-sm text-gray-800 dark:text-gray-200 focus:outline-none"
          style={{ minHeight }}
        />
      </div>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden opacity-60">
      {isEmpty ? (
        <p className="p-3 text-sm text-gray-400 dark:text-gray-500 italic">{emptyText}</p>
      ) : (
        <div
          className="situation-content p-3 text-sm text-gray-700 dark:text-gray-300"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(fallbackContent) }}
        />
      )}
    </div>
  )
}
