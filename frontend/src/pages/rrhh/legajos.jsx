import { useState } from 'react'
import api from '../../api/client'
import ConfirmModal from '../../components/ConfirmModal'
import { fmtDate } from './shared'
import { Pencil, Trash2 } from 'lucide-react'
import { Icon } from '../../components/ui/Icon'

// Piezas del legajo reutilizadas por la ficha de Personas (rrhh/personas.jsx) y
// por el panel de admin del perfil (components/profile/AdminUserPanel.jsx).

export function Field({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm text-gray-800 dark:text-gray-200">{value}</p>
    </div>
  )
}


// Desglose día por día del primer ingreso de una persona (modal).
// Permite editar la hora o eliminar el ingreso que distorsiona el promedio.
export function LoginDaysModal({ user, summary, onChanged, onClose }) {
  const days = summary.loginDays ?? []
  const showLate = summary.attendanceTrackingEnabled !== false && !!summary.workStartTime
  const [editingId, setEditingId] = useState(null)
  const [editTime, setEditTime]   = useState('')
  const [busyId, setBusyId]       = useState(null)
  const [actionError, setActionError] = useState('')
  const [loginToDelete, setLoginToDelete] = useState(null)   // día | null

  function startEdit(d) { setEditingId(d.id); setEditTime(d.time) }
  function cancelEdit()  { setEditingId(null); setEditTime('') }

  async function saveEdit(d) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(editTime)) { setActionError('Escribí la hora como HH:MM (por ejemplo, 09:15).'); return }
    setActionError('')
    setBusyId(d.id)
    try {
      await api.patch(`/admin/rrhh/logins/${d.id}`, { time: editTime })
      cancelEdit()
      await onChanged?.()
    } catch { setActionError('No pudimos actualizar el ingreso. Probá de nuevo.') }
    finally { setBusyId(null) }
  }

  async function removeLogin() {
    if (!loginToDelete) return
    setActionError('')
    setBusyId(loginToDelete.id)
    try {
      await api.delete(`/admin/rrhh/logins/${loginToDelete.id}`)
      await onChanged?.()
    } catch { setActionError('No pudimos eliminar el ingreso. Probá de nuevo.') }
    finally { setBusyId(null); setLoginToDelete(null) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md max-h-[80vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">Primer ingreso por día</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {user.name} · promedio {summary.avgLoginTime}
              {showLate && ` · horario ${summary.workStartTime}`}
              {showLate && summary.lateToleranceMins > 0 && ` (+${summary.lateToleranceMins} min tol.)`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto px-5 py-3">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {days.map(d => {
              const isEditing = editingId === d.id
              const isBusy = busyId === d.id
              return (
                <div key={d.date} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300 capitalize flex-1 min-w-0 truncate">{fmtDate(d.date)}</span>
                  {isEditing ? (
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                      <input
                        type="time"
                        value={editTime}
                        onChange={e => setEditTime(e.target.value)}
                        className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 w-28"
                      />
                      <button onClick={() => saveEdit(d)} disabled={isBusy}
                        className="text-xs px-2 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50">Guardar</button>
                      <button onClick={cancelEdit} disabled={isBusy}
                        className="text-xs px-1.5 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">×</button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">{d.time}</span>
                      {showLate && d.lateBy != null && (
                        d.lateBy > 0
                          ? <span className="text-xs font-medium text-red-600 dark:text-red-400 tabular-nums">+{d.lateBy} min</span>
                          : <span className="text-xs font-medium text-green-600 dark:text-green-400">a horario</span>
                      )}
                      <button onClick={() => startEdit(d)} disabled={isBusy} title="Editar hora"
                        className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50"><Icon as={Pencil} size={15} /></button>
                      <button onClick={() => setLoginToDelete(d)} disabled={isBusy} title="Eliminar ingreso"
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"><Icon as={Trash2} size={15} /></button>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {actionError && (
          <p role="alert" className="mx-5 mb-3 flex items-start justify-between gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm px-3 py-2">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError('')} aria-label="Cerrar aviso" className="text-red-400 hover:text-red-600">×</button>
          </p>
        )}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
          {days.length} día{days.length !== 1 ? 's' : ''} con registro · se muestra solo el primer ingreso de cada día
        </div>
      </div>

      <ConfirmModal
        open={!!loginToDelete}
        title="Eliminar ingreso"
        message={loginToDelete ? `El ingreso del ${fmtDate(loginToDelete.date)} no se puede deshacer.` : ''}
        loading={busyId === loginToDelete?.id}
        onConfirm={removeLogin}
        onCancel={() => setLoginToDelete(null)}
      />
    </div>
  )
}

