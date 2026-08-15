import { useEffect, useRef } from 'react'
import { connectSocket } from '../../lib/socket'

/**
 * Suscribe a los eventos realtime del módulo Contenido. Todo viaja a
 * `workspace:<id>` (no hay room por proyecto — cualquier miembro activo ya
 * puede leer cualquier proyecto en este repo), así que acá se filtra por
 * `projectId` antes de invocar cada handler.
 *
 * El socket es singleton (compartido con el chat): sin `socket.off` en el
 * cleanup los listeners se acumulan en cada cambio de proyecto/vista. Los
 * handlers se guardan en un ref para no tener que reconectar cuando el
 * caller pasa funciones nuevas en cada render.
 *
 * @param {string|number} projectId
 * @param {{ onPieceCreated?, onPieceUpdated?, onPieceDeleted?, onCommentNew?, onCommentDeleted? }} handlers
 */
export function useContentSocket(projectId, handlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!projectId) return
    const socket = connectSocket()
    if (!socket) return

    const matches = (payload) => String(payload?.projectId) === String(projectId)

    const onPieceCreated   = (p) => matches(p) && handlersRef.current.onPieceCreated?.(p.piece)
    const onPieceUpdated   = (p) => matches(p) && handlersRef.current.onPieceUpdated?.(p.piece)
    const onPieceDeleted   = (p) => matches(p) && handlersRef.current.onPieceDeleted?.(p.id)
    const onCommentNew     = (p) => matches(p) && handlersRef.current.onCommentNew?.(p.pieceId, p.comment)
    const onCommentDeleted = (p) => matches(p) && handlersRef.current.onCommentDeleted?.(p.pieceId, p.id)

    socket.on('content:piece:created', onPieceCreated)
    socket.on('content:piece:updated', onPieceUpdated)
    socket.on('content:piece:deleted', onPieceDeleted)
    socket.on('content:comment:new', onCommentNew)
    socket.on('content:comment:deleted', onCommentDeleted)

    return () => {
      socket.off('content:piece:created', onPieceCreated)
      socket.off('content:piece:updated', onPieceUpdated)
      socket.off('content:piece:deleted', onPieceDeleted)
      socket.off('content:comment:new', onCommentNew)
      socket.off('content:comment:deleted', onCommentDeleted)
    }
  }, [projectId])
}

export default useContentSocket
