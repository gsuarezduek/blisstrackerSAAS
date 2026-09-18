import useGoogleCalendarConnection from './useGoogleCalendarConnection'

/**
 * Conexión personal con Google Calendar (push de eventos agendados) — botón
 * compacto para el header de Calendario.jsx. Mientras el scope `calendar.events`
 * no esté verificado por Google, esto solo funciona para la cuenta del
 * desarrollador o testers agregados a mano (ver CLAUDE.md).
 */
export default function GoogleCalendarConnectButton() {
  const { status, connecting, connect, disconnect } = useGoogleCalendarConnection()

  if (!status) return null

  if (status.connected) {
    return (
      <button
        onClick={() => { if (window.confirm('¿Desconectar Google Calendar? Dejarán de empujarse tus próximas reuniones agendadas.')) disconnect() }}
        title={`Conectado como ${status.accountEmail}`}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
      >
        📅 Google Calendar conectado
      </button>
    )
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      title="Empuja tus reuniones agendadas a tu Google Calendar"
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
    >
      {connecting ? 'Conectando…' : '📅 Conectar Google Calendar'}
    </button>
  )
}
