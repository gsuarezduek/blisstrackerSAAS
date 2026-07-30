import { useState, useEffect, useMemo } from 'react'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'
import LoadingSpinner from '../../components/LoadingSpinner'
import RoleBadge from '../../components/RoleBadge'
import { useWorkspace } from '../../context/WorkspaceContext'
import { TZ, todayBA, todayStr, fmtDate, fmtTime, minutesFromMidnight, minsToTime } from './shared'

const DEVICE_ICON  = { mobile: '📱', tablet: '📱', desktop: '💻' }
const DEVICE_LABEL = { mobile: 'Celular', tablet: 'Tablet', desktop: 'Computadora' }

export function dateShortcuts() {
  const t = todayBA()
  const fmt = d => d.toLocaleDateString('en-CA', { timeZone: TZ })

  const dow        = t.getDay() === 0 ? 6 : t.getDay() - 1   // lunes=0
  const monday     = new Date(t); monday.setDate(t.getDate() - dow)
  const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7)
  const lastSunday = new Date(monday); lastSunday.setDate(monday.getDate() - 1)

  const firstThisMonth = new Date(t.getFullYear(), t.getMonth(), 1)
  const firstLastMonth = new Date(t.getFullYear(), t.getMonth() - 1, 1)
  const lastLastMonth  = new Date(t.getFullYear(), t.getMonth(), 0)

  return [
    { label: 'Hoy',           from: fmt(t),             to: fmt(t) },
    { label: 'Esta semana',   from: fmt(monday),         to: fmt(t) },
    { label: 'Semana pasada', from: fmt(lastMonday),     to: fmt(lastSunday) },
    { label: 'Este mes',      from: fmt(firstThisMonth), to: fmt(t) },
    { label: 'Mes pasado',    from: fmt(firstLastMonth), to: fmt(lastLastMonth) },
  ]
}

export function TabIngresos({ users }) {
  const { workspace } = useWorkspace()
  const attendanceEnabled = workspace?.attendanceTrackingEnabled !== false
  const tolerance = workspace?.lateToleranceMins ?? 0
  const [logins, setLogins]     = useState([])
  const [loading, setLoading]   = useState(false)
  const [from, setFrom]         = useState(todayStr)
  const [to, setTo]             = useState(todayStr)
  const [userId, setUserId]     = useState('')
  const [expanded, setExpanded] = useState({})   // { [userId]: true }
  const [activeShortcut, setActiveShortcut] = useState('Hoy')
  const [sortOrder, setSortOrder] = useState('asc')  // 'asc' | 'desc'
  const [editingId, setEditingId] = useState(null)   // id del ingreso en edición
  const [editTime, setEditTime]   = useState('')
  const [busyId, setBusyId]       = useState(null)   // id del ingreso con acción en curso

  const shortcuts = useMemo(() => dateShortcuts(), [])

  useEffect(() => { fetchLogins() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchLogins() {
    setLoading(true)
    setExpanded({})
    try {
      const params = new URLSearchParams({ from, to })
      if (userId) params.set('userId', userId)
      const { data } = await api.get(`/admin/rrhh/logins?${params}`)
      setLogins(data)
    } finally { setLoading(false) }
  }

  function startEdit(l) {
    setEditingId(l.id)
    setEditTime(minsToTime(minutesFromMidnight(l.loginAt)))
  }
  function cancelEdit() { setEditingId(null); setEditTime('') }

  async function saveEdit(l) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(editTime)) { alert('Hora inválida (HH:MM)'); return }
    setBusyId(l.id)
    try {
      await api.patch(`/admin/rrhh/logins/${l.id}`, { time: editTime })
      cancelEdit()
      await fetchLogins()
    } catch { alert('No se pudo actualizar el ingreso') }
    finally { setBusyId(null) }
  }

  async function removeLogin(l) {
    if (!window.confirm('¿Eliminar este ingreso? No se puede deshacer.')) return
    setBusyId(l.id)
    try {
      await api.delete(`/admin/rrhh/logins/${l.id}`)
      await fetchLogins()
    } catch { alert('No se pudo eliminar el ingreso') }
    finally { setBusyId(null) }
  }

  function applyShortcut(s) {
    setFrom(s.from)
    setTo(s.to)
    setActiveShortcut(s.label)
  }

  // Limpiar shortcut activo si el usuario cambia las fechas manualmente
  function handleFromChange(v) { setFrom(v); setActiveShortcut(null) }
  function handleToChange(v)   { setTo(v);   setActiveShortcut(null) }

  function toggleExpanded(uid) {
    setExpanded(prev => ({ ...prev, [uid]: !prev[uid] }))
  }

  // Mapa userId → minutos del horario de inicio configurado (null si no tiene).
  // Vacío si el seguimiento de horarios está apagado → no se muestran tardanzas.
  const startMinsMap = useMemo(() => {
    const m = {}
    if (!attendanceEnabled) return m
    for (const u of users) {
      if (u.workStartTime) {
        const [h, mm] = u.workStartTime.split(':').map(Number)
        m[u.id] = { mins: h * 60 + mm, label: u.workStartTime }
      }
    }
    return m
  }, [users, attendanceEnabled])

  // Ventana de llegada ±2h alrededor del horario: un ingreso fuera de la ventana no es una "llegada"
  // (descarta conexiones sueltas de finde/noche que ensucian el promedio). Sin horario no se filtra.
  // (La normalización de "días laborables" >50% vive en Productividad/dashboard/snapshots, que ven
  // todo el equipo en un período; acá el rango puede ser un solo día o una sola persona.)
  const ARRIVAL_WINDOW = 120

  const byUser = useMemo(() => {
    const map = {}
    for (const l of logins) {
      if (!map[l.userId]) map[l.userId] = { user: l.user, logins: [] }
      map[l.userId].logins.push(l)
    }
    for (const uid of Object.keys(map))
      map[uid].logins.sort((a, b) => new Date(a.loginAt) - new Date(b.loginAt))
    return Object.values(map).map(({ user, logins }) => {
      // Primer ingreso de cada día
      const byDay = {}
      for (const l of logins) {
        const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: TZ })
        if (!byDay[day]) byDay[day] = l   // logins ya ordenados asc → primero gana
      }
      const schedule = startMinsMap[user.id] ?? null
      // "Llegadas" válidas para promedio/tardanza: dentro de la ventana ±2h (sin horario, todas).
      const arrivals = Object.values(byDay).filter(l => {
        if (!schedule) return true
        const mins = minutesFromMidnight(l.loginAt)
        return mins >= schedule.mins - ARRIVAL_WINDOW && mins <= schedule.mins + ARRIVAL_WINDOW
      })
      const firstIds = new Set(arrivals.map(l => l.id))   // solo llegadas válidas llevan badge
      const avgMins = arrivals.length
        ? arrivals.reduce((acc, l) => acc + minutesFromMidnight(l.loginAt), 0) / arrivals.length
        : null
      let lateDays = 0
      if (schedule) {
        for (const l of arrivals) {
          if (minutesFromMidnight(l.loginAt) - schedule.mins > tolerance) lateDays++
        }
      }
      return {
        user, logins, avgMins, avgTime: avgMins != null ? minsToTime(avgMins) : '—',
        schedule, firstIds, daysCount: arrivals.length, lateDays,
      }
    }).sort((a, b) => {
      const av = a.avgMins ?? Infinity, bv = b.avgMins ?? Infinity
      return sortOrder === 'asc' ? av - bv : bv - av
    })
  }, [logins, sortOrder, startMinsMap, tolerance])

  return (
    <div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        {/* Atajos de fecha */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {shortcuts.map(s => (
            <button
              key={s.label}
              onClick={() => applyShortcut(s)}
              className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                activeShortcut === s.label
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Filtros manuales + buscar */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Desde</label>
            <input type="date" value={from} onChange={e => handleFromChange(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Hasta</label>
            <input type="date" value={to} onChange={e => handleToChange(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Persona</label>
            <select value={userId} onChange={e => setUserId(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Todos</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <button onClick={fetchLogins} disabled={loading}
            className="px-4 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>

        {!loading && logins.length > 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
            {logins.length} ingreso{logins.length !== 1 ? 's' : ''} · {byUser.length} persona{byUser.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Ordenar — solo visible cuando hay resultados */}
      {!loading && byUser.length > 1 && (
        <div className="flex justify-end mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">Ordenar por horario</span>
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-xs">
              <button
                onClick={() => setSortOrder('asc')}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  sortOrder === 'asc'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >↑ Más temprano</button>
              <button
                onClick={() => setSortOrder('desc')}
                className={`px-3 py-1.5 font-medium transition-colors border-l border-gray-300 dark:border-gray-600 ${
                  sortOrder === 'desc'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >↓ Más tarde</button>
            </div>
          </div>
        </div>
      )}

      {loading && <LoadingSpinner className="py-12" />}

      {!loading && logins.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-3">🔍</p>
          <p className="font-medium">Sin ingresos en el período</p>
        </div>
      )}

      {!loading && byUser.map(({ user, logins: ul, avgTime, schedule, firstIds, daysCount, lateDays }) => (
        <div key={user.id} className="mb-3">
          {/* Header colapsable */}
          <button
            onClick={() => toggleExpanded(user.id)}
            className="w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <img src={avatarUrl(user.avatar)} alt={user.name}
              className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{user.name}</p>
                <RoleBadge role={user.role} userId={user.id} />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {ul.length} ingreso{ul.length !== 1 ? 's' : ''} · promedio {avgTime}
                {schedule && ` · horario ${schedule.label}`}
              </p>
            </div>
            {schedule && (
              <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                lateDays === 0
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}>
                {lateDays === 0 ? 'Puntual' : `${lateDays}/${daysCount} tarde`}
              </span>
            )}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${expanded[user.id] ? 'rotate-180' : ''}`}>
              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Detalle expandido */}
          {expanded[user.id] && (
            <div className="mt-1 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
              {ul.map(l => {
                const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: TZ })
                // Tardanza solo para el primer ingreso del día (la "llegada")
                const isFirst = firstIds.has(l.id)
                const lateBy = schedule && isFirst ? minutesFromMidnight(l.loginAt) - schedule.mins - tolerance : null
                const isEditing = editingId === l.id
                const isBusy = busyId === l.id
                return (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
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
                        <input
                          type="time"
                          value={editTime}
                          onChange={e => setEditTime(e.target.value)}
                          className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 flex-shrink-0"
                        />
                        <button onClick={() => saveEdit(l)} disabled={isBusy}
                          className="text-xs px-2 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium flex-shrink-0 disabled:opacity-50">
                          Guardar
                        </button>
                        <button onClick={cancelEdit} disabled={isBusy}
                          className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex-shrink-0">
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex-shrink-0">{fmtTime(l.loginAt)}</p>
                        {l.deviceType && (
                          <span title={DEVICE_LABEL[l.deviceType]} className="text-sm flex-shrink-0">{DEVICE_ICON[l.deviceType]}</span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                          l.method === 'google'
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}>{l.method === 'google' ? 'Google' : 'Email'}</span>
                        <button onClick={() => startEdit(l)} disabled={isBusy} title="Editar hora"
                          className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 flex-shrink-0 disabled:opacity-50">✏️</button>
                        <button onClick={() => removeLogin(l)} disabled={isBusy} title="Eliminar ingreso"
                          className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 flex-shrink-0 disabled:opacity-50">🗑️</button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Tab Legajos ──────────────────────────────────────────────────────────────

