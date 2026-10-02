import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AttentionBanner from '../../components/AttentionBanner'
import useLegajoFields from '../../hooks/useLegajoFields'
import useRoles from '../../hooks/useRoles'
import { useWorkspace } from '../../context/WorkspaceContext'
import { isLegajoComplete } from '../../components/legajo/legajoUtils'
import { Card, CardHeader, TextButton, Avatar, EmptyNote } from '../project-detail/ui'
import { TZ, todayBA, todayStr, fmtDateShort, daysUntilNextOccurrence, relativeDay, LEAVE_TYPE_LABELS, leaveRangeLabel } from './shared'
import { PeopleScoreCard, PeopleListModal, TeamHoursModal, MetricHistoryModal, METRIC_HISTORY } from './dashboard'
import { ApprovalRow, buildApprovalItems } from './approvals'

// ─── Sección "Hoy" del panel RRHH ─────────────────────────────────────────────
// Responde "¿qué tengo que resolver hoy con el equipo?": primero la cola de
// solicitudes que esperan una decisión, después los avisos del día y quién está
// fuera; las métricas quedan abajo (las 4 principales a la vista, el resto plegado).

const HORIZON = 30

export function TabHoy({ users, lastLoginsMap, dashStats, peopleScore, pending, onDecided, onNavigate }) {
  const navigate = useNavigate()
  const { labelFor } = useRoles()
  const { workspace } = useWorkspace()
  const { fields: legajoFields, legajoEnabled } = useLegajoFields()
  const today = todayBA()
  const todayIso = todayStr()
  const [historyMetric, setHistoryMetric] = useState(null)
  const [listModal, setListModal] = useState(null)   // null | 'notLoggedIn' | 'lateToday' | 'teamHours'
  const [moreOpen, setMoreOpen] = useState(false)
  const [flash, setFlash] = useState(null)

  const activeUsers = useMemo(() => users.filter(u => u.active), [users])
  const usersById = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users])

  // ── Cola de aprobaciones ──
  const items = useMemo(() => buildApprovalItems({
    leaves: pending.leaves, benefits: pending.benefits, approvedLeaves: pending.approvedLeaves, usersById,
  }), [pending, usersById])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4000)
    return () => clearTimeout(t)
  }, [flash])

  function handleDecided(item, status) {
    if (status) {
      const first = item.user?.name?.split(' ')[0] ?? ''
      setFlash(status === 'approved' ? `Aprobaste la solicitud de ${first}.` : `Rechazaste la solicitud de ${first}. Ya le avisamos.`)
    }
    onDecided(item, status)
  }

  // ── Presencia de hoy ──
  const leaves = dashStats.leaves ?? []
  const onLeaveToday = useMemo(() => leaves.filter(l => l.active), [leaves])
  const onLeaveIds = useMemo(() => new Set(onLeaveToday.map(l => l.userId)), [onLeaveToday])
  const presentExpected = useMemo(() => activeUsers.filter(u => !onLeaveIds.has(u.id)), [activeUsers, onLeaveIds])
  const loginDay = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
  const notLoggedInToday = useMemo(() => presentExpected.filter(u => {
    const last = lastLoginsMap[u.id]
    return !(last && loginDay(last) === todayIso)
  }), [presentExpected, lastLoginsMap, todayIso])
  const loggedInToday = presentExpected.length - notLoggedInToday.length

  function daysSince(iso) {
    if (!iso) return null
    const d = loginDay(iso)
    const diff = Math.round((today - new Date(d + 'T12:00:00')) / 86400000)
    if (diff <= 0) return 'hoy'
    if (diff === 1) return 'ayer'
    return `hace ${diff} días`
  }

  // ── Asistencia ──
  const attendanceEnabled = dashStats.attendanceTrackingEnabled !== false
  const hasSchedules = (dashStats.membersWithSchedule ?? 0) > 0
  const lateToday = dashStats.lateToday ?? []
  const nameById = id => usersById[id]?.name ?? '—'

  const teamHours = useMemo(() => {
    const parseHM = s => { const [h, mm] = String(s).split(':').map(Number); return h * 60 + mm }
    const withSchedule = activeUsers
      .filter(u => u.workStartTime && u.workEndTime)
      .map(u => {
        const mins = Math.max(0, parseHM(u.workEndTime) - parseHM(u.workStartTime))
        return { ...u, dailyMins: mins, dailyHours: Math.round(mins / 60 * 10) / 10 }
      })
    const totalMins = withSchedule.reduce((s, u) => s + u.dailyMins, 0)
    return {
      totalHours: Math.round(totalMins / 60 * 10) / 10,
      withSchedule,
      without: activeUsers.filter(u => !(u.workStartTime && u.workEndTime)),
      count: withSchedule.length,
      total: activeUsers.length,
    }
  }, [activeUsers])

  // ── Legajos ──
  const legajoReady = legajoEnabled && legajoFields.length > 0
  const incompleteCount = legajoReady ? activeUsers.filter(u => !isLegajoComplete(u, legajoFields)).length : 0

  // ── Métricas del equipo ──
  const avgTenure = useMemo(() => {
    if (!activeUsers.length) return '—'
    const avg = activeUsers.reduce((acc, u) => acc + (today - new Date(u.createdAt)) / (365.25 * 86400000), 0) / activeUsers.length
    return avg < 1 ? `${Math.round(avg * 12)} meses` : `${avg.toFixed(1)} años`
  }, [activeUsers])

  const roleDistrib = useMemo(() => {
    const map = {}
    for (const u of activeUsers) map[u.role] = (map[u.role] || 0) + 1
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [activeUsers])
  const maxRole = roleDistrib[0]?.[1] || 1

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

  // ── Celebraciones (cumpleaños + aniversarios, próximos 30 días) ──
  const celebrations = useMemo(() => {
    const out = []
    for (const u of activeUsers) {
      if (u.birthday) {
        const b = new Date(u.birthday.slice(0, 10) + 'T12:00:00')
        const days = daysUntilNextOccurrence(b.getMonth(), b.getDate())
        if (days <= HORIZON) out.push({ key: `b-${u.id}`, user: u, days, icon: '🎂', text: `Cumple años · ${fmtDateShort(u.birthday)}` })
      }
      const created = new Date(u.createdAt)
      const days = daysUntilNextOccurrence(created.getMonth(), created.getDate())
      const anniversary = new Date(today.getFullYear(), created.getMonth(), created.getDate())
      const years = today.getFullYear() - created.getFullYear() + (days > 0 && anniversary < today ? 1 : 0)
      if (days <= HORIZON && years >= 1) {
        out.push({ key: `a-${u.id}`, user: u, days, icon: '🎉', text: `${years} ${years === 1 ? 'año' : 'años'} en ${workspace?.name ?? 'el equipo'}` })
      }
    }
    return out.sort((a, b) => a.days - b.days)
  }, [activeUsers, workspace?.name])

  // ── Avisos del día ──
  const attentionItems = [
    ...(notLoggedInToday.length > 0 ? [{
      id: 'not-logged-in', severity: 'warning',
      label: `${notLoggedInToday.length} ${notLoggedInToday.length === 1 ? 'persona no inició' : 'personas no iniciaron'} sesión hoy`,
      detail: notLoggedInToday.slice(0, 3).map(u => u.name.split(' ')[0]).join(', ') + (notLoggedInToday.length > 3 ? '…' : ''),
      onClick: () => setListModal('notLoggedIn'),
    }] : []),
    ...(lateToday.length > 0 ? [{
      id: 'late-today', severity: 'warning',
      label: `${lateToday.length} ${lateToday.length === 1 ? 'persona llegó' : 'personas llegaron'} tarde hoy`,
      detail: lateToday.slice(0, 3).map(x => `${nameById(x.userId).split(' ')[0]} +${x.lateBy}m`).join(' · '),
      onClick: () => setListModal('lateToday'),
    }] : []),
    ...(incompleteCount > 0 ? [{
      id: 'incomplete-legajos', severity: 'info',
      label: `${incompleteCount} ${incompleteCount === 1 ? 'legajo incompleto' : 'legajos incompletos'}`,
      detail: 'Cada persona lo completa desde Mi Perfil',
      onClick: () => onNavigate('personas'),
    }] : []),
    ...(attendanceEnabled && !hasSchedules ? [{
      id: 'no-schedules', severity: 'info',
      label: 'Cargá horarios para medir llegadas y puntualidad',
      detail: 'Admin → Equipo',
      onClick: () => navigate('/admin?tab=team'),
    }] : []),
  ]

  // ── Indicadores: los 4 primeros quedan a la vista, el resto se pliega ──
  const metrics = [
    { key: 'connected', label: 'Conectados hoy', value: `${loggedInToday}/${presentExpected.length}`,
      sub: onLeaveToday.length > 0 ? `${onLeaveToday.length} de licencia, no cuentan` : 'del equipo esperado hoy',
      onClick: notLoggedInToday.length > 0 ? () => setListModal('notLoggedIn') : undefined },
    ...(attendanceEnabled && hasSchedules ? [
      { key: 'punctuality', label: 'Puntualidad del mes',
        value: dashStats.teamPunctualityPct != null ? `${dashStats.teamPunctualityPct}%` : '—',
        sub: `${dashStats.lateCount ?? 0} tarde de ${dashStats.scheduledDays ?? 0} llegadas`,
        onClick: () => setHistoryMetric('punctuality') },
      { key: 'avgLogin', label: 'Ingreso promedio', value: dashStats.avgFirstLoginTime ?? '—',
        sub: 'este mes, con horario', onClick: () => setHistoryMetric('avgLoginTime') },
    ] : []),
    ...(legajoReady ? [{
      key: 'legajos', label: 'Legajos completos', value: `${activeUsers.length - incompleteCount}/${activeUsers.length}`,
      sub: incompleteCount === 0 ? 'todos al día' : `${incompleteCount} por completar`, onClick: () => onNavigate('personas') }] : []),
    ...(attendanceEnabled && hasSchedules ? [{
      key: 'hours', label: 'Horas disponibles por día', value: `${teamHours.totalHours} h`,
      sub: `${teamHours.count} de ${teamHours.total} con horario`, onClick: () => setListModal('teamHours') }] : []),
    { key: 'tenure', label: 'Antigüedad promedio', value: avgTenure, sub: 'del equipo activo', onClick: () => setHistoryMetric('tenure') },
    { key: 'ppp', label: 'Proyectos por persona', value: dashStats.projectsPerPerson ?? '—', sub: 'proyectos activos ÷ equipo', onClick: () => setHistoryMetric('projectsPerPerson') },
  ]
  const mainMetrics = metrics.slice(0, 4)
  const moreMetrics = metrics.slice(4)

  const rawDate = today.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1)

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {dateLabel}
        {' · '}{items.length === 0 ? 'nada para resolver' : `${items.length} para resolver`}
        {' · '}{onLeaveToday.length === 0 ? 'todo el equipo disponible' : `${onLeaveToday.length} fuera hoy`}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          {/* Para resolver */}
          <Card>
            <CardHeader title="Para resolver" count={pending.loading ? null : items.length}
              action={<TextButton onClick={() => onNavigate('ausencias', 'solicitudes')}>Ver historial</TextButton>} />
            {flash && (
              <p role="status" className="mx-4 mb-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">✓ {flash}</p>
            )}
            {pending.loading ? (
              <div className="px-4 pb-4 space-y-3">
                {[0, 1].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-gray-700/50 animate-pulse" />)}
              </div>
            ) : pending.error ? (
              <EmptyNote>No pudimos cargar las solicitudes. Recargá la página para reintentar.</EmptyNote>
            ) : items.length === 0 ? (
              <div className="px-4 pb-5 pt-1 flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center text-lg flex-shrink-0">✓</span>
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Estás al día</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">No hay licencias ni beneficios esperando tu decisión.</p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700 border-t border-gray-100 dark:border-gray-700">
                {items.map(item => <ApprovalRow key={item.key} item={item} onDecided={handleDecided} />)}
              </ul>
            )}
          </Card>

          {/* Avisos del día */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">Avisos de hoy</h3>
            <AttentionBanner items={attentionItems} emptyLabel="✅ Sin avisos: el equipo está en orden." />
          </div>
        </div>

        {/* Columna lateral: quién está fuera + celebraciones */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Fuera del equipo" count={leaves.length || null}
              action={<TextButton onClick={() => onNavigate('ausencias', 'solicitudes')}>Ver todas</TextButton>} />
            {leaves.length === 0
              ? <EmptyNote>Nadie de licencia en los próximos 30 días.</EmptyNote>
              : (
                <ul className="px-4 pb-4 space-y-2.5">
                  {leaves.map(l => {
                    const days = Math.max(0, Math.round((new Date(l.startDate + 'T12:00:00') - today) / 86400000))
                    return (
                      <li key={l.id} className="flex items-center gap-2.5">
                        <Avatar user={{ name: l.name, avatar: l.avatar }} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{l.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {LEAVE_TYPE_LABELS[l.type] ?? l.type} · {leaveRangeLabel(l.startDate, l.endDate)}
                          </p>
                        </div>
                        {l.active
                          ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 flex-shrink-0">Hoy</span>
                          : <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">{relativeDay(days)}</span>}
                      </li>
                    )
                  })}
                </ul>
              )}
          </Card>

          <Card>
            <CardHeader title="Celebraciones" count={celebrations.length || null} />
            {celebrations.length === 0
              ? <EmptyNote>Ningún cumpleaños ni aniversario en los próximos 30 días.</EmptyNote>
              : (
                <ul className="px-4 pb-4 space-y-2.5">
                  {celebrations.map(c => (
                    <li key={c.key} className="flex items-center gap-2.5">
                      <Avatar user={c.user} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{c.user.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate"><span aria-hidden="true">{c.icon}</span> {c.text}</p>
                      </div>
                      <span className={`text-xs flex-shrink-0 ${c.days === 0 ? 'font-semibold text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`}>{relativeDay(c.days)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        </div>
      </div>

      {/* Indicadores del equipo */}
      <section>
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Indicadores del equipo</h3>
          <TextButton onClick={() => setMoreOpen(o => !o)}>{moreOpen ? 'Ver menos' : 'Ver más indicadores'}</TextButton>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {mainMetrics.map(m => <MetricTile key={m.key} {...m} />)}
          {moreOpen && moreMetrics.map(m => <MetricTile key={m.key} {...m} />)}
        </div>

        {moreOpen && (
          <div className="mt-3 space-y-3">
            {peopleScore && peopleScore.score != null && <PeopleScoreCard peopleScore={peopleScore} />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card>
                <CardHeader title="Distribución por roles" />
                <div className="px-4 pb-4 space-y-2">
                  {roleDistrib.map(([role, count]) => (
                    <div key={role} className="flex items-center gap-2">
                      <p className="text-xs text-gray-600 dark:text-gray-300 w-28 truncate flex-shrink-0">{labelFor(role)}</p>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="bg-primary-500 h-1.5 rounded-full" style={{ width: `${(count / maxRole) * 100}%` }} />
                      </div>
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-4 text-right flex-shrink-0">{count}</p>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title="Última conexión" action={<TextButton onClick={() => onNavigate('asistencia')}>Ver ingresos</TextButton>} />
                <ul className="px-4 pb-4 space-y-2">
                  {lastLoginRows.slice(0, 8).map(u => {
                    const since = daysSince(u.lastLogin)
                    return (
                      <li key={u.id} className="flex items-center gap-2.5">
                        <Avatar user={u} size="xs" />
                        <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{u.name}</p>
                        <span className={`text-xs flex-shrink-0 ${since === 'hoy' || since === 'ayer' ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                          {since ?? 'Sin registros'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            </div>
          </div>
        )}
      </section>

      {historyMetric && (
        <MetricHistoryModal
          config={METRIC_HISTORY[historyMetric]}
          current={{
            tenure: avgTenure,
            projectsPerPerson: dashStats.projectsPerPerson,
            avgLoginTime: dashStats.avgFirstLoginTime ?? null,
            punctuality: dashStats.teamPunctualityPct != null ? `${dashStats.teamPunctualityPct}%` : null,
          }[historyMetric]}
          onClose={() => setHistoryMetric(null)}
        />
      )}
      {listModal === 'notLoggedIn' && (
        <PeopleListModal
          title="Sin iniciar sesión hoy"
          subtitle={`${notLoggedInToday.length} de ${presentExpected.length} todavía no ingresaron${onLeaveToday.length > 0 ? ` · ${onLeaveToday.length} de licencia` : ''}`}
          people={notLoggedInToday.map(u => ({ id: u.id, name: u.name, avatar: u.avatar, right: lastLoginsMap[u.id] ? daysSince(lastLoginsMap[u.id]) : 'sin registros' }))}
          onClose={() => setListModal(null)}
        />
      )}
      {listModal === 'lateToday' && (
        <PeopleListModal
          title="Llegaron tarde hoy"
          subtitle={`${lateToday.length} ${lateToday.length === 1 ? 'persona' : 'personas'}`}
          people={lateToday.map(x => ({ id: x.userId, name: nameById(x.userId), avatar: usersById[x.userId]?.avatar, right: `+${x.lateBy} min`, rightCls: 'text-red-600 dark:text-red-400 font-medium' }))}
          onClose={() => setListModal(null)}
        />
      )}
      {listModal === 'teamHours' && <TeamHoursModal teamHours={teamHours} onClose={() => setListModal(null)} />}
    </div>
  )
}

function MetricTile({ label, value, sub, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={`text-left bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3.5 ${onClick ? 'hover:border-primary-300 dark:hover:border-primary-600 transition-colors group' : ''}`}>
      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-between gap-2">
        <span className="truncate">{label}</span>
        {onClick && <span aria-hidden="true" className="text-gray-300 dark:text-gray-600 group-hover:text-primary-500">→</span>}
      </p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 leading-none tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 truncate">{sub}</p>}
    </Tag>
  )
}
