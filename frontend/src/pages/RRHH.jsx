import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { avatarUrl } from '../utils/avatarUrl'
import LoadingSpinner from '../components/LoadingSpinner'
import SetupHintCard from '../components/SetupHintCard'
import useLegajoFields from '../hooks/useLegajoFields'
import { fieldValue, displayValue, isLegajoComplete } from '../components/legajo/legajoUtils'
import useRoles from '../hooks/useRoles'
import RoleBadge from '../components/RoleBadge'
import { useWorkspace } from '../context/WorkspaceContext'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { computePeopleScore, peopleColumnKeys, scoreBand } from '../utils/peopleScore'

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
  // Usar T12:00:00 para evitar que UTC midnight se desplace al día anterior en UTC-3
  return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}
function minutesFromMidnight(iso) {
  const d = new Date(iso)
  const h = Number(d.toLocaleString('en-CA', { hour: 'numeric', hour12: false, timeZone: TZ }))
  const m = Number(d.toLocaleString('en-CA', { minute: 'numeric', timeZone: TZ }))
  return h * 60 + m
}
function minsToTime(mins) {
  const r = Math.round(mins)              // redondear el total primero evita "08:60" por minutos fraccionarios
  const h = Math.floor(r / 60), m = r % 60
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

// ─── Mini Dashboard ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, onClick }) {
  const clickable = typeof onClick === 'function'
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4 ${
        clickable ? 'cursor-pointer hover:border-primary-300 dark:hover:border-primary-600 transition-colors' : ''
      }`}
    >
      <span className="text-2xl flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 dark:text-white leading-none">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1">
          {label}
          {clickable && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-gray-300 dark:text-gray-600">
              <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM9 9a1 1 0 0 0 0 2v3a1 1 0 0 0 1 1h1a1 1 0 1 0 0-2v-3a1 1 0 0 0-1-1H9Zm1-4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
            </svg>
          )}
        </p>
        {sub && <p className="text-xs text-primary-600 dark:text-primary-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// Tarjeta de People Score (EOS) — salud del equipo según el Analizador de Personas.
function PeopleScoreCard({ peopleScore }) {
  const { score, rightPeople, total } = peopleScore
  const band = scoreBand(score)
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          🧭 Salud del equipo
        </p>
        <Link to="/admin/eos?tab=personas"
          className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline shrink-0">
          Analizador de Personas →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {/* People Score */}
        <div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold leading-none ${band.text}`}>{score != null ? `${score}%` : '—'}</span>
            <span className={`text-xs font-medium ${band.text}`}>{band.label}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">People Score</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${band.bar}`} style={{ width: `${score ?? 0}%` }} />
          </div>
        </div>
        {/* Personas correctas */}
        <div className="border-l border-gray-100 dark:border-gray-700 pl-4">
          <span className="text-3xl font-bold leading-none text-gray-900 dark:text-white">
            {rightPeople}<span className="text-xl text-gray-400 dark:text-gray-500">/{total}</span>
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Personas correctas en el asiento</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-snug">
            Con <span className="font-medium text-green-600 dark:text-green-400">+</span> en todos sus valores y GWC
          </p>
        </div>
      </div>
    </div>
  )
}

function MiniDashboard({ users, lastLoginsMap, dashStats, peopleScore }) {
  const { labelFor } = useRoles()
  const { workspace } = useWorkspace()
  const { fields: legajoFields, legajoEnabled } = useLegajoFields()
  const today = todayBA()
  const HORIZON = 30
  const [historyMetric, setHistoryMetric] = useState(null)   // null | 'projectsPerPerson' | 'tenure' | ...
  const [listModal, setListModal] = useState(null)           // null | 'notLoggedIn' | 'lateToday' | 'teamHours'

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

  // Legajos incompletos (según la config: faltan campos obligatorios, o ningún dato si no hay obligatorios)
  const incompleteCount = legajoEnabled && legajoFields.length > 0
    ? activeUsers.filter(u => !isLegajoComplete(u, legajoFields)).length
    : 0

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
        const b = new Date(u.birthday.slice(0, 10) + 'T12:00:00')
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
    // Comparar fechas como strings en TZ para evitar errores por UTC offset
    const loginDateStr = new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
    if (loginDateStr === todayBA_str) return 'hoy'
    const diff = Math.round((todayBA() - new Date(loginDateStr + 'T12:00:00')) / 86400000)
    if (diff <= 0) return 'hoy'
    if (diff === 1) return 'ayer'
    return `hace ${diff} días`
  }

  const todayBA_str = todayStr()
  const maxRole = roleDistrib[0]?.[1] || 1

  // Promedio global de horario de ingreso (calculado server-side con primer ingreso del día, mes en curso)
  const globalAvgLoginTime = dashStats.avgFirstLoginTime ?? null
  const userById = useMemo(() => {
    const m = {}
    for (const u of activeUsers) m[u.id] = u
    return m
  }, [activeUsers])
  // Quiénes no iniciaron sesión hoy (para la tarjeta clickeable)
  const notLoggedInToday = useMemo(() => activeUsers.filter(u => {
    const last = lastLoginsMap[u.id]
    return !(last && new Date(last).toLocaleDateString('en-CA', { timeZone: TZ }) === todayBA_str)
  }), [activeUsers, lastLoginsMap, todayBA_str])
  const loggedInToday = activeUsers.length - notLoggedInToday.length

  // Horas disponibles del equipo según horario cargado (workEndTime − workStartTime por persona)
  const teamHours = useMemo(() => {
    const parseHM = s => { const [h, mm] = String(s).split(':').map(Number); return h * 60 + mm }
    const withSchedule = activeUsers
      .filter(u => u.workStartTime && u.workEndTime)
      .map(u => {
        const mins = Math.max(0, parseHM(u.workEndTime) - parseHM(u.workStartTime))
        return { ...u, dailyMins: mins, dailyHours: Math.round(mins / 60 * 10) / 10 }
      })
    const totalMins = withSchedule.reduce((s, u) => s + u.dailyMins, 0)
    const without = activeUsers.filter(u => !(u.workStartTime && u.workEndTime))
    return {
      totalHours: Math.round(totalMins / 60 * 10) / 10,
      withSchedule,
      without,
      count: withSchedule.length,
      total: activeUsers.length,
    }
  }, [activeUsers])

  // Tardanzas (calculadas server-side en dashboard-stats)
  const nameById = useMemo(() => {
    const m = {}
    for (const u of activeUsers) m[u.id] = u.name
    return m
  }, [activeUsers])
  const lateToday = dashStats.lateToday ?? []
  const hasSchedules = (dashStats.membersWithSchedule ?? 0) > 0
  // Seguimiento de horarios/puntualidad (toggle global). Default ON salvo que el back diga false.
  const attendanceEnabled = dashStats.attendanceTrackingEnabled !== false

  // Bloque de asistencia (hora de ingreso / puntualidad / tardanzas). Tres estados:
  //  · feature apagada → no se muestra nada
  //  · encendida sin ningún horario cargado → placeholder educativo (se renderiza aparte)
  //  · encendida con ≥1 horario → tarjetas con datos reales (sobre quienes tienen horario)
  const showAttendanceHint = attendanceEnabled && !hasSchedules
  const attendanceCards = attendanceEnabled && hasSchedules
    ? [
        { icon: '🕐', label: 'Horario promedio de ingreso', value: globalAvgLoginTime ?? '—', sub: 'este mes · sobre quienes tienen horario', onClick: () => setHistoryMetric('avgLoginTime') },
        { icon: '⏰', label: 'Puntualidad del equipo',
          value: dashStats.teamPunctualityPct != null ? `${dashStats.teamPunctualityPct}%` : '—',
          sub: `este mes · ${dashStats.lateCount} tarde de ${dashStats.scheduledDays} llegadas`, onClick: () => setHistoryMetric('punctuality') },
        { icon: '🕗', label: 'Horas disponibles del equipo', value: `${teamHours.totalHours} h`,
          sub: `${teamHours.count} de ${teamHours.total} con horario`, onClick: () => setListModal('teamHours') },
        { icon: '⏰', label: 'Llegaron tarde hoy', value: lateToday.length,
          sub: lateToday.length === 0
            ? 'Nadie llegó tarde 🎉'
            : lateToday.slice(0, 3).map(x => `${(nameById[x.userId] ?? '—').split(' ')[0]} +${x.lateBy}m`).join(' · '),
          onClick: lateToday.length > 0 ? () => setListModal('lateToday') : undefined },
      ]
    : []

  // Tarjeta de legajos. Tres estados:
  //  · feature apagada → no se muestra nada
  //  · encendida con incompletos → placeholder/hint (se renderiza aparte)
  //  · encendida y todos completos → tarjeta verde
  const legajoReady = legajoEnabled && legajoFields.length > 0
  const showLegajoHint = legajoReady && incompleteCount > 0
  const legajoCards = legajoReady && incompleteCount === 0
    ? [{ icon: '✅', label: 'Legajos completos', value: activeUsers.length, sub: 'Todos completos ✓' }]
    : []

  // Todas las métricas numéricas, cada una en su propia tarjeta (sin slider)
  const statCards = [
    { icon: '🟢', label: 'Iniciaron sesión hoy',      value: `${loggedInToday} / ${activeUsers.length}`,
      sub: loggedInToday === activeUsers.length ? 'Todo el equipo conectado' : `${notLoggedInToday.length} aún no ingresaron`,
      onClick: notLoggedInToday.length > 0 ? () => setListModal('notLoggedIn') : undefined },
    { icon: '📅', label: 'Antigüedad promedio',       value: avgTenureYears,              sub: 'del equipo activo', onClick: () => setHistoryMetric('tenure') },
    { icon: '📁', label: 'Proyectos por persona',     value: dashStats.projectsPerPerson, sub: 'proyectos activos ÷ equipo', onClick: () => setHistoryMetric('projectsPerPerson') },
    ...legajoCards,
    ...attendanceCards,
  ]

  return (
    <div className="mb-6 space-y-3">
      {/* Fila 1: stats numéricas — cada métrica en su propia tarjeta */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {statCards.map((s, i) => (
          <StatCard key={i} icon={s.icon} label={s.label} value={s.value} sub={s.sub} onClick={s.onClick} />
        ))}
        {showAttendanceHint && (
          <SetupHintCard
            icon="⏰"
            label="Puntualidad del equipo"
            hint="Asigná horarios laborales a tu equipo para medir llegadas, tardanzas y puntualidad. Las personas sin horario (freelancers, otra franja horaria) no se cuentan."
            to="/admin?tab=team"
            ctaLabel="Configurar horarios →"
          />
        )}
        {showLegajoHint && (
          <SetupHintCard
            icon="📋"
            label="Legajos sin completar"
            hint={`${incompleteCount} ${incompleteCount === 1 ? 'persona no completó' : 'personas no completaron'} su legajo. Pedíles que carguen sus datos desde Mi Perfil. Podés ajustar los campos y obligatorios en Administración → Legajo.`}
            to="/admin?tab=legajo"
            ctaLabel="Configurar legajo →"
          />
        )}
      </div>

      {/* People Score (EOS) — solo si EOS está habilitado y hay calificaciones */}
      {peopleScore && peopleScore.score != null && (
        <PeopleScoreCard peopleScore={peopleScore} />
      )}

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
                    <img src={avatarUrl(u.avatar)} alt={u.name}
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
            🎉 Aniversarios en {workspace?.name ?? 'Bliss'}
          </p>
          {upcomingAnniversaries.length === 0
            ? <p className="text-sm text-gray-400 dark:text-gray-500">Ninguno en los próximos 30 días</p>
            : <div className="space-y-2">
                {upcomingAnniversaries.map(u => (
                  <div key={u.id} className="flex items-center gap-2.5">
                    <img src={avatarUrl(u.avatar)} alt={u.name}
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

        {/* Última conexión */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            🟢 Última conexión
          </p>
          <div className="space-y-2">
            {lastLoginRows.slice(0, 10).map(u => {
              const since = u.lastLogin ? daysSince(u.lastLogin) : null
              return (
              <div key={u.id} className="flex items-center gap-2.5">
                <img src={avatarUrl(u.avatar)} alt={u.name}
                  className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{u.name}</p>
                <span className={`text-xs flex-shrink-0 font-medium ${
                  !since ? 'text-gray-300 dark:text-gray-600' :
                  since === 'hoy' || since === 'ayer'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {since ?? 'Sin registros'}
                </span>
              </div>
            )})}
            {lastLoginRows.length > 10 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">
                +{lastLoginRows.length - 10} más — ver en Ingresos
              </p>
            )}
          </div>
        </div>
      </div>

      {historyMetric && (
        <MetricHistoryModal
          config={METRIC_HISTORY[historyMetric]}
          current={{
            activeMembers: activeUsers.length,
            tenure: avgTenureYears,
            projectsPerPerson: dashStats.projectsPerPerson,
            avgLoginTime: globalAvgLoginTime,
            punctuality: dashStats.teamPunctualityPct != null ? `${dashStats.teamPunctualityPct}%` : null,
          }[historyMetric]}
          onClose={() => setHistoryMetric(null)}
        />
      )}

      {listModal === 'notLoggedIn' && (
        <PeopleListModal
          title="🟢 Sin iniciar sesión hoy"
          subtitle={`${notLoggedInToday.length} de ${activeUsers.length} todavía no ingresaron`}
          people={notLoggedInToday.map(u => ({ id: u.id, name: u.name, avatar: u.avatar, right: lastLoginsMap[u.id] ? daysSince(lastLoginsMap[u.id]) : 'sin registros' }))}
          onClose={() => setListModal(null)}
        />
      )}

      {listModal === 'lateToday' && (
        <PeopleListModal
          title="⏰ Llegaron tarde hoy"
          subtitle={`${lateToday.length} ${lateToday.length === 1 ? 'persona' : 'personas'}`}
          people={lateToday.map(x => ({ id: x.userId, name: nameById[x.userId] ?? '—', avatar: userById[x.userId]?.avatar, right: `+${x.lateBy} min`, rightCls: 'text-red-600 dark:text-red-400 font-medium' }))}
          onClose={() => setListModal(null)}
        />
      )}

      {listModal === 'teamHours' && (
        <TeamHoursModal teamHours={teamHours} onClose={() => setListModal(null)} />
      )}
    </div>
  )
}

// Modal genérico de lista de personas (avatar + nombre + dato a la derecha).
function PeopleListModal({ title, subtitle, people, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md max-h-[80vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{title}</p>
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto px-5 py-3">
          {people.length === 0
            ? <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">Nadie 🎉</p>
            : <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {people.map(p => (
                  <div key={p.id} className="flex items-center gap-2.5 py-2">
                    <img src={avatarUrl(p.avatar)} alt={p.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 truncate">{p.name}</span>
                    {p.right && <span className={`text-xs flex-shrink-0 ${p.rightCls || 'text-gray-400 dark:text-gray-500'}`}>{p.right}</span>}
                  </div>
                ))}
              </div>}
        </div>
      </div>
    </div>
  )
}

// Modal de horas disponibles del equipo: detalle por persona + quiénes no tienen horario.
function TeamHoursModal({ teamHours, onClose }) {
  const { withSchedule, without, totalHours, count, total } = teamHours
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md max-h-[80vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">🕗 Horas disponibles del equipo</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{totalHours} h/día · {count} de {total} con horario</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto px-5 py-3">
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {withSchedule.map(u => (
              <div key={u.id} className="flex items-center gap-2.5 py-2">
                <img src={avatarUrl(u.avatar)} alt={u.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 truncate">{u.name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{u.workStartTime}–{u.workEndTime}</span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 tabular-nums w-10 text-right">{u.dailyHours}h</span>
              </div>
            ))}
          </div>
          {without.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Sin horario cargado ({without.length})</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {without.map(u => (
                  <div key={u.id} className="flex items-center gap-1.5">
                    <img src={avatarUrl(u.avatar)} alt={u.name} className="w-5 h-5 rounded-full object-cover" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{u.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
          Suma de horas diarias (salida − entrada) de quienes tienen horario cargado.
        </div>
      </div>
    </div>
  )
}

// Config de cada métrica de RRHH con historial mensual (icono, título, formateo).
//   fmt(value)          → texto de la columna de valor + se usa el value crudo para escalar la barra
//   detailText(detail)  → texto auxiliar a la derecha (opcional)
//   currentText(c)      → frase del estado vacío ("Este mes: …")
const METRIC_HISTORY = {
  activeMembers: {
    metric: 'activeMembers',
    icon: '👥',
    title: 'Personas activas',
    footer: 'Integrantes activos del workspace · se guarda una captura por mes',
    fmt: v => `${v}`,
    detailText: () => '',
    currentText: c => (c != null ? `Este mes: ${c}.` : ''),
  },
  tenure: {
    metric: 'tenure',
    icon: '📅',
    title: 'Antigüedad promedio',
    footer: 'Antigüedad promedio del equipo activo · se guarda una captura por mes',
    fmt: v => (v < 1 ? `${Math.round(v * 12)}m` : `${v.toFixed(1)}a`),
    detailText: d => (d?.memberCount != null ? `${d.memberCount} pers.` : ''),
    currentText: c => (c ? `Este mes: ${c}.` : ''),
  },
  projectsPerPerson: {
    metric: 'projectsPerPerson',
    icon: '📁',
    title: 'Proyectos por persona',
    footer: 'Proyectos activos ÷ equipo activo · se guarda una captura por mes',
    fmt: v => `${v}`,
    detailText: d => (d?.activeProjects != null ? `${d.activeProjects}p / ${d.activeMembers}` : ''),
    currentText: c => (c != null ? `Este mes: ${c} proyectos/persona.` : ''),
  },
  avgLoginTime: {
    metric: 'avgLoginTime',
    icon: '🕐',
    title: 'Horario promedio de ingreso',
    footer: 'Promedio mensual del primer ingreso · solo quienes tienen horario',
    barMode: 'range', // la hora del día se escala dentro del rango del período (más legible que desde 0)
    fmt: v => minsToTime(v),
    detailText: d => (d?.scheduledDays != null ? `${d.scheduledDays} ingresos` : ''),
    currentText: c => (c ? `Este mes: ${c}.` : ''),
  },
  punctuality: {
    metric: 'punctuality',
    icon: '⏰',
    title: 'Puntualidad del equipo',
    footer: '% de llegadas a horario · promedio mensual',
    fmt: v => `${v}%`,
    detailText: d => (d?.scheduledDays != null ? `${d.scheduledDays - d.lateCount}/${d.scheduledDays} a horario` : ''),
    currentText: c => (c != null ? `Este mes: ${c}.` : ''),
  },
}

// Modal genérico: evolución mensual de una métrica de RRHH.
// Muestra hasta 12 meses; con datos de varios años aparece un selector de año.
function MetricHistoryModal({ config, current, onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [year, setYear]       = useState(null)   // null = últimos 12 meses

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ metric: config.metric })
    if (year) params.set('year', year)
    api.get(`/admin/rrhh/metric-history?${params}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year, config.metric])

  const snapshots = data?.snapshots ?? []
  const years     = data?.availableYears ?? []
  const showYearSelector = years.length > 1
  const withData  = snapshots.filter(s => s.value != null)
  const hasAny    = withData.length > 0
  const values    = withData.map(s => s.value)
  const maxValue  = Math.max(...values, 0.0001)
  const minValue  = Math.min(...values)

  // Ancho de la barra. 'range' escala dentro del [min, max] del período (útil para horas del día,
  // donde el 0 absoluto no aporta); por defecto escala desde 0.
  function barWidth(v) {
    if (config.barMode === 'range') {
      if (maxValue === minValue) return 100
      return Math.max(8, ((v - minValue) / (maxValue - minValue)) * 100)
    }
    return Math.max(4, (v / maxValue) * 100)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{config.icon} {config.title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Evolución mensual · {year ? `año ${year}` : 'últimos 12 meses'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showYearSelector && (
              <select
                value={year ?? ''}
                onChange={e => setYear(e.target.value ? Number(e.target.value) : null)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Últimos 12 meses</option>
                {years.slice().reverse().map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {loading ? (
            <LoadingSpinner className="py-10" />
          ) : !hasAny ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm font-medium">Todavía no hay historial</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Se guarda una captura por mes. {config.currentText(current)}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {snapshots.map(s => (
                <div key={s.month} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-24 flex-shrink-0 capitalize">{s.label}</span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 min-w-0">
                    {s.value != null && (
                      <div
                        className="bg-primary-500 h-2.5 rounded-full transition-all"
                        style={{ width: `${barWidth(s.value)}%` }}
                      />
                    )}
                  </div>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 tabular-nums w-12 text-right flex-shrink-0">
                    {s.value != null ? config.fmt(s.value) : '—'}
                  </span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 w-16 text-right flex-shrink-0 hidden sm:block">
                    {s.value != null ? config.detailText(s.detail) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
          {config.footer}
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

  const byUser = useMemo(() => {
    const map = {}
    for (const l of logins) {
      if (!map[l.userId]) map[l.userId] = { user: l.user, logins: [] }
      map[l.userId].logins.push(l)
    }
    for (const uid of Object.keys(map))
      map[uid].logins.sort((a, b) => new Date(a.loginAt) - new Date(b.loginAt))
    return Object.values(map).map(({ user, logins }) => {
      // Solo el primer ingreso del día para calcular el promedio y la tardanza
      const byDay = {}
      for (const l of logins) {
        const day = new Date(l.loginAt).toLocaleDateString('en-CA', { timeZone: TZ })
        if (!byDay[day]) byDay[day] = l   // logins ya ordenados asc → primero gana
      }
      const firstPerDay = Object.values(byDay)
      const firstIds = new Set(firstPerDay.map(l => l.id))   // ids de "primer ingreso del día"
      const avgMins = firstPerDay.reduce((acc, l) => acc + minutesFromMidnight(l.loginAt), 0) / firstPerDay.length
      const schedule = startMinsMap[user.id] ?? null
      let lateDays = 0
      if (schedule) {
        for (const l of firstPerDay) {
          if (minutesFromMidnight(l.loginAt) - schedule.mins > tolerance) lateDays++
        }
      }
      return {
        user, logins, avgMins, avgTime: minsToTime(avgMins),
        schedule, firstIds, daysCount: firstPerDay.length, lateDays,
      }
    }).sort((a, b) =>
      sortOrder === 'asc' ? a.avgMins - b.avgMins : b.avgMins - a.avgMins
    )
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

function Field({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm text-gray-800 dark:text-gray-200">{value}</p>
    </div>
  )
}

function VacationEditModal({ user, onClose, onUpdated }) {
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

function TabLegajos({ users, onVacationUpdate }) {
  const { labelFor } = useRoles()
  const { workspace } = useWorkspace()
  const { fields: legajoFields } = useLegajoFields()
  const [selectedId, setSelectedId] = useState('')
  const [summary, setSummary]       = useState(null)   // { avgLoginTime, loginCount, projects }
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [vacModalOpen, setVacModalOpen] = useState(false)
  const [showLoginDays, setShowLoginDays] = useState(false)

  const selected = users.find(u => String(u.id) === selectedId) ?? null

  useEffect(() => {
    setShowLoginDays(false)
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
function LoginDaysModal({ user, summary, onChanged, onClose }) {
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

const LEAVE_TYPE_LABELS = {
  vacaciones: 'Vacaciones',
  estudio:    'Estudio / examen',
  maternidad: 'Maternidad',
  paternidad: 'Paternidad',
  enfermedad: 'Enfermedad / salud',
  duelo:      'Duelo familiar',
  mudanza:    'Mudanza',
  otro:       'Otro',
}

const REQUEST_STATUS = {
  pending:  { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  approved: { label: 'Aprobada',  color: 'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400'  },
  rejected: { label: 'Rechazada', color: 'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400'    },
}

function ReviewModal({ request, onClose, onDone }) {
  const [status, setStatus]     = useState('approved')
  const [reviewNote, setNote]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const { data } = await api.patch(`/vacation/admin/requests/${request.id}`, { status, reviewNote })
      onDone(data)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
      setSaving(false)
    }
  }

  const typeLabel = LEAVE_TYPE_LABELS[request.type] ?? request.type
  const dateRange = request.startDate === request.endDate
    ? request.startDate
    : `${request.startDate} → ${request.endDate}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">Revisar solicitud</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{request.user.name} · {typeLabel} · {dateRange}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {request.observation && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Observación del solicitante</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 italic">{request.observation}</p>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Decisión</label>
            <div className="flex gap-3">
              <label className="flex-1 flex items-center gap-2 cursor-pointer border-2 rounded-xl px-4 py-3 transition-all
                  border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20
                  has-[:checked]:ring-2 has-[:checked]:ring-green-500">
                <input type="radio" name="status" value="approved" checked={status === 'approved'} onChange={() => setStatus('approved')} className="accent-green-600" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">✅ Aprobar</span>
              </label>
              <label className="flex-1 flex items-center gap-2 cursor-pointer border-2 rounded-xl px-4 py-3 transition-all
                  border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20
                  has-[:checked]:ring-2 has-[:checked]:ring-red-500">
                <input type="radio" name="status" value="rejected" checked={status === 'rejected'} onChange={() => setStatus('rejected')} className="accent-red-600" />
                <span className="text-sm font-medium text-red-700 dark:text-red-400">❌ Rechazar</span>
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
              Nota para el usuario {status === 'rejected' && <span className="text-red-500">*</span>}
            </label>
            <textarea rows={2} value={reviewNote} onChange={e => setNote(e.target.value)}
              placeholder={status === 'rejected' ? 'Explicá el motivo del rechazo…' : 'Opcional, ej: Confirmado, que lo disfrutes!'}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
            <button type="submit" disabled={saving}
              className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${status === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
              {saving ? 'Guardando…' : (status === 'approved' ? 'Aprobar' : 'Rechazar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TabVacaciones() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('pending')
  const [reviewing, setReviewing] = useState(null)

  useEffect(() => {
    api.get('/vacation/admin/requests')
      .then(r => setRequests(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function handleDone(updated) {
    setRequests(prev => prev.map(r => r.id === updated.id ? updated : r))
    setReviewing(null)
  }

  const filtered = requests.filter(r =>
    filter === 'all' ? true : r.status === filter
  )

  const pendingCount = requests.filter(r => r.status === 'pending').length

  function fmtDateRange(start, end) {
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
    return start === end ? fmt(start) : `${fmt(start)} → ${fmt(end)}`
  }

  return (
    <div>
      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[
          ['pending',  `Pendientes${pendingCount > 0 ? ` (${pendingCount})` : ''}`],
          ['approved', 'Aprobadas'],
          ['rejected', 'Rechazadas'],
          ['all',      'Todas'],
        ].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === v
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >{l}</button>
        ))}
      </div>

      {loading
        ? <LoadingSpinner className="py-12" />
        : filtered.length === 0
          ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-3xl mb-3">🏖️</p>
                <p className="font-medium">
                  {filter === 'pending' ? 'No hay solicitudes pendientes.' : 'Sin solicitudes en este filtro.'}
                </p>
              </div>
            )
          : (
              <div className="space-y-3">
                {filtered.map(req => {
                  const st = REQUEST_STATUS[req.status] ?? REQUEST_STATUS.pending
                  const typeLabel = LEAVE_TYPE_LABELS[req.type] ?? req.type
                  return (
                    <div key={req.id}
                      className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-5 py-4 flex items-start gap-4">
                      <img src={avatarUrl(req.user.avatar)} alt={req.user.name}
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0 border-2 border-gray-100 dark:border-gray-600 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="font-semibold text-sm text-gray-900 dark:text-white">{req.user.name}</p>
                          <RoleBadge userId={req.user.id} />
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{typeLabel}</span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{fmtDateRange(req.startDate, req.endDate)}</p>
                        {req.observation && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">{req.observation}</p>}
                        {req.reviewedBy && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Revisado por {req.reviewedBy.name}
                            {req.reviewNote && ` · "${req.reviewNote}"`}
                          </p>
                        )}
                      </div>
                      {req.status === 'pending' && (
                        <button onClick={() => setReviewing(req)}
                          className="flex-shrink-0 text-xs font-medium px-3 py-1.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors">
                          Revisar
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
      }

      {reviewing && (
        <ReviewModal
          request={reviewing}
          onClose={() => setReviewing(null)}
          onDone={handleDone}
        />
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

const TABS = [
  { id: 'legajos',    label: '📋 Legajos'              },
  { id: 'vacaciones', label: '🏖️ Vacaciones y Licencias' },
  { id: 'ingresos',   label: '🕐 Ingresos'              },
]

export default function RRHH() {
  const [tab, setTab]           = useState('legajos')
  const [users, setUsers]       = useState([])
  const [lastLoginsMap, setLastLoginsMap] = useState({})
  const [dashStats, setDashStats] = useState({ projectsPerPerson: 0 })
  const [peopleScore, setPeopleScore] = useState(null)
  const { enabled: eosEnabled } = useFeatureFlag('eos')

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

  // People Score (EOS) — solo si el módulo está habilitado y hay valores definidos.
  useEffect(() => {
    if (!eosEnabled) { setPeopleScore(null); return }
    api.get('/eos/personas')
      .then(r => {
        const { members, coreValues, ratingsMap } = r.data
        if (!coreValues?.length) { setPeopleScore(null); return }
        setPeopleScore(computePeopleScore(members, peopleColumnKeys(coreValues), ratingsMap))
      })
      .catch(() => {})
  }, [eosEnabled])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">RRHH</h1>

        {/* Mini dashboard — siempre visible */}
        {users.length > 0 && <MiniDashboard users={users} lastLoginsMap={lastLoginsMap} dashStats={dashStats} peopleScore={peopleScore} />}

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

        {tab === 'legajos'    && <TabLegajos    users={users.filter(u => u.active)} onVacationUpdate={updated => setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, vacationDays: updated.vacationDays } : u))} />}
        {tab === 'vacaciones' && <TabVacaciones />}
        {tab === 'ingresos'   && <TabIngresos   users={users.filter(u => u.active)} />}
      </main>
    </div>
  )
}
