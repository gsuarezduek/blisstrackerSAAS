import { useState, useEffect, useMemo } from 'react'
import Navbar from '../components/Navbar'
import api from '../api/client'
import useRoles from '../hooks/useRoles'

const TZ = 'America/Argentina/Buenos_Aires'

function todayBA() {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function todayStr()    { return new Date().toLocaleDateString('en-CA', { timeZone: TZ }) }
function thirtyDaysAgo() {
  const d = new Date(); d.setDate(d.getDate() - 30)
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}
function fmtDate(isoDay) {
  return new Date(isoDay + 'T12:00:00').toLocaleDateString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ,
  })
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
}
function fmtDateShort(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: TZ })
}
function minutesFromMidnight(iso) {
  const d = new Date(iso)
  const h = Number(d.toLocaleString('en-CA', { hour: 'numeric', hour12: false, timeZone: TZ }))
  const m = Number(d.toLocaleString('en-CA', { minute: 'numeric', timeZone: TZ }))
  return h * 60 + m
}
function minsToTime(mins) {
  const h = Math.floor(mins / 60), m = Math.round(mins % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Días hasta la próxima ocurrencia de un mes/día (sin importar el año)
function daysUntilNextOccurrence(month0, day) {
  const today = todayBA()
  let next = new Date(today.getFullYear(), month0, day)
  if (next < today) next = new Date(today.getFullYear() + 1, month0, day)
  return Math.round((next - today) / 86400000)
}

function relativeDay(days) {
  if (days === 0) return 'hoy'
  if (days === 1) return 'mañana'
  return `en ${days} días`
}

const PERSONAL_FIELDS = ['phone','birthday','address','dni','cuit','alias',
  'maritalStatus','children','educationLevel','educationTitle',
  'bloodType','medicalConditions','healthInsurance','emergencyContact']

// ─── Mini Dashboard ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
      <span className="text-2xl flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-primary-600 dark:text-primary-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function StatCardSlider({ slides }) {
  const [active, setActive] = useState(0)
  const { icon, label, value, sub } = slides[active]
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4 relative">
      <div className="absolute top-3 right-3 flex gap-1">
        {slides.map((_, i) => (
          <button key={i} onClick={() => setActive(i)}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === active
                ? 'bg-gray-400 dark:bg-gray-400'
                : 'bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500'
            }`}
          />
        ))}
      </div>
      <span className="text-2xl flex-shrink-0">{icon}</span>
      <div className="min-w-0 pr-6">
        <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-primary-600 dark:text-primary-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function MiniDashboard({ users, lastLoginsMap, dashStats }) {
  const { labelFor } = useRoles()
  const today = todayBA()
  const HORIZON = 30

  const activeUsers = users.filter(u => u.active)

  // Promedio de antigüedad en años
  const avgTenureYears = useMemo(() => {
    if (!activeUsers.length) return 0
    const avg = activeUsers.reduce((acc, u) => {
      const years = (today - new Date(u.createdAt)) / (365.25 * 86400000)
      return acc + years
    }, 0) / activeUsers.length
    return avg < 1
      ? `${Math.round(avg * 12)} meses`
      : `${avg.toFixed(1)} años`
  }, [activeUsers])

  // Legajos incompletos
  const incompleteCount = activeUsers.filter(u =>
    PERSONAL_FIELDS.every(f => u[f] === null || u[f] === undefined || u[f] === '')
  ).length

  // Distribución por roles
  const roleDistrib = useMemo(() => {
    const map = {}
    for (const u of activeUsers) {
      map[u.role] = (map[u.role] || 0) + 1
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [activeUsers])

  // Próximos cumpleaños (30 días)
  const upcomingBirthdays = useMemo(() =>
    activeUsers
      .filter(u => u.birthday)
      .map(u => {
        const b = new Date(u.birthday)
        const days = daysUntilNextOccurrence(b.getMonth(), b.getDate())
        return { ...u, days }
      })
      .filter(u => u.days <= HORIZON)
      .sort((a, b) => a.days - b.days)
  , [activeUsers])

  // Aniversarios laborales (30 días, solo >= 1 año)
  const upcomingAnniversaries = useMemo(() =>
    activeUsers
      .map(u => {
        const created = new Date(u.createdAt)
        const years = today.getFullYear() - created.getFullYear()
        const days  = daysUntilNextOccurrence(created.getMonth(), created.getDate())
        // El año que cumple en este ciclo
        const yearsThisCycle = days === 0
          ? today.getFullYear() - created.getFullYear()
          : (new Date(today.getFullYear(), created.getMonth(), created.getDate()) >= today ? years : years + 1)
        return { ...u, days, yearsThisCycle }
      })
      .filter(u => u.days <= HORIZON && u.yearsThisCycle >= 1)
      .sort((a, b) => a.days - b.days)
  , [activeUsers])

  // Último ingreso por persona
  const lastLoginRows = useMemo(() =>
    activeUsers
      .map(u => ({ ...u, lastLogin: lastLoginsMap[u.id] ?? null }))
      .sort((a, b) => {
        if (!a.lastLogin && !b.lastLogin) return 0
        if (!a.lastLogin) return 1
        if (!b.lastLogin) return -1
        return new Date(b.lastLogin) - new Date(a.lastLogin)
      })
  , [activeUsers, lastLoginsMap])

  function daysSince(iso) {
    if (!iso) return null
    const diff = Math.floor((today - new Date(iso)) / 86400000)
    if (diff === 0) return 'hoy'
    if (diff === 1) return 'ayer'
    return `hace ${diff} días`
  }

  const maxRole = roleDistrib[0]?.[1] || 1

  // Promedio global de horario de ingreso (promedio de los últimos logins de cada usuario activo)
  const globalAvgLoginTime = useMemo(() => {
    const times = activeUsers
      .map(u => lastLoginsMap[u.id])
      .filter(Boolean)
      .map(iso => minutesFromMidnight(iso))
    if (!times.length) return null
    return minsToTime(times.reduce((a, b) => a + b, 0) / times.length)
  }, [activeUsers, lastLoginsMap])

  const todayBA_str = todayStr()
  const loggedInToday = activeUsers.filter(u => {
    const last = lastLoginsMap[u.id]
    return last && new Date(last).toLocaleDateString('en-CA', { timeZone: TZ }) === todayBA_str
  }).length

  return (
    <div className="mb-6 space-y-3">
      {/* Fila 1: stats numéricas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon="👥" label="Personas activas"      value={activeUsers.length} />
        <StatCardSlider slides={[
          { icon: '📅', label: 'Antigüedad promedio',       value: avgTenureYears,                        sub: 'del equipo activo' },
          { icon: '📁', label: 'Proyectos por persona',     value: dashStats.projectsPerPerson,           sub: 'promedio de asignaciones' },
          { icon: '🕐', label: 'Horario promedio de ingreso', value: globalAvgLoginTime ?? '—',           sub: 'sobre últimos registros' },
        ]} />
        <StatCardSlider slides={[
          {   icon: '🟢',  label: 'Iniciaron sesión hoy', value: `${loggedInToday} / ${activeUsers.length}`,
              sub: loggedInToday === activeUsers.length ? 'Todo el equipo conectado' : `${activeUsers.length - loggedInToday} aún no ingresaron` },
          incompleteCount > 0
            ? { icon: '📋', label: 'Legajos incompletos', value: incompleteCount,  sub: 'Sin datos personales' }
            : { icon: '✅', label: 'Legajos completos',   value: activeUsers.length, sub: 'Todos completos ✓' },
        ]} />
      </div>

      {/* Fila 2: cumpleaños + aniversarios */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Próximos cumpleaños */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            🎂 Próximos cumpleaños
          </p>
          {upcomingBirthdays.length === 0
            ? <p className="text-sm text-gray-400 dark:text-gray-500">Ninguno en los próximos 30 días</p>
            : <div className="space-y-2">
                {upcomingBirthdays.map(u => (
                  <div key={u.id} className="flex items-center gap-2.5">
                    <img src={`/perfiles/${u.avatar || 'bee.png'}`} alt={u.name}
                      className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{u.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {fmtDateShort(u.birthday)}
                      </p>
                    </div>
                    <span className={`text-xs font-medium flex-shrink-0 ${
                      u.days === 0 ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
                    }`}>{relativeDay(u.days)}</span>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Aniversarios laborales */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            🎉 Aniversarios en Bliss
          </p>
          {upcomingAnniversaries.length === 0
            ? <p className="text-sm text-gray-400 dark:text-gray-500">Ninguno en los próximos 30 días</p>
            : <div className="space-y-2">
                {upcomingAnniversaries.map(u => (
                  <div key={u.id} className="flex items-center gap-2.5">
                    <img src={`/perfiles/${u.avatar || 'bee.png'}`} alt={u.name}
                      className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{u.name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {u.yearsThisCycle} {u.yearsThisCycle === 1 ? 'año' : 'años'} en Bliss
                      </p>
                    </div>
                    <span className={`text-xs font-medium flex-shrink-0 ${
                      u.days === 0 ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'
                    }`}>{relativeDay(u.days)}</span>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

      {/* Fila 3: distribución por roles + último ingreso */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Distribución por roles */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            📊 Distribución por roles
          </p>
          <div className="space-y-2">
            {roleDistrib.map(([role, count]) => (
              <div key={role} className="flex items-center gap-2">
                <p className="text-xs text-gray-600 dark:text-gray-300 w-28 truncate flex-shrink-0">
                  {labelFor(role)}
                </p>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className="bg-primary-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${(count / maxRole) * 100}%` }}
                  />
                </div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-4 text-right flex-shrink-0">
                  {count}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Último ingreso */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            🕐 Último ingreso
          </p>
          <div className="space-y-2">
            {lastLoginRows.slice(0, 10).map(u => (
              <div key={u.id} className="flex items-center gap-2.5">
                <img src={`/perfiles/${u.avatar || 'bee.png'}`} alt={u.name}
                  className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{u.name}</p>
                <span className={`text-xs flex-shrink-0 font-medium ${
                  !u.lastLogin ? 'text-gray-300 dark:text-gray-600' :
                  daysSince(u.lastLogin) === 'hoy' || daysSince(u.lastLogin) === 'ayer'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {u.lastLogin ? daysSince(u.lastLogin) : 'Sin registros'}
                </span>
              </div>
            ))}
            {lastLoginRows.length > 10 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">
                +{lastLoginRows.length - 10} más — ver en Legajos
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab Ingresos ─────────────────────────────────────────────────────────────

function dateShortcuts() {
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

function TabIngresos({ users }) {
  const [logins, setLogins]     = useState([])
  const [loading, setLoading]   = useState(false)
  const [from, setFrom]         = useState(thirtyDaysAgo)
  const [to, setTo]             = useState(todayStr)
  const [userId, setUserId]     = useState('')
  const [expanded, setExpanded] = useState({})   // { [userId]: true }
  const [activeShortcut, setActiveShortcut] = useState(null)
  const [sortOrder, setSortOrder] = useState('asc')  // 'asc' | 'desc'

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

  const byUser = useMemo(() => {
    const map = {}
    for (const l of logins) {
      if (!map[l.userId]) map[l.userId] = { user: l.user, logins: [] }
      map[l.userId].logins.push(l)
    }
    for (const uid of Object.keys(map))
      map[uid].logins.sort((a, b) => new Date(a.loginAt) - new Date(b.loginAt))
    return Object.values(map).map(({ user, logins }) => {
      const avgMins = logins.reduce((acc, l) => acc + minutesFromMidnight(l.loginAt), 0) / logins.length
      return { user, logins, avgMins, avgTime: minsToTime(avgMins) }
    }).sort((a, b) =>
      sortOrder === 'asc' ? a.avgMins - b.avgMins : b.avgMins - a.avgMins
    )
  }, [logins, sortOrder])

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

      {loading && <p className="text-sm text-gray-400 text-center py-12">Cargando...</p>}

      {!loading && logins.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-3">🔍</p>
          <p className="font-medium">Sin ingresos en el período</p>
        </div>
      )}

      {!loading && byUser.map(({ user, logins: ul, avgTime }) => (
        <div key={user.id} className="mb-3">
          {/* Header colapsable */}
          <button
            onClick={() => toggleExpanded(user.id)}
            className="w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <img src={`/perfiles/${user.avatar || 'bee.png'}`} alt={user.name}
              className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{user.name}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {ul.length} ingreso{ul.length !== 1 ? 's' : ''} · promedio {avgTime}
              </p>
            </div>
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
                return (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                    <p className="text-sm text-gray-600 dark:text-gray-300 flex-1 capitalize">{fmtDate(day)}</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex-shrink-0">{fmtTime(l.loginAt)}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                      l.method === 'google'
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}>{l.method === 'google' ? 'Google' : 'Email'}</span>
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

const CIVIL_LABELS = {
  single: 'Soltero/a', married: 'Casado/a', divorced: 'Divorciado/a',
  widowed: 'Viudo/a', partnership: 'Unión convivencial',
}
const EDU_LABELS = {
  primary: 'Primario', secondary: 'Secundario', tertiary: 'Terciario',
  university: 'Universitario', postgraduate: 'Posgrado',
}

function Field({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm text-gray-800 dark:text-gray-200">{value}</p>
    </div>
  )
}

function TabLegajos({ users, onVacationUpdate }) {
  const { labelFor } = useRoles()
  const [selectedId, setSelectedId] = useState('')
  const [summary, setSummary]       = useState(null)   // { avgLoginTime, loginCount, projects }
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [vacLoading, setVacLoading] = useState(false)

  const selected = users.find(u => String(u.id) === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) { setSummary(null); return }
    setSummaryLoading(true)
    api.get(`/admin/rrhh/user-summary/${selectedId}`)
      .then(r => setSummary(r.data))
      .catch(() => setSummary(null))
      .finally(() => setSummaryLoading(false))
  }, [selectedId])

  async function changeVacation(delta) {
    if (!selected) return
    setVacLoading(true)
    try {
      const { data } = await api.patch(`/admin/rrhh/vacation-days/${selected.id}`, { delta })
      onVacationUpdate(data)
    } finally { setVacLoading(false) }
  }

  function fmtBirthday(iso) {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })
  }

  const hasPersonalData = selected &&
    PERSONAL_FIELDS.some(f => selected[f] !== null && selected[f] !== undefined && selected[f] !== '')

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
            <img src={`/perfiles/${selected.avatar || 'bee.png'}`} alt={selected.name}
              className="w-14 h-14 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600 flex-shrink-0" />
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{selected.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{labelFor(selected.role)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{selected.email}</p>
            </div>
          </div>

          {/* Datos de acceso y actividad */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Horario promedio de ingreso */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                🕐 Horario promedio de ingreso
              </p>
              {summaryLoading
                ? <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Cargando...</p>
                : summary?.avgLoginTime
                  ? <>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{summary.avgLoginTime}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        sobre {summary.loginCount} ingreso{summary.loginCount !== 1 ? 's' : ''}
                      </p>
                    </>
                  : <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Sin registros</p>
              }
            </div>

            {/* Proyectos */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                📁 Proyectos
              </p>
              {summaryLoading
                ? <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
                : !summary?.projects?.length
                  ? <p className="text-sm text-gray-400 dark:text-gray-500">Sin proyectos asignados</p>
                  : <div className="flex flex-col gap-1.5">
                      {summary.projects.map(p => (
                        <div key={p.id} className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.active ? 'bg-green-400' : 'bg-gray-300 dark:bg-gray-600'}`} />
                          <p className={`text-sm truncate ${p.active ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>{p.name}</p>
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
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => changeVacation(-1)}
                  disabled={vacLoading || selected.vacationDays <= 0}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-lg flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >−</button>
                <p className="text-2xl font-bold text-gray-900 dark:text-white w-8 text-center">
                  {selected.vacationDays ?? 0}
                </p>
                <button
                  onClick={() => changeVacation(1)}
                  disabled={vacLoading}
                  className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-bold text-lg flex items-center justify-center hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors disabled:opacity-40"
                >+</button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">días disponibles</p>
            </div>
          </div>

          {/* Datos personales */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-6 pt-5 pb-3">
              📋 Datos personales
            </p>
            {!hasPersonalData
              ? <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8 pb-10">Esta persona aún no completó sus datos personales.</p>
              : <div className="px-6 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  <Field label="Teléfono"               value={selected.phone} />
                  <Field label="Dirección"              value={selected.address} />
                  <Field label="Fecha de nacimiento"    value={fmtBirthday(selected.birthday)} />
                  <Field label="DNI"                    value={selected.dni} />
                  <Field label="CUIT"                   value={selected.cuit} />
                  <Field label="Alias bancario"         value={selected.alias} />
                  <Field label="Estado civil"           value={CIVIL_LABELS[selected.maritalStatus] ?? selected.maritalStatus} />
                  <Field label="Hijos"                  value={selected.children !== null && selected.children !== undefined ? String(selected.children) : null} />
                  <Field label="Nivel educativo"        value={EDU_LABELS[selected.educationLevel] ?? selected.educationLevel} />
                  <Field label="Título"                 value={selected.educationTitle} />
                  <Field label="Grupo sanguíneo"        value={selected.bloodType} />
                  <Field label="Obra social"            value={selected.healthInsurance} />
                  <Field label="Condiciones médicas"    value={selected.medicalConditions} />
                  <Field label="Contacto de emergencia" value={selected.emergencyContact} />
                </div>
            }
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'legajos',  label: '📋 Legajos'  },
  { id: 'ingresos', label: '🕐 Ingresos' },
]

export default function RRHH() {
  const [tab, setTab]           = useState('legajos')
  const [users, setUsers]       = useState([])
  const [lastLoginsMap, setLastLoginsMap] = useState({})
  const [dashStats, setDashStats] = useState({ projectsPerPerson: 0 })

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
    api.get('/admin/rrhh/last-logins')
      .then(r => {
        const map = {}
        for (const { userId, lastLogin } of r.data) map[userId] = lastLogin
        setLastLoginsMap(map)
      })
      .catch(() => {})
    api.get('/admin/rrhh/dashboard-stats')
      .then(r => setDashStats(r.data))
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">RRHH</h1>

        {/* Mini dashboard — siempre visible */}
        {users.length > 0 && <MiniDashboard users={users} lastLoginsMap={lastLoginsMap} dashStats={dashStats} />}

        {/* Tabs */}
        <div className="mb-4">
          <select className="sm:hidden w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={tab} onChange={e => setTab(e.target.value)}>
            {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <div className="hidden sm:flex gap-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-1 w-fit">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'legajos'  && <TabLegajos  users={users.filter(u => u.active)} onVacationUpdate={updated => setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, vacationDays: updated.vacationDays } : u))} />}
        {tab === 'ingresos' && <TabIngresos users={users.filter(u => u.active)} />}
      </main>
    </div>
  )
}
