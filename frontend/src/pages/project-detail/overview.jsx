import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import ProjectSituation from '../../components/ProjectSituation'
import UserLink from '../../components/UserLink'
import RoleBadge from '../../components/RoleBadge'
import { linkify } from '../../utils/linkify'
import { fmtMins, activeMinutes } from '../../utils/format'
import { Card, CardHeader, TextButton, Avatar, EmptyNote } from './ui'

// Pestaña "Resumen" — lo primero que se ve al entrar a un proyecto. Responde
// "¿cómo está esta cuenta?" sin recorrer pestañas: la situación escrita por el
// equipo, qué está trabado, quién está trabajando ahora, la última reunión, las
// horas del mes contra las contratadas y lo que espera al cliente. Cada bloque
// lleva a la pestaña donde se gestiona ese tema en detalle.

function fmtMeetingDate(ymd) {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  const txt = new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

function TaskLine({ task, user, onOpen, tone = 'default' }) {
  return (
    <li className={`flex items-start gap-3 px-4 py-3 ${tone === 'danger' ? 'bg-red-50/60 dark:bg-red-900/10' : ''}`}>
      <Avatar user={user} size="sm" />
      <div className="min-w-0 flex-1">
        <p onClick={() => onOpen(task)}
          className="text-sm text-gray-800 dark:text-gray-200 leading-snug break-words cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 line-clamp-2">
          {linkify(task.description)}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{user.name}</p>
        {tone === 'danger' && task.blockedReason && (
          <p className="mt-1 text-xs text-red-700 dark:text-red-400 border-l-2 border-red-300 dark:border-red-700 pl-2">{task.blockedReason}</p>
        )}
      </div>
    </li>
  )
}

// Horas registradas en el mes vs. horas contratadas (100%, sin ponderar por días
// transcurridos — mismo criterio que Reportes). Muestra también el avance del mes
// para leer si el ritmo es razonable.
function HoursCard({ projectId, timezone, goTab, openMins = 0 }) {
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    let alive = true
    api.get(`/projects/${projectId}/reports/hours-history`, { params: { months: 1 } })
      .then(r => { if (alive) setState({ loading: false, project: r.data.project, month: r.data.months?.[0] }) })
      .catch(() => { if (alive) setState({ loading: false, error: true }) })
    return () => { alive = false }
  }, [projectId])

  if (state.loading) {
    return <Card><CardHeader title="Horas del mes" /><div className="px-4 pb-4"><div className="h-14 rounded-xl bg-gray-100 dark:bg-gray-700/60 animate-pulse" /></div></Card>
  }
  if (state.error || !state.month) return null

  const { project, month } = state
  const budget = project?.hoursEnabled && month.monthlyHours != null ? month.monthlyHours : null
  const pct = budget ? Math.round((month.totalMinutes / (budget * 60)) * 100) : null
  const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone || 'America/Argentina/Buenos_Aires' })
  const [y, m, d] = today.split('-').map(Number)
  const monthPct = Math.round((d / new Date(y, m, 0).getDate()) * 100)
  const barColor = pct == null ? 'bg-primary-500' : pct > 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-primary-500'

  return (
    <Card>
      <CardHeader title={`Horas · ${month.label}`} action={<TextButton onClick={() => goTab('horas')}>Ver detalle</TextButton>} />
      <div className="px-4 pb-4">
        <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
          {fmtMins(month.totalMinutes) || '0m'}
          {budget != null && <span className="text-sm font-medium text-gray-500 dark:text-gray-400"> / {budget}h</span>}
        </p>
        {budget != null ? (
          <>
            <div className="relative mt-3 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div className={`absolute inset-y-0 left-0 rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className={pct > 100 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}>
                {pct}% de las horas contratadas
              </span>
              <span className="text-gray-400 dark:text-gray-500">Mes al {monthPct}%</span>
            </div>
          </>
        ) : (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {month.taskCount} tarea{month.taskCount !== 1 ? 's' : ''} completada{month.taskCount !== 1 ? 's' : ''} este mes
          </p>
        )}
        {openMins > 0 && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400" title="Las horas se registran al completar cada tarea, igual que en Reportes">
            + {fmtMins(openMins)} en tareas abiertas · se suman al completarlas
          </p>
        )}
      </div>
    </Card>
  )
}

function ymdInTz(tz) {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz || 'America/Argentina/Buenos_Aires' })
}
function hmInTz(tz) {
  return new Date().toLocaleTimeString('en-GB', { timeZone: tz || 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hour12: false })
}
function addDaysYmd(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

// Próxima reunión agendada en Calendario para este proyecto (las próximas 2 semanas).
// Solo se monta con el módulo Calendario habilitado y con acceso.
function NextMeetingCard({ projectId, timezone }) {
  const [next, setNext] = useState(undefined) // undefined = cargando, null = no hay

  useEffect(() => {
    let alive = true
    const today = ymdInTz(timezone)
    api.get('/calendar/events', { params: { from: today, to: addDaysYmd(today, 14), projectId } })
      .then(r => {
        if (!alive) return
        const now = hmInTz(timezone)
        const upcoming = (r.data || []).find(e => !e.realMeetingId && (e.date > today || e.startTime >= now))
        setNext(upcoming || null)
      })
      .catch(() => { if (alive) setNext(null) })
    return () => { alive = false }
  }, [projectId, timezone])

  if (!next) return null
  const accepted = (next.participants || []).filter(p => p.status === 'accepted').length
  const total = (next.participants || []).length
  const isToday = next.date === ymdInTz(timezone)

  return (
    <Card>
      <CardHeader title="Próxima reunión" action={<Link to={`/calendario?event=${next.id}`} className="whitespace-nowrap text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">Ver en Calendario</Link>} />
      <Link to={`/calendario?event=${next.id}`} className="block px-4 pb-4 group">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">
            {next.recurrenceId ? '🔁 ' : ''}{next.title}
          </p>
          {isToday && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">Hoy</span>}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {fmtMeetingDate(next.date)} · {next.startTime} · {fmtMins(next.durationMins)}
          {total > 0 && ` · ${accepted}/${total} confirmados`}
        </p>
      </Link>
    </Card>
  )
}

function LastMeetingCard({ projectId, goTab }) {
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    let alive = true
    api.get(`/projects/${projectId}/meetings`, { params: { take: 1 } })
      .then(r => { if (alive) setState({ loading: false, meeting: r.data.meetings?.[0] || null }) })
      .catch(() => { if (alive) setState({ loading: false, error: true }) })
    return () => { alive = false }
  }, [projectId])

  if (state.loading || state.error) return null
  const mt = state.meeting

  return (
    <Card>
      <CardHeader title="Última reunión" action={<TextButton onClick={() => goTab('reuniones')}>{mt ? 'Ver reuniones' : 'Registrar reunión'}</TextButton>} />
      {!mt ? (
        <EmptyNote>Todavía no se registró ninguna reunión en este proyecto.</EmptyNote>
      ) : (() => {
        const open = (mt.todos || []).filter(t => !t.done)
        return (
          <button type="button" onClick={() => goTab('reuniones')} className="w-full text-left px-4 pb-4 group">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400">
                {mt.title || (mt.type === 'client' ? 'Reunión con el cliente' : 'Reunión de equipo')}
              </p>
              {mt.running && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">En curso</span>}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {fmtMeetingDate(mt.date)} · {mt.type === 'client' ? 'con el cliente' : 'interna'}
              {mt.durationMins ? ` · ${fmtMins(mt.durationMins)}` : ''}
            </p>
            {open.length > 0 ? (
              <ul className="mt-2.5 space-y-1">
                {open.slice(0, 3).map(t => (
                  <li key={t.id} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0" />
                    <span className="line-clamp-1">{t.title}</span>
                  </li>
                ))}
                {open.length > 3 && <li className="text-xs text-gray-400 pl-3.5">y {open.length - 3} más</li>}
              </ul>
            ) : (mt.todos || []).length > 0 ? (
              <p className="mt-2 text-xs text-green-700 dark:text-green-400">✓ Todos los pendientes de esta reunión están resueltos</p>
            ) : null}
          </button>
        )
      })()}
    </Card>
  )
}

function ContentCard({ projectId }) {
  const [summary, setSummary] = useState(null)

  useEffect(() => {
    let alive = true
    api.get(`/contenido/projects/${projectId}/summary`)
      .then(r => { if (alive) setSummary(r.data) })
      .catch(() => {})
    return () => { alive = false }
  }, [projectId])

  if (!summary) return null
  const waiting = summary.awaitingClient || 0
  const changes = summary.byStatus?.cambios || 0

  return (
    <Card>
      <CardHeader title="Contenido" action={<Link to={`/contenido?projectId=${projectId}`} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">Abrir calendario</Link>} />
      <div className="px-4 pb-4 grid grid-cols-2 gap-2">
        <div className={`rounded-xl px-3 py-2.5 ${waiting > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-50 dark:bg-gray-700/40'}`}>
          <p className={`text-xl font-bold tabular-nums ${waiting > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>{waiting}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">esperan al cliente</p>
        </div>
        <div className={`rounded-xl px-3 py-2.5 ${changes > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-700/40'}`}>
          <p className={`text-xl font-bold tabular-nums ${changes > 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{changes}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">con cambios pedidos</p>
        </div>
      </div>
    </Card>
  )
}

export default function OverviewTab({ data, encodedId, authUser, onOpenComments, goTab, contentEnabled, calendarEnabled, onOpenTeamEdit }) {
  const project = data.project
  const rows = data.byUser.flatMap(({ user, tasks }) => tasks.map(task => ({ task, user })))
  const blocked = rows.filter(r => r.task.status === 'BLOCKED')
  const working = rows.filter(r => r.task.status === 'IN_PROGRESS')
  const members = (project.members ?? []).map(pm => pm.user)
  const links = project.linksEnabled !== false ? (project.links ?? []) : []
  const services = (project.services ?? []).map(ps => ps.service)
  const openMins = rows.reduce((sum, r) => sum + activeMinutes(r.task), 0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      {/* Columna principal */}
      <div className="lg:col-span-2 space-y-4 min-w-0">
        {project.situationEnabled !== false && (
          <ProjectSituation encodedProjectId={encodedId} initialContent={project.situation || ''} />
        )}

        {blocked.length > 0 && (
          <Card className="border-red-200 dark:border-red-900/60 overflow-hidden">
            <CardHeader
              title={<span className="text-red-700 dark:text-red-400">Necesita atención</span>}
              count={`${blocked.length} bloqueada${blocked.length !== 1 ? 's' : ''}`}
              action={<TextButton onClick={() => goTab('tareas', { status: 'BLOCKED' })}>Ver en Tareas</TextButton>}
            />
            <ul className="divide-y divide-red-100 dark:divide-red-900/30">
              {blocked.map(r => <TaskLine key={r.task.id} {...r} onOpen={onOpenComments} tone="danger" />)}
            </ul>
          </Card>
        )}

        <Card className="overflow-hidden">
          <CardHeader
            title="Trabajando ahora"
            count={working.length > 0 ? working.length : null}
            action={<TextButton onClick={() => goTab('tareas')}>Todas las tareas ({rows.length})</TextButton>}
          />
          {working.length === 0 ? (
            <EmptyNote>
              {rows.length === 0 ? 'No hay tareas activas en este proyecto.' : 'Nadie tiene una tarea de este proyecto en curso en este momento.'}
            </EmptyNote>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {working.map(r => <TaskLine key={r.task.id} {...r} onOpen={onOpenComments} />)}
            </ul>
          )}
        </Card>

        {calendarEnabled && <NextMeetingCard projectId={project.id} timezone={project.timezone} />}
        <LastMeetingCard projectId={project.id} goTab={goTab} />
      </div>

      {/* Columna lateral */}
      <aside className="space-y-4 min-w-0">
        <HoursCard projectId={project.id} timezone={project.timezone} goTab={goTab} openMins={openMins} />

        {contentEnabled && <ContentCard projectId={project.id} />}

        {project.linksEnabled !== false && (
          <Card>
            <CardHeader title="Links" action={<TextButton onClick={() => goTab('accesos')}>{links.length ? 'Links y accesos' : '+ Agregar'}</TextButton>} />
            {links.length === 0 ? (
              <EmptyNote>Sin links todavía.</EmptyNote>
            ) : (
              <ul className="px-2 pb-2">
                {links.map(l => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60 hover:text-primary-600 dark:hover:text-primary-400">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-gray-400 flex-shrink-0">
                        <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
                        <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
                      </svg>
                      <span className="truncate">{l.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card>
          <CardHeader
            title="Equipo"
            count={members.length || null}
            action={authUser?.isAdmin ? <TextButton onClick={onOpenTeamEdit}>Editar</TextButton> : null}
          />
          {members.length === 0 ? (
            <EmptyNote>Sin equipo asignado. Cualquiera del workspace puede igual sumar tareas acá.</EmptyNote>
          ) : (
            <ul className="px-2 pb-2">
              {members.map(u => (
                <li key={u.id}>
                  <UserLink userId={u.id} as="div" className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/60 cursor-pointer">
                    <Avatar user={u} size="sm" />
                    <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">{u.name}</span>
                    <RoleBadge userId={u.id} />
                  </UserLink>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {services.length > 0 && (
          <Card>
            <CardHeader title="Servicios" action={authUser?.isAdmin ? <TextButton onClick={() => goTab('ajustes')}>Editar</TextButton> : null} />
            <div className="px-4 pb-4 flex flex-wrap gap-1.5">
              {services.map(s => (
                <span key={s.id} className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 border border-primary-100 dark:border-primary-800 rounded-full px-2.5 py-0.5 font-medium">
                  {s.name}
                </span>
              ))}
            </div>
          </Card>
        )}
      </aside>
    </div>
  )
}
