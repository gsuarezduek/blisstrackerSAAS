import { useState, useEffect, useMemo } from 'react'
import api from '../../api/client'
import { Link } from 'react-router-dom'
import { avatarUrl } from '../../utils/avatarUrl'
import LoadingSpinner from '../../components/LoadingSpinner'
import SetupHintCard from '../../components/SetupHintCard'
import useLegajoFields from '../../hooks/useLegajoFields'
import useRoles from '../../hooks/useRoles'
import { useWorkspace } from '../../context/WorkspaceContext'
import { isLegajoComplete } from '../../components/legajo/legajoUtils'
import { TZ, todayBA, todayStr, fmtDateShort, minsToTime, daysUntilNextOccurrence, relativeDay, StatCard, LEAVE_TYPE_LABELS, leaveRangeLabel } from './shared'

export function healthBand(pct) {
  if (pct == null) return { text: 'text-gray-500 dark:text-gray-400',  bar: 'bg-gray-300 dark:bg-gray-600', label: 'Sin evaluar' }
  if (pct > 70)    return { text: 'text-green-600 dark:text-green-400', bar: 'bg-green-500',                 label: 'Equipo saludable' }
  if (pct >= 40)   return { text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500',                 label: 'Requiere atención' }
  return             { text: 'text-red-600 dark:text-red-400',          bar: 'bg-red-500',                   label: 'Crítico' }
}

// Color del total de faltas: 0 verde · 1–3 amarillo · >3 rojo.
export function faltasColor(n) {
  if (n === 0) return 'text-green-600 dark:text-green-400'
  if (n <= 3)  return 'text-amber-600 dark:text-amber-400'
  return         'text-red-600 dark:text-red-400'
}

// Tarjeta de People Score (EOS) — salud del equipo según el Analizador de Personas.
export function PeopleScoreCard({ peopleScore }) {
  const { score, rightPeople, total, strikesTotal = 0 } = peopleScore
  const band = healthBand(score)
  const seatPct = total > 0 ? Math.round(rightPeople / total * 100) : null
  const seatColor = healthBand(seatPct).text
  const strikesColor = faltasColor(strikesTotal)
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <div className="sm:border-l border-gray-100 dark:border-gray-700 sm:pl-4">
          <span className={`text-3xl font-bold leading-none ${seatColor}`}>
            {rightPeople}<span className="text-xl text-gray-400 dark:text-gray-500">/{total}</span>
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Personas correctas en el asiento</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-snug">
            Con <span className="font-medium text-green-600 dark:text-green-400">+</span> en todos sus valores y GWC
          </p>
        </div>
        {/* Faltas del equipo */}
        <div className="sm:border-l border-gray-100 dark:border-gray-700 sm:pl-4">
          <span className={`text-3xl font-bold leading-none ${strikesColor}`}>{strikesTotal}</span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Faltas del equipo</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 leading-snug">
            Total de faltas (strikes) registradas
          </p>
        </div>
      </div>
    </div>
  )
}

export function MiniDashboard({ users, lastLoginsMap, dashStats, peopleScore }) {
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
  // Licencias en curso o próximas (30 días), calculadas server-side en dashboard-stats.
  const leaves = dashStats.leaves ?? []
  const onLeaveToday = useMemo(() => leaves.filter(l => l.active), [leaves])
  const onLeaveIds = useMemo(() => new Set(onLeaveToday.map(l => l.userId)), [onLeaveToday])
  // "Esperados hoy" = activos que NO están de licencia (para no contarlos como ausentes).
  const presentExpected = useMemo(
    () => activeUsers.filter(u => !onLeaveIds.has(u.id)),
    [activeUsers, onLeaveIds],
  )

  // Quiénes no iniciaron sesión hoy (para la tarjeta clickeable) — excluye a los de licencia.
  const notLoggedInToday = useMemo(() => presentExpected.filter(u => {
    const last = lastLoginsMap[u.id]
    return !(last && new Date(last).toLocaleDateString('en-CA', { timeZone: TZ }) === todayBA_str)
  }), [presentExpected, lastLoginsMap, todayBA_str])
  const loggedInToday = presentExpected.length - notLoggedInToday.length

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
    { icon: '🟢', label: 'Iniciaron sesión hoy',      value: `${loggedInToday} / ${presentExpected.length}`,
      sub: [
        loggedInToday === presentExpected.length ? 'Todo el equipo conectado' : `${notLoggedInToday.length} aún no ingresaron`,
        onLeaveToday.length > 0 ? `${onLeaveToday.length} de licencia (no cuentan)` : null,
      ].filter(Boolean).join(' · '),
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

      {/* Fila 2: cumpleaños + aniversarios + licencias */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

        {/* Licencias (en curso + próximas 30 días) */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            🏖️ Licencias
          </p>
          {leaves.length === 0
            ? <p className="text-sm text-gray-400 dark:text-gray-500">Nadie de licencia en los próximos 30 días</p>
            : <div className="space-y-2">
                {leaves.map(l => {
                  const days = Math.max(0, Math.round((new Date(l.startDate + 'T12:00:00') - today) / 86400000))
                  return (
                    <div key={l.id} className="flex items-center gap-2.5">
                      <img src={avatarUrl(l.avatar)} alt={l.name}
                        className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{l.name}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {LEAVE_TYPE_LABELS[l.type] ?? l.type} · {leaveRangeLabel(l.startDate, l.endDate)}
                        </p>
                      </div>
                      {l.active
                        ? <span className="text-xs font-medium flex-shrink-0 text-primary-600 dark:text-primary-400">en curso</span>
                        : <span className="text-xs font-medium flex-shrink-0 text-gray-500 dark:text-gray-400">{relativeDay(days)}</span>
                      }
                    </div>
                  )
                })}
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
          subtitle={`${notLoggedInToday.length} de ${presentExpected.length} todavía no ingresaron${onLeaveToday.length > 0 ? ` · ${onLeaveToday.length} de licencia` : ''}`}
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
export function PeopleListModal({ title, subtitle, people, onClose }) {
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
export function TeamHoursModal({ teamHours, onClose }) {
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
export const METRIC_HISTORY = {
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
export function MetricHistoryModal({ config, current, onClose }) {
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

