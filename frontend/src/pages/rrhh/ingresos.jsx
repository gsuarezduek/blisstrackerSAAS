import { useState, useMemo } from 'react'
import api from '../../api/client'
import ConfirmModal from '../../components/ConfirmModal'
import { useWorkspace } from '../../context/WorkspaceContext'
import { TZ, fmtDate, fmtTime, minutesFromMidnight } from './shared'
import { Monitor, Pencil, Smartphone, Tablet, Trash2 } from 'lucide-react'
import { Icon } from '../../components/ui/Icon'

// ─── Ingresos de UNA persona ──────────────────────────────────────────────────
// Lo que queda de la vieja pestaña "Asistencia": el día a día de las conexiones,
// con corrección de la hora y borrado de un ingreso mal registrado. La pestaña
// entera (filtros de fecha, buscador, orden, acordeón por persona) desapareció al
// fusionarse con Ausencias — ahora el recorte lo da el mes de la tabla y esto se
// abre al clickear una fila (ver `tiempo.jsx`).
//
// El listado NO calcula agregados: la hora promedio y el total de tardanzas salen
// del backend junto con las ausencias, para que no haya dos cuentas distintas en
// la misma pantalla. Acá la tardanza se muestra por DÍA, que es un dato puntual y
// no un agregado: cuánto se pasó esa llegada del horario pactado.

const DEVICE_ICON  = { mobile: Smartphone, tablet: Tablet, desktop: Monitor }
const DEVICE_LABEL = { mobile: 'Celular', tablet: 'Tablet', desktop: 'Computadora' }

// Ventana de llegada ±2h: un ingreso fuera de ella no es una "llegada" (una
// conexión de domingo a la noche no es tardanza). Mismo criterio que el backend
// (`lib/attendance.js` inArrivalWindow); sin horario cargado no hay ventana.
const ARRIVAL_WINDOW = 120

export function PersonLogins({ user, logins, loading, onChanged }) {
  const { workspace } = useWorkspace()
  const attendanceEnabled = workspace?.attendanceTrackingEnabled !== false
  const tolerance = workspace?.lateToleranceMins ?? 0

  const [editingId, setEditingId] = useState(null)
  const [editTime, setEditTime]   = useState('')
  const [busyId, setBusyId]       = useState(null)
  const [error, setError]         = useState('')
  const [toDelete, setToDelete]   = useState(null)

  const schedule = useMemo(() => {
    if (!attendanceEnabled || !user?.workStartTime) return null
    const [h, mm] = user.workStartTime.split(':').map(Number)
    return { mins: h * 60 + mm, label: user.workStartTime }
  }, [user, attendanceEnabled])

  // Primer ingreso de cada día = la "llegada"; solo esa lleva el badge de tardanza.
  const { sorted, arrivalIds } = useMemo(() => {
    const sorted = [...logins].sort((a, b) => new Date(a.loginAt) - new Date(b.loginAt))
    const byDay = {}
    for (const l of sorted) {
      const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: TZ })
      if (!byDay[day]) byDay[day] = l
    }
    const ids = new Set(Object.values(byDay).filter(l => {
      if (!schedule) return false
      const mins = minutesFromMidnight(l.loginAt)
      return mins >= schedule.mins - ARRIVAL_WINDOW && mins <= schedule.mins + ARRIVAL_WINDOW
    }).map(l => l.id))
    return { sorted: sorted.reverse(), arrivalIds: ids }
  }, [logins, schedule])

  function startEdit(l) {
    setEditingId(l.id)
    const mins = minutesFromMidnight(l.loginAt)
    setEditTime(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`)
  }
  function cancelEdit() { setEditingId(null); setEditTime('') }

  async function saveEdit(l) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(editTime)) { setError('Escribí la hora como HH:MM (por ejemplo, 09:15).'); return }
    setError(''); setBusyId(l.id)
    try {
      await api.patch(`/admin/rrhh/logins/${l.id}`, { time: editTime })
      cancelEdit()
      onChanged?.()
    } catch { setError('No pudimos actualizar el ingreso. Probá de nuevo.') }
    finally { setBusyId(null) }
  }

  async function removeLogin() {
    if (!toDelete) return
    setError(''); setBusyId(toDelete.id)
    try {
      await api.delete(`/admin/rrhh/logins/${toDelete.id}`)
      onChanged?.()
    } catch { setError('No pudimos eliminar el ingreso. Probá de nuevo.') }
    finally { setBusyId(null); setToDelete(null) }
  }

  if (loading) return <p className="text-sm text-gray-400 dark:text-gray-500">Cargando ingresos…</p>
  if (sorted.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">Sin ingresos registrados en el mes.</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {sorted.length} ingreso{sorted.length !== 1 ? 's' : ''} en el mes
          {schedule && ` · horario ${schedule.label}`}
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-2 flex items-start justify-between gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm px-3 py-2">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Cerrar aviso" className="text-red-400 hover:text-red-600">×</button>
        </p>
      )}

      <ul className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700 max-h-80 overflow-y-auto">
        {sorted.map(l => {
          const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: TZ })
          const lateBy = arrivalIds.has(l.id) ? minutesFromMidnight(l.loginAt) - schedule.mins - tolerance : null
          const isEditing = editingId === l.id
          const isBusy = busyId === l.id
          return (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2">
              <p className="text-sm text-gray-600 dark:text-gray-300 flex-1 capitalize">{fmtDate(day)}</p>
              {!isEditing && lateBy !== null && (
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                  lateBy > 0
                    ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    : 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                }`}>{lateBy > 0 ? `+${lateBy} min` : 'a horario'}</span>
              )}
              {isEditing ? (
                <>
                  <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 flex-shrink-0" />
                  <button onClick={() => saveEdit(l)} disabled={isBusy}
                    className="text-xs px-2 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium flex-shrink-0 disabled:opacity-50">Guardar</button>
                  <button onClick={cancelEdit} disabled={isBusy}
                    className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex-shrink-0">Cancelar</button>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex-shrink-0">{fmtTime(l.loginAt)}</p>
                  {l.deviceType && (
                    <span title={DEVICE_LABEL[l.deviceType]} className="flex-shrink-0 text-gray-400"><Icon as={DEVICE_ICON[l.deviceType]} size={13} /></span>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                    l.method === 'google'
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}>{l.method === 'google' ? 'Google' : 'Email'}</span>
                  <button onClick={() => startEdit(l)} disabled={isBusy} title="Editar hora"
                    className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 flex-shrink-0 disabled:opacity-50"><Icon as={Pencil} size={15} /></button>
                  <button onClick={() => setToDelete(l)} disabled={isBusy} title="Eliminar ingreso"
                    className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 flex-shrink-0 disabled:opacity-50"><Icon as={Trash2} size={15} /></button>
                </>
              )}
            </li>
          )
        })}
      </ul>

      <ConfirmModal
        open={!!toDelete}
        title="Eliminar ingreso"
        message="No se puede deshacer."
        loading={busyId === toDelete?.id}
        onConfirm={removeLogin}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}
