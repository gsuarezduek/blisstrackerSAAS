import { useState, useEffect, useMemo, useCallback } from 'react'
import api from '../../api/client'
import RoleBadge from '../../components/RoleBadge'
import { Card, CardHeader, TextButton, Avatar, EmptyNote } from '../project-detail/ui'
import { ApprovalRow, buildApprovalItems } from './approvals'
import { EditModal } from './licencias'
import { VacationEditModal, INTERVAL_LABELS } from './vacacionesBalance'
import { AdjustModal } from './beneficios'
import { TZ, todayStr, LEAVE_TYPE_LABELS, BENEFIT_BANKS, leaveDayCount, leaveRangeLabel } from './shared'

// ─── Sección "Ausencias" del panel RRHH ───────────────────────────────────────
// Tres vistas: Calendario (quién falta cuándo, todo el equipo en un mes),
// Solicitudes (licencias + beneficios en una sola lista, con aprobación en el
// lugar) y Saldos (vacaciones, horas libres y días home de cada persona, con
// ajuste a un click). Reemplaza a las pestañas Licencias / Vacaciones / Beneficios.

const fmtNum = n => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })
const pad = n => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`

// Carga compartida: todas las solicitudes de licencias y de beneficios.
function useAllRequests() {
  const [state, setState] = useState({ leaves: [], benefits: [], loading: true, error: false })
  const reload = useCallback(async () => {
    try {
      const [l, b] = await Promise.all([api.get('/vacation/admin/requests'), api.get('/benefits/admin/requests')])
      setState({ leaves: l.data, benefits: b.data, loading: false, error: false })
    } catch {
      setState(s => ({ ...s, loading: false, error: true }))
    }
  }, [])
  useEffect(() => { reload() }, [reload])
  return [state, reload]
}

function LoadError({ onRetry }) {
  return (
    <Card className="px-4 py-8 text-center">
      <p className="text-sm text-gray-500 dark:text-gray-400">No pudimos cargar las solicitudes.</p>
      <TextButton className="mt-2" onClick={onRetry}>Reintentar</TextButton>
    </Card>
  )
}

function Skeleton({ rows = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
    </div>
  )
}

// ═══ Calendario ═══════════════════════════════════════════════════════════════

const CELL = {
  leave:   { approved: 'bg-primary-500', pending: 'bg-amber-200 dark:bg-amber-700/60' },
  home:    { approved: 'bg-sky-400',     pending: 'bg-sky-200 dark:bg-sky-800/60' },
  hours:   { approved: 'bg-violet-400',  pending: 'bg-violet-200 dark:bg-violet-800/60' },
}

// Arma la grilla persona × día de un mes. Pura (exportada para tests).
// Solo cuenta solicitudes aprobadas o pendientes; las rechazadas no se muestran.
export function buildAbsenceGrid({ users = [], leaves = [], benefits = [], year, month, today = todayStr() }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = ymd(year, month, i + 1)
    const dow = new Date(year, month, i + 1).getDay()
    return { date, day: i + 1, dow, weekend: dow === 0 || dow === 6, today: date === today }
  })
  const first = days[0].date, last = days[days.length - 1].date
  const rows = new Map(users.map(u => [u.id, { user: u, cells: {}, count: 0 }]))
  const put = (userId, date, entry) => {
    const row = rows.get(userId)
    if (!row) return
    ;(row.cells[date] ||= []).push(entry)
  }
  for (const r of leaves) {
    if (r.status === 'rejected' || r.endDate < first || r.startDate > last) continue
    const label = `${LEAVE_TYPE_LABELS[r.type] ?? r.type}${r.status === 'pending' ? ' (pendiente)' : ''}`
    for (const d of days) if (d.date >= r.startDate && d.date <= r.endDate) put(r.user?.id, d.date, { kind: 'leave', status: r.status, label })
  }
  for (const r of benefits) {
    if (r.status === 'rejected' || !r.date || r.date < first || r.date > last) continue
    const kind = r.bank === 'dias_home' ? 'home' : 'hours'
    const meta = BENEFIT_BANKS[r.bank]
    const label = `${meta?.label ?? r.bank}${kind === 'hours' ? ` · ${fmtNum(r.amount)} h` : ''}${r.status === 'pending' ? ' (pendiente)' : ''}`
    put(r.user?.id, r.date, { kind, status: r.status, label })
  }
  for (const row of rows.values()) row.count = Object.keys(row.cells).length
  return { days, rows: [...rows.values()] }
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

export function TabCalendario({ users, onOpenPerson }) {
  const [req, reload] = useAllRequests()
  const today = todayStr()
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const [onlyAway, setOnlyAway] = useState(true)

  const grid = useMemo(() => buildAbsenceGrid({ users, leaves: req.leaves, benefits: req.benefits, year: ym.y, month: ym.m, today }),
    [users, req.leaves, req.benefits, ym, today])
  const withAbsences = grid.rows.filter(r => r.count > 0)
  const rows = (onlyAway ? withAbsences : grid.rows).slice().sort((a, b) => (b.count - a.count) || a.user.name.localeCompare(b.user.name, 'es'))
  const totalDays = withAbsences.reduce((s, r) => s + r.count, 0)
  const isCurrent = ym.y === Number(today.slice(0, 4)) && ym.m === Number(today.slice(5, 7)) - 1

  function shift(delta) {
    setYm(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  if (req.error) return <LoadError onRetry={reload} />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Mes anterior"
            className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">‹</button>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white capitalize w-40 text-center">{MONTHS[ym.m]} {ym.y}</h3>
          <button type="button" onClick={() => shift(1)} aria-label="Mes siguiente"
            className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">›</button>
          {!isCurrent && <TextButton className="ml-2" onClick={() => setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })}>Hoy</TextButton>}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {req.loading ? 'Cargando…' : withAbsences.length === 0 ? 'Nadie falta este mes'
            : `${withAbsences.length} ${withAbsences.length === 1 ? 'persona' : 'personas'} · ${totalDays} ${totalDays === 1 ? 'día' : 'días'} fuera`}
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={onlyAway} onChange={e => setOnlyAway(e.target.checked)} className="accent-primary-600" />
          Solo quienes faltan
        </label>
      </div>

      <Card className="overflow-hidden">
        {req.loading ? <div className="p-4"><Skeleton /></div> : rows.length === 0 ? (
          <EmptyNote>
            <span className="block pt-6 text-center">Nadie tiene licencias ni beneficios en {MONTHS[ym.m]}.</span>
          </EmptyNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse text-xs" style={{ minWidth: 112 + grid.days.length * 30 }}>
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white dark:bg-gray-800 text-left font-semibold text-gray-500 dark:text-gray-400 px-2 sm:px-3 py-2 w-28 sm:w-40 border-b border-gray-100 dark:border-gray-700">Persona</th>
                  {grid.days.map(d => (
                    <th key={d.date} scope="col"
                      className={`w-[30px] py-1.5 font-medium border-b border-gray-100 dark:border-gray-700 ${d.today ? 'text-primary-600 dark:text-primary-400' : d.weekend ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>
                      <span className="block text-[10px]">{DOW[d.dow]}</span>
                      <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full ${d.today ? 'bg-primary-600 text-white' : ''}`}>{d.day}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ user, cells }) => (
                  <tr key={user.id} className="group">
                    <th scope="row" className="sticky left-0 z-10 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-700/60 text-left font-normal px-2 sm:px-3 py-1.5 border-b border-gray-100 dark:border-gray-700">
                      <button type="button" onClick={() => onOpenPerson?.(user.id)} className="flex items-center gap-2 max-w-[6.5rem] sm:max-w-[9.5rem] hover:underline">
                        <Avatar user={user} size="xs" />
                        <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{user.name}</span>
                      </button>
                    </th>
                    {grid.days.map(d => {
                      const entries = cells[d.date] ?? []
                      const e = entries[0]
                      return (
                        <td key={d.date} title={entries.map(x => x.label).join(' · ') || undefined}
                          className={`p-0.5 border-b border-gray-100 dark:border-gray-700 ${d.weekend ? 'bg-gray-50 dark:bg-gray-900/40' : ''} ${d.today ? 'bg-primary-50/60 dark:bg-primary-900/10' : ''}`}>
                          {e && <span className={`block h-5 rounded ${CELL[e.kind][e.status === 'approved' ? 'approved' : 'pending']}`} />}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400 px-1">
        <Legend cls="bg-primary-500" label="Licencia aprobada" />
        <Legend cls="bg-amber-200 dark:bg-amber-700/60" label="Licencia pendiente" />
        <Legend cls="bg-sky-400" label="Día home" />
        <Legend cls="bg-violet-400" label="Horas libres" />
        <span className="hidden sm:inline">Pasá el mouse por un día para ver el detalle.</span>
      </div>
    </div>
  )
}

function Legend({ cls, label }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${cls}`} aria-hidden="true" />{label}</span>
}

// ═══ Solicitudes ══════════════════════════════════════════════════════════════

export const REQUEST_FILTERS = [
  { id: 'all',          label: 'Todas' },
  { id: 'leave',        label: 'Licencias' },
  { id: 'horas_libres', label: 'Horas libres' },
  { id: 'dias_home',    label: 'Días home' },
]

// Normaliza licencias y beneficios a filas comparables y las separa en
// pendientes / próximas y en curso / anteriores. Pura (exportada para tests).
export function groupRequests({ leaves = [], benefits = [], filter = 'all', query = '', today = todayStr() }) {
  const q = query.trim().toLowerCase()
  const rows = []
  if (filter === 'all' || filter === 'leave') {
    for (const r of leaves) {
      const days = leaveDayCount(r.startDate, r.endDate)
      rows.push({ key: `leave-${r.id}`, kind: 'leave', raw: r, user: r.user, status: r.status,
        title: LEAVE_TYPE_LABELS[r.type] ?? r.type, when: leaveRangeLabel(r.startDate, r.endDate),
        amount: `${days} ${days === 1 ? 'día' : 'días'}`, start: r.startDate, end: r.endDate,
        note: r.observation, reviewNote: r.reviewNote, reviewedBy: r.reviewedBy?.name })
    }
  }
  for (const r of benefits) {
    if (filter !== 'all' && filter !== r.bank) continue
    const meta = BENEFIT_BANKS[r.bank]
    const d = r.date || (r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-CA', { timeZone: TZ }) : '')
    rows.push({ key: `benefit-${r.id}`, kind: 'benefit', raw: r, user: r.user, status: r.status,
      title: meta?.label ?? r.bank, when: r.date ? leaveRangeLabel(r.date, r.date) : 'Sin fecha',
      amount: `${fmtNum(r.amount)} ${r.amount === 1 ? (UNIT_SINGULAR[meta?.unit] ?? meta?.unit ?? '') : (meta?.unit ?? '')}`, start: d, end: d,
      note: r.reason, reviewNote: r.reviewNote, reviewedBy: r.reviewedBy?.name })
  }
  const visible = q ? rows.filter(r => r.user?.name?.toLowerCase().includes(q)) : rows
  const upcoming = visible.filter(r => r.status === 'approved' && r.end >= today).sort((a, b) => a.start.localeCompare(b.start))
  const past = visible.filter(r => r.status === 'rejected' || (r.status === 'approved' && r.end < today)).sort((a, b) => b.start.localeCompare(a.start))
  return { pendingIds: new Set(visible.filter(r => r.status === 'pending').map(r => r.key)), upcoming, past }
}

const UNIT_SINGULAR = { horas: 'hora', 'días': 'día' }

const STATUS_PILL = {
  approved: { label: 'Aprobada',  cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  current:  { label: 'En curso',  cls: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
  rejected: { label: 'Rechazada', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
}

export function TabSolicitudes({ users, onUsersChanged, onRequestsChanged }) {
  const [req, reload] = useAllRequests()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [pastLimit, setPastLimit] = useState(20)
  const [showPast, setShowPast] = useState(false)
  const today = todayStr()

  const usersById = useMemo(() => Object.fromEntries(users.map(u => [u.id, u])), [users])
  const groups = useMemo(() => groupRequests({ leaves: req.leaves, benefits: req.benefits, filter, query, today }),
    [req.leaves, req.benefits, filter, query, today])
  const approvedLeaves = useMemo(() => req.leaves.filter(r => r.status === 'approved' && r.endDate >= today), [req.leaves, today])
  const pendingItems = useMemo(() => buildApprovalItems({
    leaves: req.leaves.filter(r => r.status === 'pending'),
    benefits: req.benefits.filter(r => r.status === 'pending'),
    approvedLeaves, usersById,
  }).filter(i => groups.pendingIds.has(i.key)), [req, approvedLeaves, usersById, groups])

  function handleDecided(_item, status) {
    reload()
    onRequestsChanged?.()
    if (status === 'approved') onUsersChanged?.()
  }

  if (req.error) return <LoadError onRetry={reload} />

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none flex-1">
          <div className="flex gap-1.5 min-w-max">
            {REQUEST_FILTERS.map(f => (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  filter === f.id
                    ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white text-white dark:text-gray-900'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar persona" aria-label="Buscar persona"
          className="sm:w-56 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>

      {req.loading ? <Skeleton rows={5} /> : (
        <>
          <Card>
            <CardHeader title="Para resolver" count={pendingItems.length} />
            {pendingItems.length === 0
              ? <EmptyNote>No hay solicitudes esperando una decisión.</EmptyNote>
              : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-700 border-t border-gray-100 dark:border-gray-700">
                  {pendingItems.map(item => <ApprovalRow key={item.key} item={item} onDecided={handleDecided} />)}
                </ul>
              )}
          </Card>

          <Card>
            <CardHeader title="Próximas y en curso" count={groups.upcoming.length} />
            {groups.upcoming.length === 0
              ? <EmptyNote>No hay ausencias aprobadas por delante.</EmptyNote>
              : <RequestList rows={groups.upcoming} today={today} onEdit={setEditing} />}
          </Card>

          <Card>
            <CardHeader title="Anteriores" count={groups.past.length}
              action={groups.past.length > 0 && <TextButton onClick={() => setShowPast(v => !v)}>{showPast ? 'Ocultar' : 'Mostrar'}</TextButton>} />
            {showPast && (
              groups.past.length === 0 ? <EmptyNote>Todavía no hay solicitudes anteriores.</EmptyNote> : (
                <>
                  <RequestList rows={groups.past.slice(0, pastLimit)} today={today} onEdit={setEditing} />
                  {groups.past.length > pastLimit && (
                    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-center">
                      <TextButton onClick={() => setPastLimit(n => n + 20)}>Ver {Math.min(20, groups.past.length - pastLimit)} más</TextButton>
                    </div>
                  )}
                </>
              )
            )}
          </Card>
        </>
      )}

      {editing && (
        <EditModal request={editing} onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); reload(); onUsersChanged?.() }} />
      )}
    </div>
  )
}

function RequestList({ rows, today, onEdit }) {
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-700 border-t border-gray-100 dark:border-gray-700">
      {rows.map(r => {
        const pill = r.status === 'approved' && r.start <= today && r.end >= today ? STATUS_PILL.current : STATUS_PILL[r.status]
        return (
          <li key={r.key} className="flex items-start gap-3 px-4 py-3">
            <Avatar user={r.user ?? {}} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 dark:text-white">
                <span className="font-semibold">{r.user?.name}</span>
                <span className="text-gray-500 dark:text-gray-400"> · {r.title}</span>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{r.when} · {r.amount}</p>
              {r.reviewNote && <p className="text-xs text-gray-400 dark:text-gray-500 italic mt-0.5 truncate">“{r.reviewNote}”{r.reviewedBy ? ` — ${r.reviewedBy}` : ''}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {pill && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${pill.cls}`}>{pill.label}</span>}
              {r.kind === 'leave' && <TextButton onClick={() => onEdit(r.raw)}>Editar</TextButton>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ═══ Saldos ═══════════════════════════════════════════════════════════════════

const SALDO_SORTS = [
  { id: 'name',     label: 'Nombre' },
  { id: 'vacation', label: 'Vacaciones' },
  { id: 'hours',    label: 'Horas libres' },
  { id: 'home',     label: 'Días home' },
]

export function TabSaldos({ users, onUsersChanged }) {
  const [accrual, setAccrual] = useState(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('name')
  const [adjust, setAdjust] = useState(null)   // { user, bank: 'vacaciones' | 'horas_libres' | 'dias_home' }

  // Solo admin puede leer la config; si falla, el banner simplemente no se muestra.
  useEffect(() => {
    api.get('/projects/settings')
      .then(({ data }) => setAccrual({ enabled: !!data.vacationAccrualEnabled, days: data.vacationAccrualDays, intervalMonths: data.vacationAccrualIntervalMonths }))
      .catch(() => setAccrual(null))
  }, [])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const cmp = {
      name: (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
      vacation: (a, b) => (b.vacationDays ?? 0) - (a.vacationDays ?? 0),
      hours: (a, b) => (b.freeHoursBalance ?? 0) - (a.freeHoursBalance ?? 0),
      home: (a, b) => (b.homeDaysBalance ?? 0) - (a.homeDaysBalance ?? 0),
    }[sort]
    return users.filter(u => !q || u.name.toLowerCase().includes(q)).sort(cmp)
  }, [users, query, sort])

  const totals = users.reduce((t, u) => ({
    vacation: t.vacation + (u.vacationDays ?? 0), hours: t.hours + (u.freeHoursBalance ?? 0), home: t.home + (u.homeDaysBalance ?? 0),
  }), { vacation: 0, hours: 0, home: 0 })

  function done() { setAdjust(null); onUsersChanged?.() }

  return (
    <div className="space-y-3">
      {accrual && (
        <p className={`rounded-xl border px-4 py-3 text-sm ${accrual.enabled
          ? 'border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 text-primary-800 dark:text-primary-300'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
          {accrual.enabled
            ? <>Las vacaciones suman <strong>{fmtNum(accrual.days)} {accrual.days === 1 ? 'día' : 'días'}</strong> cada <strong>{INTERVAL_LABELS[accrual.intervalMonths] ?? `${accrual.intervalMonths} meses`}</strong> en el aniversario de ingreso de cada persona.</>
            : <>Las vacaciones no se acumulan solas. Se puede activar en Preferencias → Módulos → RRHH.</>}
        </p>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar persona" aria-label="Buscar persona"
          className="flex-1 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="whitespace-nowrap">Ordenar por</span>
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
            {SALDO_SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <Card className="overflow-hidden">
        <div className="hidden sm:grid grid-cols-[minmax(0,2fr)_1fr_1fr_1fr] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
          <span>Persona</span><span className="text-right">Vacaciones</span><span className="text-right">Horas libres</span><span className="text-right">Días home</span>
        </div>
        {list.length === 0 ? <EmptyNote><span className="block pt-4">Nadie coincide con la búsqueda.</span></EmptyNote> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {list.map(u => (
              <li key={u.id} className="px-4 py-3 sm:grid sm:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr] sm:gap-3 sm:items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar user={u} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{u.name}</p>
                    <RoleBadge role={u.role} userId={u.id} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 sm:contents">
                  <Balance value={u.vacationDays ?? 0} unit="días" negative={(u.vacationDays ?? 0) < 0} onAdjust={() => setAdjust({ user: u, bank: 'vacaciones' })} label="Vacaciones" />
                  <Balance value={fmtNum(u.freeHoursBalance ?? 0)} unit="h" onAdjust={() => setAdjust({ user: u, bank: 'horas_libres' })} label="Horas libres" />
                  <Balance value={u.homeDaysBalance ?? 0} unit="días" onAdjust={() => setAdjust({ user: u, bank: 'dias_home' })} label="Días home" />
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="hidden sm:grid grid-cols-[minmax(0,2fr)_1fr_1fr_1fr] gap-3 px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
          <span>Total del equipo</span>
          <span className="text-right tabular-nums">{totals.vacation} días</span>
          <span className="text-right tabular-nums">{fmtNum(totals.hours)} h</span>
          <span className="text-right tabular-nums">{totals.home} días</span>
        </div>
      </Card>

      {adjust?.bank === 'vacaciones' && <VacationEditModal user={adjust.user} onClose={() => setAdjust(null)} onUpdated={done} />}
      {adjust && adjust.bank !== 'vacaciones' && (
        <AdjustModal bank={adjust.bank}
          user={{ userId: adjust.user.id, user: { name: adjust.user.name }, balance: adjust.user[BENEFIT_BANKS[adjust.bank].balanceField] ?? 0 }}
          onClose={() => setAdjust(null)} onUpdated={done} />
      )}
    </div>
  )
}

function Balance({ value, unit, negative, onAdjust, label }) {
  return (
    <div className="sm:text-right rounded-lg sm:rounded-none bg-gray-50 dark:bg-gray-900/30 sm:bg-transparent sm:dark:bg-transparent px-2.5 py-2 sm:p-0">
      <p className="text-[11px] text-gray-400 dark:text-gray-500 sm:hidden">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${negative ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
        {value} <span className="text-xs font-normal text-gray-400">{unit}</span>
      </p>
      <button type="button" onClick={onAdjust} aria-label={`Ajustar ${label.toLowerCase()}`}
        className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">Ajustar</button>
    </div>
  )
}
