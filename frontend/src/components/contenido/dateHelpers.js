// Helpers de fecha compartidos por la Tabla, el Calendario y el modal de detalle.

// El <input type="datetime-local"> trabaja en la hora local del navegador. Para
// un equipo que opera en la misma zona que sus proyectos (el caso normal) eso
// coincide con lo que se espera; el backend recibe el instante en ISO y deriva
// `scheduledDate` en la timezone del proyecto, que es lo que agrupa el calendario.
export function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
