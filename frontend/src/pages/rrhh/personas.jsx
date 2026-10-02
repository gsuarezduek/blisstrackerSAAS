import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'
import LoadingSpinner from '../../components/LoadingSpinner'
import RoleBadge from '../../components/RoleBadge'
import useLegajoFields from '../../hooks/useLegajoFields'
import useRoles from '../../hooks/useRoles'
import { useWorkspace } from '../../context/WorkspaceContext'
import { fieldValue, displayValue, isEmpty, isLegajoComplete, requiredFields } from '../../components/legajo/legajoUtils'
import { Card, CardHeader, TextButton, Avatar, EmptyNote } from '../project-detail/ui'
import { ProductividadSection } from '../../components/profile/AdminUserPanel'
import { LoginDaysModal } from './legajos'
import { VacationEditModal } from './vacacionesBalance'
import { AdjustModal } from './beneficios'
import { REQUEST_STATUS } from './licencias'
import { TZ, todayStr, fmtDate, LEAVE_TYPE_LABELS, BENEFIT_BANKS, leaveDayCount, leaveRangeLabel } from './shared'

// ─── Sección "Personas" del panel RRHH ────────────────────────────────────────
// Directorio con buscador/filtros → ficha unificada de una persona (resumen,
// asistencia, ausencias y saldos, datos personales, productividad). Reemplaza a
// la grilla de fotos de Legajos y a tener que ir a Vacaciones/Beneficios para
// ver o ajustar los saldos de alguien.

// ── Helpers puros (exportados para tests) ──

const DAY = 86400000

export function tenureLabel(fromIso, now = new Date()) {
  if (!fromIso) return '—'
  const from = new Date(fromIso)
  let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth())
  if (now.getDate() < from.getDate()) months--
  if (months < 1) return 'Nuevo'
  if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'}`
  const y = Math.floor(months / 12), m = months % 12
  return `${y} ${y === 1 ? 'año' : 'años'}${m ? ` y ${m} m` : ''}`
}

export function lastLoginLabel(iso, today = todayStr()) {
  if (!iso) return null
  const d = new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ })
  const diff = Math.round((new Date(today + 'T12:00:00') - new Date(d + 'T12:00:00')) / DAY)
  if (diff <= 0) return 'hoy'
  if (diff === 1) return 'ayer'
  return `hace ${diff} días`
}

export function missingLegajoFields(person, fields) {
  return requiredFields(fields).filter(f => isEmpty(fieldValue(person, f)))
}

export const PEOPLE_FILTERS = [
  { id: 'all',       label: 'Todos' },
  { id: 'incomplete', label: 'Legajo incompleto' },
  { id: 'noSchedule', label: 'Sin horario' },
  { id: 'away',      label: 'Fuera hoy' },
]

export const PEOPLE_SORTS = [
  { id: 'name',     label: 'Nombre' },
  { id: 'tenure',   label: 'Antigüedad' },
  { id: 'vacation', label: 'Más vacaciones' },
  { id: 'login',    label: 'Último ingreso' },
]

// Aplica búsqueda + filtro + orden. `ctx` trae lo que no vive en el usuario.
export function filterPeople(users, { query = '', filter = 'all', sort = 'name' } = {}, ctx = {}) {
  const { legajoFields = [], legajoReady = false, awayIds = new Set(), lastLogins = {}, roleLabel = r => r } = ctx
  const q = query.trim().toLowerCase()
  const match = u => !q || [u.name, u.email, roleLabel(u.role)].some(v => v && String(v).toLowerCase().includes(q))
  const pass = u => {
    if (filter === 'incomplete') return legajoReady && !isLegajoComplete(u, legajoFields)
    if (filter === 'noSchedule') return !(u.workStartTime && u.workEndTime)
    if (filter === 'away') return awayIds.has(u.id)
    return true
  }
  const joined = u => new Date(u.workspaceJoinedAt || u.createdAt).getTime()
  const cmp = {
    name:     (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
    tenure:   (a, b) => joined(a) - joined(b),
    vacation: (a, b) => (b.vacationDays ?? 0) - (a.vacationDays ?? 0),
    login:    (a, b) => new Date(lastLogins[b.id] || 0) - new Date(lastLogins[a.id] || 0),
  }[sort] ?? (() => 0)
  return users.filter(u => match(u) && pass(u)).sort(cmp)
}

const fmtNum = n => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1).replace('.', ','))

// ─── Directorio ───────────────────────────────────────────────────────────────

export function TabPersonas({ users, lastLoginsMap, leaves = [], selectedId, onSelect, onUsersChanged, productivityEnabled, initialFilter }) {
  const { labelFor } = useRoles()
  const { fields: legajoFields, legajoEnabled } = useLegajoFields()
  const [query, setQuery]   = useState('')
  const [filter, setFilter] = useState(PEOPLE_FILTERS.some(f => f.id === initialFilter) ? initialFilter : 'all')
  const [sort, setSort]     = useState('name')

  const legajoReady = legajoEnabled && legajoFields.length > 0
  const awayIds = useMemo(() => new Set(leaves.filter(l => l.active).map(l => l.userId)), [leaves])
  const ctx = { legajoFields, legajoReady, awayIds, lastLogins: lastLoginsMap, roleLabel: labelFor }

  const counts = useMemo(() => Object.fromEntries(PEOPLE_FILTERS.map(f => [f.id, filterPeople(users, { filter: f.id }, ctx).length])),
    [users, legajoFields, legajoReady, awayIds]) // eslint-disable-line react-hooks/exhaustive-deps
  const list = filterPeople(users, { query, filter, sort }, ctx)

  const selected = selectedId ? users.find(u => String(u.id) === String(selectedId)) : null
  if (selectedId && users.length > 0 && !selected) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-300">Esta persona ya no está activa en el equipo.</p>
        <TextButton className="mt-2" onClick={() => onSelect(null)}>← Volver a Personas</TextButton>
      </Card>
    )
  }
  if (selected) {
    return (
      <PersonFile user={selected} lastLogin={lastLoginsMap[selected.id]} leave={leaves.find(l => l.userId === selected.id && l.active)}
        onBack={() => onSelect(null)} onUsersChanged={onUsersChanged} productivityEnabled={productivityEnabled} />
    )
  }

  const visibleFilters = PEOPLE_FILTERS.filter(f => f.id === 'all' || (f.id === 'incomplete' ? legajoReady : true))

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
          </svg>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre, email o rol"
            aria-label="Buscar personas"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="whitespace-nowrap">Ordenar por</span>
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
            {PEOPLE_SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none">
        <div className="flex gap-1.5 min-w-max">
          {visibleFilters.map(f => {
            const active = filter === f.id
            return (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={active}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  active
                    ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white text-white dark:text-gray-900'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'}`}>
                {f.label} <span className={active ? 'opacity-70' : 'text-gray-400 dark:text-gray-500'}>{counts[f.id]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
            {query ? `Nadie coincide con “${query}”.` : 'No hay personas en este filtro.'}
          </p>
        ) : (
          <>
            {/* Encabezado de columnas (desktop) */}
            <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_1fr_0.8fr_0.8fr_0.8fr_1fr_1fr] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
              <span>Persona</span><span>Antigüedad</span><span className="text-right">Vacaciones</span>
              <span className="text-right">Horas libres</span><span className="text-right">Días home</span>
              <span>Legajo</span><span>Último ingreso</span>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {list.map(u => (
                <PersonRow key={u.id} user={u} lastLogin={lastLoginsMap[u.id]} away={awayIds.has(u.id)}
                  missing={legajoReady ? missingLegajoFields(u, legajoFields) : null}
                  incomplete={legajoReady && !isLegajoComplete(u, legajoFields)}
                  onOpen={() => onSelect(u.id)} />
              ))}
            </ul>
          </>
        )}
      </Card>
      <p className="text-xs text-gray-400 dark:text-gray-500 px-1">{list.length} de {users.length} personas activas</p>
    </div>
  )
}

function PersonRow({ user: u, lastLogin, away, incomplete, missing, onOpen }) {
  const since = lastLoginLabel(lastLogin)
  const legajo = missing == null
    ? <span className="text-gray-400">—</span>
    : incomplete
      ? <span className="text-amber-600 dark:text-amber-400">{missing.length > 0 ? `Faltan ${missing.length}` : 'Incompleto'}</span>
      : <span className="text-green-600 dark:text-green-400">Completo</span>
  return (
    <li>
      <button type="button" onClick={onOpen}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors focus:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-gray-700/40">
        <div className="md:grid md:grid-cols-[minmax(0,2.2fr)_1fr_0.8fr_0.8fr_0.8fr_1fr_1fr] md:gap-3 md:items-center">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar user={u} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate flex items-center gap-2">
                {u.name}
                {away && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">Fuera hoy</span>}
              </p>
              <div className="mt-0.5"><RoleBadge role={u.role} userId={u.id} /></div>
            </div>
          </div>
          {/* Desktop: columnas */}
          <span className="hidden md:block text-sm text-gray-600 dark:text-gray-300">{tenureLabel(u.workspaceJoinedAt || u.createdAt)}</span>
          <span className="hidden md:block text-sm text-right tabular-nums font-medium text-gray-800 dark:text-gray-200">{u.vacationDays ?? 0}</span>
          <span className="hidden md:block text-sm text-right tabular-nums text-gray-600 dark:text-gray-300">{fmtNum(u.freeHoursBalance ?? 0)}</span>
          <span className="hidden md:block text-sm text-right tabular-nums text-gray-600 dark:text-gray-300">{u.homeDaysBalance ?? 0}</span>
          <span className="hidden md:block text-sm">{legajo}</span>
          <span className={`hidden md:block text-sm ${since === 'hoy' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>{since ?? 'Sin registros'}</span>
          {/* Mobile: resumen en una línea */}
          <p className="md:hidden text-xs text-gray-500 dark:text-gray-400 mt-1.5 pl-12">
            {u.vacationDays ?? 0} días de vacaciones · {tenureLabel(u.workspaceJoinedAt || u.createdAt)} · {legajo}
          </p>
        </div>
      </button>
    </li>
  )
}

// ─── Ficha de una persona ─────────────────────────────────────────────────────

const FILE_TABS = [
  { id: 'resumen',    label: 'Resumen' },
  { id: 'asistencia', label: 'Asistencia' },
  { id: 'ausencias',  label: 'Ausencias' },
  { id: 'datos',      label: 'Datos personales' },
  { id: 'productividad', label: 'Productividad', requiresProductivity: true },
]

export function PersonFile({ user, lastLogin, leave, onBack, onUsersChanged, productivityEnabled }) {
  const { workspace } = useWorkspace()
  const { fields: legajoFields, legajoEnabled } = useLegajoFields()
  const [tab, setTab] = useState('resumen')
  const [summary, setSummary] = useState(null)
  const [summaryState, setSummaryState] = useState('loading')   // loading | ready | error
  const [requests, setRequests] = useState(null)                // { leaves, benefits } | null
  const [adjust, setAdjust] = useState(null)                    // null | 'vacaciones' | bank

  const loadSummary = useCallback(() =>
    api.get(`/admin/rrhh/user-summary/${user.id}`)
      .then(r => { setSummary(r.data); setSummaryState('ready') })
      .catch(() => setSummaryState('error')), [user.id])

  const loadRequests = useCallback(() =>
    Promise.all([
      api.get('/vacation/admin/requests', { params: { userId: user.id } }),
      api.get('/benefits/admin/requests'),
    ])
      .then(([l, b]) => setRequests({ leaves: l.data, benefits: b.data.filter(r => r.user?.id === user.id) }))
      .catch(() => setRequests({ leaves: [], benefits: [], error: true })), [user.id])

  useEffect(() => {
    setTab('resumen'); setSummary(null); setSummaryState('loading'); setRequests(null)
    loadSummary()
    loadRequests()
  }, [user.id, loadSummary, loadRequests])

  const tabs = FILE_TABS.filter(t => !t.requiresProductivity || productivityEnabled)
  const legajoReady = legajoEnabled && legajoFields.length > 0
  const missing = legajoReady ? missingLegajoFields(user, legajoFields) : []
  const incomplete = legajoReady && !isLegajoComplete(user, legajoFields)
  const joined = user.workspaceJoinedAt || user.createdAt

  function afterAdjust() { setAdjust(null); onUsersChanged?.() }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
        <span aria-hidden="true">←</span> Personas
      </button>

      {/* Encabezado */}
      <Card className="px-5 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <AvatarLarge user={user} />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{user.name}</h2>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <RoleBadge role={user.role} userId={user.id} />
                {leave && <Chip tone="primary">De licencia hoy</Chip>}
                {incomplete && <Chip tone="amber">Legajo incompleto</Chip>}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 sm:truncate break-words">
                {user.email} · En {workspace?.name ?? 'el equipo'} hace {tenureLabel(joined).toLowerCase()}
                {user.workStartTime && user.workEndTime ? ` · Horario ${user.workStartTime}–${user.workEndTime}` : ''}
              </p>
            </div>
          </div>
          <Link to={`/users/${user.id}`} className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline whitespace-nowrap self-start sm:self-center">
            Ver perfil →
          </Link>
        </div>
      </Card>

      {/* Saldos: lo que más se consulta y se ajusta, a un click */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BalanceTile label="Vacaciones" value={user.vacationDays ?? 0} unit="días" actionLabel="Ajustar" onAction={() => setAdjust('vacaciones')} />
        <BalanceTile label="Horas libres" value={fmtNum(user.freeHoursBalance ?? 0)} unit="horas" actionLabel="Otorgar" onAction={() => setAdjust('horas_libres')} />
        <BalanceTile label="Días home" value={user.homeDaysBalance ?? 0} unit="días" actionLabel="Otorgar" onAction={() => setAdjust('dias_home')} />
        <BalanceTile label="Ingreso promedio"
          value={summaryState === 'loading' ? '…' : (summary?.avgLoginTime ?? '—')}
          unit={summary?.punctuality ? `${summary.punctuality.punctualityPct}% puntual` : (summary?.avgLoginTime ? 'sin horario cargado' : 'sin registros')}
          actionLabel={summary?.loginDays?.length ? 'Ver días' : null} onAction={() => setTab('asistencia')} />
      </div>

      {/* Pestañas de la ficha */}
      <nav aria-label="Secciones de la ficha" className="-mx-4 px-4 sm:mx-0 sm:px-0 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-none">
        <div className="flex gap-1 min-w-max">
          {tabs.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}
              className={`shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-primary-600 text-primary-700 dark:border-primary-400 dark:text-primary-300'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
              {t.label}
              {t.id === 'datos' && incomplete && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" aria-label="incompleto" />}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'resumen' && (
        <SummaryTab user={user} summary={summary} summaryState={summaryState} requests={requests}
          lastLogin={lastLogin} missing={missing} incomplete={incomplete} legajoReady={legajoReady} onGo={setTab} />
      )}
      {tab === 'asistencia' && (
        <AttendanceTab user={user} summary={summary} summaryState={summaryState} onRetry={loadSummary} onChanged={loadSummary} />
      )}
      {tab === 'ausencias' && <AbsencesTab summary={summary} requests={requests} onRetry={loadRequests} />}
      {tab === 'datos' && <PersonalDataTab user={user} fields={legajoFields} missing={missing} />}
      {tab === 'productividad' && productivityEnabled && (
        <Card className="p-4 sm:p-5"><ProductividadSection userId={user.id} /></Card>
      )}

      {adjust === 'vacaciones' && (
        <VacationEditModal user={user} onClose={() => setAdjust(null)} onUpdated={afterAdjust} />
      )}
      {adjust && adjust !== 'vacaciones' && (
        <AdjustModal bank={adjust}
          user={{ userId: user.id, user: { name: user.name }, balance: user[BENEFIT_BANKS[adjust].balanceField] ?? 0 }}
          onClose={() => setAdjust(null)} onUpdated={afterAdjust} />
      )}
    </div>
  )
}

function AvatarLarge({ user }) {
  return <img src={avatarUrl(user.avatar)} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0 border-2 border-gray-200 dark:border-gray-600" />
}

function Chip({ tone, children }) {
  const cls = tone === 'amber'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}

function BalanceTile({ label, value, unit, actionLabel, onAction }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
        {actionLabel && <TextButton onClick={onAction}>{actionLabel}</TextButton>}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1 leading-none tabular-nums">{value}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 truncate">{unit}</p>
    </div>
  )
}

function LoadError({ onRetry, children = 'No pudimos cargar estos datos.' }) {
  return (
    <div className="px-4 py-6 text-center">
      <p className="text-sm text-gray-500 dark:text-gray-400">{children}</p>
      {onRetry && <TextButton className="mt-2" onClick={onRetry}>Reintentar</TextButton>}
    </div>
  )
}

// ── Resumen ──

function SummaryTab({ user, summary, summaryState, requests, lastLogin, missing, incomplete, legajoReady, onGo }) {
  const today = todayStr()
  const upcoming = useMemo(() => (requests?.leaves ?? [])
    .filter(r => (r.status === 'approved' || r.status === 'pending') && r.endDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate)), [requests, today])
  const pendingBenefits = (requests?.benefits ?? []).filter(r => r.status === 'pending')
  const since = lastLoginLabel(lastLogin)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <Card>
        <CardHeader title="Ausencias próximas" count={upcoming.length || null}
          action={<TextButton onClick={() => onGo('ausencias')}>Ver historial</TextButton>} />
        {!requests ? <div className="px-4 pb-4"><LoadingSpinner size="sm" /></div>
          : upcoming.length === 0 && pendingBenefits.length === 0
            ? <EmptyNote>No tiene licencias en curso ni pedidas.</EmptyNote>
            : (
              <ul className="px-4 pb-4 space-y-2.5">
                {upcoming.map(r => (
                  <li key={`l-${r.id}`} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{LEAVE_TYPE_LABELS[r.type] ?? r.type}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{leaveRangeLabel(r.startDate, r.endDate)}</p>
                    </div>
                    <StatusPill status={r.status === 'approved' && r.startDate <= today ? 'current' : r.status} />
                  </li>
                ))}
                {pendingBenefits.map(r => (
                  <li key={`b-${r.id}`} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{BENEFIT_BANKS[r.bank]?.label ?? r.bank}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{fmtNum(r.amount)} {BENEFIT_BANKS[r.bank]?.unit}{r.date ? ` · ${leaveRangeLabel(r.date, r.date)}` : ''}</p>
                    </div>
                    <StatusPill status="pending" />
                  </li>
                ))}
              </ul>
            )}
      </Card>

      <Card>
        <CardHeader title="Proyectos" count={summary?.projects?.length || null} />
        {summaryState === 'loading' ? <div className="px-4 pb-4"><LoadingSpinner size="sm" /></div>
          : summaryState === 'error' ? <LoadError />
          : !summary.projects?.length ? <EmptyNote>No es parte del equipo de ningún proyecto activo.</EmptyNote>
          : (
            <ul className="px-4 pb-4 flex flex-wrap gap-1.5">
              {summary.projects.map(p => (
                <li key={p.id}>
                  <Link to={`/my-projects/${p.id}`}
                    className="inline-block text-sm px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600">
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </Card>

      <Card>
        <CardHeader title="Asistencia" action={<TextButton onClick={() => onGo('asistencia')}>Ver detalle</TextButton>} />
        <dl className="px-4 pb-4 grid grid-cols-2 gap-3 text-sm">
          <Stat label="Último ingreso" value={since ?? 'Sin registros'} />
          <Stat label="Ingreso promedio" value={summary?.avgLoginTime ?? '—'} />
          <Stat label="Puntualidad" value={summary?.punctuality ? `${summary.punctuality.punctualityPct}%` : '—'}
            hint={summary?.punctuality ? `${summary.punctuality.onTimeDays} de ${summary.punctuality.daysCount} llegadas a horario` : (user.workStartTime ? null : 'Sin horario cargado')} />
          <Stat label="Horario" value={user.workStartTime && user.workEndTime ? `${user.workStartTime}–${user.workEndTime}` : 'Sin cargar'} />
        </dl>
      </Card>

      {legajoReady && (
        <Card>
          <CardHeader title="Legajo" action={<TextButton onClick={() => onGo('datos')}>Ver datos</TextButton>} />
          {incomplete ? (
            <div className="px-4 pb-4">
              <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                {missing.length > 0 ? `Le faltan ${missing.length} ${missing.length === 1 ? 'dato obligatorio' : 'datos obligatorios'}` : 'Todavía no cargó ningún dato'}
              </p>
              {missing.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{missing.slice(0, 6).map(f => f.label).join(' · ')}{missing.length > 6 ? '…' : ''}</p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Lo completa la persona desde Mi Perfil.</p>
            </div>
          ) : <EmptyNote>Completo.</EmptyNote>}
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value, hint }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">{value}</dd>
      {hint && <dd className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hint}</dd>}
    </div>
  )
}

const PILL = {
  pending:  { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  approved: { label: 'Aprobada',  cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  current:  { label: 'En curso',  cls: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
  rejected: { label: 'Rechazada', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
}
function StatusPill({ status }) {
  const p = PILL[status] ?? { label: REQUEST_STATUS[status]?.label ?? status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${p.cls}`}>{p.label}</span>
}

// ── Asistencia ──

function AttendanceTab({ user, summary, summaryState, onRetry, onChanged }) {
  const [showAll, setShowAll] = useState(false)
  if (summaryState === 'loading') return <LoadingSpinner className="py-10" />
  if (summaryState === 'error') return <Card><LoadError onRetry={onRetry} /></Card>
  const p = summary.punctuality
  const days = summary.loginDays ?? []
  const showLate = summary.attendanceTrackingEnabled !== false && !!summary.workStartTime

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BalanceTile label="Ingreso promedio" value={summary.avgLoginTime ?? '—'} unit={`sobre ${days.length} ${days.length === 1 ? 'día' : 'días'} con registro`} />
        <BalanceTile label="Puntualidad" value={p ? `${p.punctualityPct}%` : '—'} unit={p ? `${p.onTimeDays} de ${p.daysCount} a horario` : 'Sin horario cargado'} />
        <BalanceTile label="Llegadas tarde" value={p ? p.lateDays : '—'} unit={p?.lateDays ? `+${p.avgLateMins} min en promedio` : (p ? 'ninguna' : '—')} />
        <BalanceTile label="Horario esperado" value={summary.workStartTime ?? '—'}
          unit={summary.workStartTime ? (summary.lateToleranceMins > 0 ? `${summary.lateToleranceMins} min de tolerancia` : 'sin tolerancia') : 'Se carga en Admin → Equipo'} />
      </div>

      <Card>
        <CardHeader title="Primer ingreso por día" count={days.length || null}
          action={days.length > 0 && <TextButton onClick={() => setShowAll(true)}>Corregir ingresos</TextButton>} />
        {days.length === 0 ? <EmptyNote>Sin ingresos registrados.</EmptyNote> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 border-t border-gray-100 dark:border-gray-700">
            {days.slice(0, 14).map(d => (
              <li key={d.date} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{fmtDate(d.date)}</span>
                <span className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">{d.time}</span>
                  {showLate && (d.lateBy == null
                    ? <span className="text-xs text-gray-400 dark:text-gray-500 w-20 text-right">fuera de horario</span>
                    : d.lateBy > 0
                      ? <span className="text-xs font-medium text-red-600 dark:text-red-400 w-20 text-right tabular-nums">+{d.lateBy} min</span>
                      : <span className="text-xs font-medium text-green-600 dark:text-green-400 w-20 text-right">a horario</span>)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {days.length > 14 && <p className="px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700">Mostrando los últimos 14 días. “Corregir ingresos” muestra todos.</p>}
      </Card>

      {showAll && <LoginDaysModal user={user} summary={summary} onChanged={onChanged} onClose={() => setShowAll(false)} />}
    </div>
  )
}

// ── Ausencias ──

function AbsencesTab({ summary, requests, onRetry }) {
  const [year, setYear] = useState(new Date().getFullYear())
  if (!requests) return <LoadingSpinner className="py-10" />
  if (requests.error) return <Card><LoadError onRetry={onRetry} /></Card>

  const taken = (summary?.leaves ?? []).filter(l => Number(l.startDate.slice(0, 4)) === year)
  const takenDays = taken.reduce((s, l) => s + leaveDayCount(l.startDate, l.endDate), 0)
  const thisYear = new Date().getFullYear()

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Licencias tomadas</h3>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setYear(y => y - 1)} aria-label="Año anterior"
              className="w-7 h-7 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
            <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums w-12 text-center">{year}</span>
            <button type="button" onClick={() => setYear(y => y + 1)} disabled={year >= thisYear} aria-label="Año siguiente"
              className="w-7 h-7 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30">›</button>
          </div>
        </div>
        {taken.length === 0 ? <EmptyNote>Sin licencias aprobadas en {year}.</EmptyNote> : (
          <>
            <p className="px-4 pb-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-800 dark:text-gray-200">{takenDays}</span> {takenDays === 1 ? 'día' : 'días'} en {taken.length} {taken.length === 1 ? 'licencia' : 'licencias'}
            </p>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 border-t border-gray-100 dark:border-gray-700">
              {taken.map(l => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{LEAVE_TYPE_LABELS[l.type] ?? l.type}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{leaveRangeLabel(l.startDate, l.endDate)}</p>
                    {l.observation && <p className="text-xs text-gray-400 dark:text-gray-500 italic truncate">{l.observation}</p>}
                  </div>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300 tabular-nums flex-shrink-0">{leaveDayCount(l.startDate, l.endDate)} d</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card>
        <CardHeader title="Todas las solicitudes" count={(requests.leaves.length + requests.benefits.length) || null} />
        {requests.leaves.length + requests.benefits.length === 0 ? <EmptyNote>Todavía no pidió licencias ni beneficios.</EmptyNote> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 border-t border-gray-100 dark:border-gray-700">
            {[
              ...requests.leaves.map(r => ({ key: `l-${r.id}`, sort: r.startDate, title: LEAVE_TYPE_LABELS[r.type] ?? r.type,
                sub: `${leaveRangeLabel(r.startDate, r.endDate)} · ${leaveDayCount(r.startDate, r.endDate)} d`, status: r.status, note: r.reviewNote, by: r.reviewedBy?.name })),
              ...requests.benefits.map(r => ({ key: `b-${r.id}`, sort: r.date || r.createdAt?.slice(0, 10) || '', title: BENEFIT_BANKS[r.bank]?.label ?? r.bank,
                sub: `${fmtNum(r.amount)} ${BENEFIT_BANKS[r.bank]?.unit ?? ''}${r.date ? ` · ${leaveRangeLabel(r.date, r.date)}` : ''}`, status: r.status, note: r.reviewNote, by: r.reviewedBy?.name })),
            ].sort((a, b) => b.sort.localeCompare(a.sort)).map(r => (
              <li key={r.key} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{r.sub}</p>
                  {r.note && <p className="text-xs text-gray-400 dark:text-gray-500 italic mt-0.5 truncate">“{r.note}”{r.by ? ` — ${r.by}` : ''}</p>}
                </div>
                <StatusPill status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

// ── Datos personales ──

function PersonalDataTab({ user, fields, missing }) {
  const missingKeys = new Set(missing.map(f => f.key))
  const rows = fields
    .filter(f => f.enabled !== false)
    .sort((a, b) => a.order - b.order)
    .map(f => ({ key: f.key, label: f.label, group: f.group, value: displayValue(f, fieldValue(user, f)), missing: missingKeys.has(f.key) }))
  const filled = rows.filter(r => r.value != null)
  const toShow = rows.filter(r => r.value != null || r.missing)

  return (
    <Card>
      <CardHeader title="Datos personales" count={`${filled.length} de ${rows.length} cargados`} />
      {toShow.length === 0 ? <EmptyNote>Todavía no completó sus datos. Lo hace desde Mi Perfil.</EmptyNote> : (
        <dl className="px-4 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          {toShow.map(r => (
            <div key={r.key}>
              <dt className="text-xs text-gray-500 dark:text-gray-400">{r.label}</dt>
              {r.value != null
                ? <dd className="text-sm text-gray-900 dark:text-gray-100 mt-0.5 break-words">{r.value}</dd>
                : <dd className="text-sm text-amber-600 dark:text-amber-400 mt-0.5">Falta completar (obligatorio)</dd>}
            </div>
          ))}
        </dl>
      )}
      <p className="px-4 pb-4 text-xs text-gray-400 dark:text-gray-500">Cada persona carga y actualiza sus datos desde Mi Perfil. Los campos se configuran en Administración → Legajo.</p>
    </Card>
  )
}
