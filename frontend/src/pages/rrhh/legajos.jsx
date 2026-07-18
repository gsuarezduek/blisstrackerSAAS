import { useState, useEffect } from 'react'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'
import LoadingSpinner from '../../components/LoadingSpinner'
import useLegajoFields from '../../hooks/useLegajoFields'
import useRoles from '../../hooks/useRoles'
import RoleBadge from '../../components/RoleBadge'
import { useWorkspace } from '../../context/WorkspaceContext'
import { fieldValue, displayValue } from '../../components/legajo/legajoUtils'
import { TZ, fmtDate, LEAVE_TYPE_LABELS, leaveDayCount, leaveRangeLabel } from './shared'

export function Field({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm text-gray-800 dark:text-gray-200">{value}</p>
    </div>
  )
}

export function VacationEditModal({ user, onClose, onUpdated }) {
  const [newDays, setNewDays]       = useState(String(user.vacationDays ?? 0))
  const [description, setDescription] = useState('')
  const [history, setHistory]       = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    api.get(`/vacation/admin/adjustments/${user.id}`)
      .then(r => setHistory(r.data))
      .catch(() => setHistory([]))
  }, [user.id])

  async function handleSave() {
    const days = parseInt(newDays, 10)
    if (isNaN(days) || days < 0) { setError('Ingresá un número válido de días (0 o más)'); return }
    if (!description.trim()) { setError('La descripción es requerida'); return }
    setSaving(true); setError('')
    try {
      const { data } = await api.patch(`/vacation/admin/adjust/${user.id}`, { newDays: days, description })
      onUpdated(data)
      onClose()
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
    } finally { setSaving(false) }
  }

  function fmtTs(iso) {
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">Editar días de vacaciones</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Días actuales → nuevos */}
          <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-0.5">Actual</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{user.vacationDays ?? 0}</p>
              <p className="text-xs text-gray-400">días</p>
            </div>
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            <div className="flex-1">
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Nueva cantidad</label>
              <input
                type="number" min="0" value={newDays}
                onChange={e => setNewDays(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-lg font-bold text-center bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
              Motivo / descripción <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3} value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Acumulación período 2026, descuento por licencia tomada…"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Historial toggle */}
          <button
            onClick={() => setShowHistory(v => !v)}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium flex items-center gap-1"
          >
            {showHistory ? '▲' : '▼'} Ver historial de ajustes
            {history !== null && <span className="text-gray-400">({history.length})</span>}
          </button>

          {showHistory && (
            <div className="max-h-52 overflow-y-auto space-y-2 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              {!history
                ? <p className="text-xs text-gray-400 text-center py-2">Cargando…</p>
                : history.length === 0
                  ? <p className="text-xs text-gray-400 text-center py-2">Sin historial de ajustes</p>
                  : history.map(adj => (
                      <div key={adj.id} className="flex items-start gap-3 text-xs">
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-700 dark:text-gray-200 font-medium truncate">{adj.description}</p>
                          <p className="text-gray-400 dark:text-gray-500">
                            Por {adj.admin.name} · {fmtTs(adj.createdAt)}
                          </p>
                        </div>
                        <span className={`flex-shrink-0 font-bold ${adj.newDays >= adj.prevDays ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                          {adj.prevDays} → {adj.newDays}
                        </span>
                      </div>
                    ))
              }
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
          <button
            onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function TabLegajos({ users, onVacationUpdate }) {
  const { labelFor } = useRoles()
  const { workspace } = useWorkspace()
  const { fields: legajoFields } = useLegajoFields()
  const [selectedId, setSelectedId] = useState('')
  const [summary, setSummary]       = useState(null)   // { avgLoginTime, loginCount, projects }
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [vacModalOpen, setVacModalOpen] = useState(false)
  const [showLoginDays, setShowLoginDays] = useState(false)
  const [leaveYear, setLeaveYear] = useState(new Date().getFullYear())

  const selected = users.find(u => String(u.id) === selectedId) ?? null

  useEffect(() => {
    setShowLoginDays(false)
    setLeaveYear(new Date().getFullYear())
    if (!selectedId) { setSummary(null); return }
    setSummaryLoading(true)
    api.get(`/admin/rrhh/user-summary/${selectedId}`)
      .then(r => setSummary(r.data))
      .catch(() => setSummary(null))
      .finally(() => setSummaryLoading(false))
  }, [selectedId])

  // Recarga el resumen sin tocar el estado de carga (para refrescar tras editar/eliminar un ingreso).
  function reloadSummary() {
    if (!selectedId) return Promise.resolve()
    return api.get(`/admin/rrhh/user-summary/${selectedId}`)
      .then(r => setSummary(r.data))
      .catch(() => {})
  }

  // Campos visibles del legajo con su valor mostrable para la persona seleccionada.
  const legajoRows = selected
    ? legajoFields
        .filter(f => f.enabled !== false)
        .sort((a, b) => a.order - b.order)
        .map(f => ({ key: f.key, label: f.label, value: displayValue(f, fieldValue(selected, f)) }))
        .filter(r => r.value !== null && r.value !== undefined && r.value !== '')
    : []
  const hasPersonalData = legajoRows.length > 0

  // Licencias tomadas (aprobadas) de la persona en el año seleccionado.
  const allLeaves = summary?.leaves ?? []
  const yearLeaves = allLeaves.filter(l => Number(l.startDate.slice(0, 4)) === leaveYear)
  const yearLeaveDays = yearLeaves.reduce((s, l) => s + leaveDayCount(l.startDate, l.endDate), 0)

  return (
    <div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <label className="text-xs text-gray-500 dark:text-gray-400 font-medium block mb-1.5">Seleccionar persona</label>
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
          className="w-full sm:w-72 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">— Elegir persona —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      {!selected && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-3">👤</p>
          <p className="font-medium">Seleccioná una persona para ver su legajo</p>
        </div>
      )}

      {selected && (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-6 py-5 flex items-center gap-4">
            <img src={avatarUrl(selected.avatar)} alt={selected.name}
              className="w-14 h-14 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600 flex-shrink-0" />
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{selected.name}</p>
              <RoleBadge role={selected.role} userId={selected.id} className="inline-block mt-1" />
              {selected.workspaceJoinedAt && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  📅 En {workspace?.name ?? 'el equipo'} desde el {new Date(selected.workspaceJoinedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })}
                </p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{selected.email}</p>
            </div>
          </div>

          {/* Datos de acceso y actividad */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Horario promedio de ingreso + puntualidad — clickeable para ver el desglose por día */}
            {(() => {
              const hasDays = summary?.loginDays?.length > 0
              return (
                <div
                  className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 ${hasDays ? 'cursor-pointer hover:border-primary-300 dark:hover:border-primary-600 transition-colors' : ''}`}
                  onClick={hasDays ? () => setShowLoginDays(true) : undefined}
                  role={hasDays ? 'button' : undefined}
                  title={hasDays ? 'Ver desglose día por día' : undefined}
                >
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                    🕐 Horario promedio de ingreso
                  </p>
                  {summaryLoading
                    ? <LoadingSpinner size="sm" className="mt-1" />
                    : summary?.avgLoginTime
                      ? <>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{summary.avgLoginTime}</p>
                          {summary.punctuality
                            ? (() => {
                                const p = summary.punctuality
                                const late = p.avgLateMins > 0
                                return (
                                  <>
                                    <p className={`text-xs font-medium mt-0.5 ${late ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                      Esperado {p.expectedStart}{p.toleranceMins > 0 ? ` (+${p.toleranceMins} min tol.)` : ''} · {late ? `+${p.avgLateMins} min promedio` : 'a horario'}
                                    </p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                      {p.onTimeDays}/{p.daysCount} día{p.daysCount !== 1 ? 's' : ''} puntual ({p.punctualityPct}%)
                                    </p>
                                  </>
                                )
                              })()
                            : <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                sobre {summary.loginCount} ingreso{summary.loginCount !== 1 ? 's' : ''}
                                {summary.attendanceTrackingEnabled !== false && !summary.workStartTime && ' · configurá el horario en Equipo para ver tardanzas'}
                              </p>
                          }
                          {hasDays && (
                            <p className="text-xs text-primary-600 dark:text-primary-400 mt-1.5 font-medium">Ver desglose por día →</p>
                          )}
                        </>
                      : <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Sin registros</p>
                  }
                </div>
              )
            })()}

            {/* Proyectos */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                📁 Proyectos
              </p>
              {summaryLoading
                ? <LoadingSpinner size="sm" className="mt-1" />
                : !summary?.projects?.length
                  ? <p className="text-sm text-gray-400 dark:text-gray-500">Sin proyectos asignados</p>
                  : <div className="flex flex-col gap-1.5">
                      {summary.projects.map(p => (
                        <div key={p.id} className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-green-400" />
                          <p className="text-sm truncate text-gray-800 dark:text-gray-200">{p.name}</p>
                        </div>
                      ))}
                    </div>
              }
            </div>

            {/* Vacaciones */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                🏖️ Días de vacaciones pendientes
              </p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {selected.vacationDays ?? 0}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">días disponibles</p>
              <button
                onClick={() => setVacModalOpen(true)}
                className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Editar días
              </button>
            </div>
          </div>

          {/* Licencias tomadas — por año calendario, con navegación */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                🏖️ Licencias tomadas
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setLeaveYear(y => y - 1)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Año anterior"
                >◀</button>
                <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums w-12 text-center">{leaveYear}</span>
                <button
                  onClick={() => setLeaveYear(y => y + 1)}
                  disabled={leaveYear >= new Date().getFullYear()}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Año siguiente"
                >▶</button>
              </div>
            </div>
            {summaryLoading
              ? <LoadingSpinner size="sm" className="py-4" />
              : yearLeaves.length === 0
                ? <p className="text-sm text-gray-400 dark:text-gray-500 py-2">Sin licencias registradas en {leaveYear}.</p>
                : <>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{yearLeaveDays}</span> día{yearLeaveDays !== 1 ? 's' : ''} en {yearLeaves.length} licencia{yearLeaves.length !== 1 ? 's' : ''}
                    </p>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                      {yearLeaves.map(l => (
                        <div key={l.id} className="flex items-start justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{LEAVE_TYPE_LABELS[l.type] ?? l.type}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{leaveRangeLabel(l.startDate, l.endDate)}</p>
                            {l.observation && <p className="text-xs text-gray-400 dark:text-gray-500 italic mt-0.5 truncate">{l.observation}</p>}
                          </div>
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 flex-shrink-0 tabular-nums">
                            {leaveDayCount(l.startDate, l.endDate)} día{leaveDayCount(l.startDate, l.endDate) !== 1 ? 's' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
            }
          </div>

          {/* Datos personales */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-6 pt-5 pb-3">
              📋 Datos personales
            </p>
            {!hasPersonalData
              ? <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8 pb-10">Esta persona aún no completó sus datos personales.</p>
              : <div className="px-6 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  {legajoRows.map(r => (
                    <Field key={r.key} label={r.label} value={r.value} />
                  ))}
                </div>
            }
          </div>
        </div>
      )}

      {vacModalOpen && selected && (
        <VacationEditModal
          user={selected}
          onClose={() => setVacModalOpen(false)}
          onUpdated={data => {
            onVacationUpdate(data)
            setVacModalOpen(false)
          }}
        />
      )}

      {showLoginDays && selected && summary?.loginDays?.length > 0 && (
        <LoginDaysModal user={selected} summary={summary} onChanged={reloadSummary} onClose={() => setShowLoginDays(false)} />
      )}
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

  function startEdit(d) { setEditingId(d.id); setEditTime(d.time) }
  function cancelEdit()  { setEditingId(null); setEditTime('') }

  async function saveEdit(d) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(editTime)) { alert('Hora inválida (HH:MM)'); return }
    setBusyId(d.id)
    try {
      await api.patch(`/admin/rrhh/logins/${d.id}`, { time: editTime })
      cancelEdit()
      await onChanged?.()
    } catch { alert('No se pudo actualizar el ingreso') }
    finally { setBusyId(null) }
  }

  async function removeLogin(d) {
    if (!window.confirm(`¿Eliminar el ingreso del ${fmtDate(d.date)}? No se puede deshacer.`)) return
    setBusyId(d.id)
    try {
      await api.delete(`/admin/rrhh/logins/${d.id}`)
      await onChanged?.()
    } catch { alert('No se pudo eliminar el ingreso') }
    finally { setBusyId(null) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md max-h-[80vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">🕐 Primer ingreso por día</p>
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
                        className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 disabled:opacity-50">✏️</button>
                      <button onClick={() => removeLogin(d)} disabled={isBusy} title="Eliminar ingreso"
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50">🗑️</button>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
          {days.length} día{days.length !== 1 ? 's' : ''} con registro · se muestra solo el primer ingreso de cada día
        </div>
      </div>
    </div>
  )
}

// ─── Tab Vacaciones y Licencias ───────────────────────────────────────────────

