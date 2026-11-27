import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Icon } from '../ui/Icon'
import useGoogleCalendarConnection from './useGoogleCalendarConnection'

// Qué le pasó a la conexión, en palabras de quien la usa. `missing_scope` es el
// caso de conectar destildando la casilla del calendario en la pantalla de Google:
// la conexión "anda" para el login pero no puede leer ni escribir eventos.
const COPY = {
  expired:       'Tu Google Calendar se desconectó: no se están trayendo tus eventos ni empujando tus reuniones.',
  missing_scope: 'Tu Google Calendar está conectado sin permiso para el calendario: no se están trayendo tus eventos ni empujando tus reuniones.',
}

/**
 * Aviso de conexión caída con "Reconectar". Antes de esto no había forma de
 * reconectar: el botón de conectar solo aparecía si la persona no tenía ningún
 * calendario de Google, y con la conexión caída lo tenía (con el error a la vista
 * pero sin nada que hacer). Se usa en el header de Calendario y en Mis calendarios.
 * No renderiza nada si la conexión está bien o no existe.
 */
export default function GoogleCalendarReconnectBanner({ onReconnected, className = '' }) {
  const { status, connecting, connect } = useGoogleCalendarConnection()
  const [error, setError] = useState(null)

  if (!status?.needsReconnect) return null

  async function reconnect() {
    setError(null)
    const res = await connect()
    if (res.ok) { onReconnected?.(); return }
    if (res.error && res.error !== 'cancelled' && res.error !== 'closed') setError(res.error)
  }

  return (
    <div role="alert" className={`flex flex-wrap items-start gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 ${className}`}>
      <Icon as={TriangleAlert} size={16} className="mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
      <div className="flex-1 min-w-[12rem]">
        <p className="text-sm text-red-800 dark:text-red-200">{COPY[status.status] || COPY.expired}</p>
        {status.status === 'missing_scope' && (
          <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-300/80">
            Al reconectar, dejá tildada la casilla del calendario en la pantalla de Google.
          </p>
        )}
        {error && <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
      </div>
      <button
        type="button"
        onClick={reconnect}
        disabled={connecting}
        className="flex-shrink-0 rounded-lg bg-red-600 hover:bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-60"
      >
        {connecting ? 'Conectando…' : 'Reconectar'}
      </button>
    </div>
  )
}
