import { useEffect, useRef } from 'react'
import { connectSocket } from '../../lib/socket'

/**
 * Suscribe a los eventos realtime del módulo Calendario (todos viajan a
 * `workspace:<id>`, mismo patrón que useContentSocket.js). Los 4 eventos
 * (created/updated/deleted/responded) disparan el mismo `onChange()` — la
 * página simplemente refetchea, no hace merge in situ (mismo criterio que
 * Contenido con el debounce de reload).
 */
export function useCalendarSocket(onChange) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const socket = connectSocket()
    if (!socket) return

    const handler = () => onChangeRef.current?.()
    socket.on('calendar:event:created', handler)
    socket.on('calendar:event:updated', handler)
    socket.on('calendar:event:deleted', handler)
    socket.on('calendar:event:responded', handler)

    return () => {
      socket.off('calendar:event:created', handler)
      socket.off('calendar:event:updated', handler)
      socket.off('calendar:event:deleted', handler)
      socket.off('calendar:event:responded', handler)
    }
  }, [])
}

export default useCalendarSocket
