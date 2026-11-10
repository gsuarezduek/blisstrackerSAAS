import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import api from '../../api/client'
import { Card, CardHeader, TextButton, Avatar, EmptyNote } from '../project-detail/ui'
import { useWorkspace } from '../../context/WorkspaceContext'
import { AbsenceGrid, Legend, LoadError, Skeleton, MONTHS, useAllRequests } from './ausencias'
import { PersonLogins } from './ingresos'
import { todayStr, minsToTime } from './shared'
import { matchesSearch } from '../../utils/textSearch'

// ─── Vista "Quién está" de RRHH → Tiempo y asistencia ─────────────────────────
// Fusiona las dos pestañas que respondían la misma pregunta con dos fuentes
// distintas (Ausencias → Calendario y Asistencia → Ingresos): arriba quién falta
// y cuándo, abajo cuánto estuvo cada uno. Las dos miran el MISMO mes y el MISMO
// conjunto de personas (el que dejan los chips de filtro), que es lo que antes no
// pasaba — se comparaba un calendario de noviembre contra un rango libre.
//
// Los números de la tabla y del resumen salen de `GET /admin/rrhh/attendance`,
// que reusa el `getAttendanceStats` de Productividad. No se recalculan acá a
// propósito: tardanzas y ausencias dependen de la regla de "días laborables"
// (>50% del equipo logueado) que el browser no puede reproducir sin bajarse los
// logins de todo el equipo, y dos definiciones del mismo número en la misma
// pantalla es exactamente lo que esta fusión viene a resolver.

const PEOPLE_FILTERS = [
  { id: 'all',        label: 'Todo' },
  { id: 'vacaciones', label: 'Vacaciones' },
  { id: 'licencias',  label: 'Licencias' },
  { id: 'tarde',      label: 'Llegadas tarde' },
  { id: 'ausencias',  label: 'Ausencias sin aviso' },
]

const fmtNum = n => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })
const monthStr = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`

// Recorta el equipo según el chip activo. Pura (exportada para tests).
// `leaves`/`benefits` son las solicitudes del workspace; `statsById`, las filas de
// asistencia del mes. Un chip vacío no esconde la pantalla: devuelve lista vacía y
// la vista muestra su propio texto.
export function filterPeopleByTime(users, { filter = 'all', query = '', leaves = [], statsById = {}, from, to } = {}) {
  const q = query.trim().toLowerCase()
  const overlapsMonth = r => r.status !== 'rejected' && r.endDate >= from && r.startDate <= to
  const leaveUserIds = (pred) => new Set(leaves.filter(r => overlapsMonth(r) && pred(r)).map(r => r.user?.id))

  let pass = () => true
  if (filter === 'vacaciones') {
    const ids = leaveUserIds(r => r.type === 'vacaciones')
    pass = u => ids.has(u.id)
  } else if (filter === 'licencias') {
    const ids = leaveUserIds(r => r.type !== 'vacaciones')
    pass = u => ids.has(u.id)
  } else if (filter === 'tarde') {
    pass = u => (statsById[u.id]?.lateDays ?? 0) > 0
  } else if (filter === 'ausencias') {
    pass = u => (statsById[u.id]?.absentDays ?? 0) > 0
  }
  return users.filter(u => pass(u) && (!q || matchesSearch(u.name, q)))
}

// Días home aprobados que caen en el mes, por persona (el saldo vive en Saldos;
// acá interesa lo CONSUMIDO en el mes que se está mirando).
export function homeDaysTakenByUser(benefits = [], from, to) {
  const map = {}
  for (const r of benefits) {
    if (r.bank !== 'dias_home' || r.status !== 'approved') continue
    if (!r.date || r.date < from || r.date > to) continue
    map[r.user?.id] = (map[r.user?.id] ?? 0) + (r.amount ?? 1)
  }
  return map
}

export function TabQuienEsta({ users, onOpenPerson }) {
  const { workspace } = useWorkspace()
  const attendanceEnabled = workspace?.attendanceTrackingEnabled !== false
  const today = todayStr()

  const [req, reloadRequests] = useAllRequests()
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [onlyAway, setOnlyAway] = useState(true)
  const [expanded, setExpanded] = useState(null)   // userId con el detalle de ingresos abierto

  const [att, setAtt] = useState({ rows: [], summary: null, range: null, loading: true, error: false })
  const [logins, setLogins] = useState({ rows: [], loading: false })

  const month = monthStr(ym.y, ym.m)
  const isCurrent = month === today.slice(0, 7)

  const loadAttendance = useCallback(() => {
    setAtt(a => ({ ...a, loading: true, error: false }))
    api.get('/admin/rrhh/attendance', { params: { month } })
      .then(({ data }) => setAtt({ rows: data.rows, summary: data.summary, range: data.range, loading: false, error: false }))
      .catch(() => setAtt({ rows: [], summary: null, range: null, loading: false, error: true }))
  }, [month])

  useEffect(() => { loadAttendance() }, [loadAttendance])

  // Los ingresos del mes se piden UNA vez por mes y alimentan el detalle de
  // cualquier persona que se expanda — no una request por fila.
  const from = att.range?.from, to = att.range?.to
  const loadLogins = useCallback(() => {
    if (!from || !to) return
    setLogins(l => ({ ...l, loading: true }))
    api.get('/admin/rrhh/logins', { params: { from, to } })
      .then(({ data }) => setLogins({ rows: data, loading: false }))
      .catch(() => setLogins({ rows: [], loading: false }))
  }, [from, to])

  useEffect(() => { setExpanded(null); loadLogins() }, [loadLogins])

  const statsById = useMemo(() => Object.fromEntries(att.rows.map(r => [r.userId, r])), [att.rows])
  const range = att.range ?? { from: `${month}-01`, to: `${month}-31` }

  const people = useMemo(
    () => filterPeopleByTime(users, { filter, query, leaves: req.leaves, statsById, from: range.from, to: range.to }),
    [users, filter, query, req.leaves, statsById, range.from, range.to],
  )
  const homeTaken = useMemo(() => homeDaysTakenByUser(req.benefits, range.from, range.to), [req.benefits, range.from, range.to])
  const loginsByUser = useMemo(() => {
    const m = {}
    for (const l of logins.rows) (m[l.userId] ||= []).push(l)
    return m
  }, [logins.rows])

  const pendingCount = req.loading ? null : [...req.leaves, ...req.benefits].filter(r => r.status === 'pending').length

  function shift(delta) {
    setYm(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  if (req.error) return <LoadError onRetry={reloadRequests} />

  return (
    <div className="space-y-4">
      {/* Mes + chips de filtro + buscador */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => shift(-1)} aria-label="Mes anterior"
            className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">‹</button>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white capitalize w-36 text-center">{MONTHS[ym.m]} {ym.y}</h3>
          <button type="button" onClick={() => shift(1)} aria-label="Mes siguiente"
            className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">›</button>
          {!isCurrent && <TextButton className="ml-1" onClick={() => setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })}>Hoy</TextButton>}
        </div>
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none flex-1">
          <div className="flex gap-1.5 min-w-max">
            {PEOPLE_FILTERS.map(f => (
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
          className="lg:w-52 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_18rem] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {/* Quién está y quién no */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap px-1">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Quién está y quién no · <span className="capitalize">{MONTHS[ym.m]}</span>
              </h3>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={onlyAway} onChange={e => setOnlyAway(e.target.checked)} className="accent-primary-600" />
                Solo quienes faltan
              </label>
            </div>
            <AbsenceGrid users={people} leaves={req.leaves} benefits={req.benefits}
              year={ym.y} month={ym.m} loading={req.loading} onlyAway={onlyAway} onOpenPerson={onOpenPerson} />
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400 px-1">
              <Legend cls="bg-primary-500" label="Licencia aprobada" />
              <Legend cls="bg-amber-200 dark:bg-amber-700/60" label="Licencia pendiente" />
              <Legend cls="bg-sky-400" label="Día home" />
              <Legend cls="bg-violet-400" label="Horas libres" />
            </div>
          </section>

          {/* Asistencia del mes */}
          <AttendanceTable
            people={people} statsById={statsById} homeTaken={homeTaken}
            monthLabel={MONTHS[ym.m]} attendanceEnabled={attendanceEnabled}
            loading={att.loading} error={att.error} onRetry={loadAttendance}
            expanded={expanded} onToggle={uid => setExpanded(e => (e === uid ? null : uid))}
            loginsByUser={loginsByUser} loginsLoading={logins.loading}
            onLoginsChanged={() => { loadAttendance(); loadLogins() }}
          />
        </div>

        <aside className="space-y-3">
          <Card>
            <CardHeader title="Solicitudes pendientes" count={pendingCount} />
            <div className="px-4 pb-4">
              {pendingCount === 0
                ? <p className="text-sm text-gray-500 dark:text-gray-400">No hay licencias ni beneficios esperando aprobación.</p>
                : <p className="text-sm text-gray-500 dark:text-gray-400">
                    {pendingCount === null ? 'Cargando…' : `${pendingCount} ${pendingCount === 1 ? 'solicitud espera' : 'solicitudes esperan'} una decisión. Se resuelven en Hoy o en Solicitudes.`}
                  </p>}
            </div>
          </Card>

          <MonthSummary summary={att.summary} loading={att.loading} monthLabel={MONTHS[ym.m]} attendanceEnabled={attendanceEnabled} />
        </aside>
      </div>
    </div>
  )
}

// ═══ Tabla de asistencia del mes ══════════════════════════════════════════════

function AttendanceTable({
  people, statsById, homeTaken, monthLabel, attendanceEnabled, loading, error, onRetry,
  expanded, onToggle, loginsByUser, loginsLoading, onLoginsChanged,
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Asistencia de <span className="capitalize">{monthLabel}</span>
        </h3>
        <span className="text-xs text-gray-400 dark:text-gray-500">solo días laborales</span>
      </div>

      <Card className="overflow-hidden">
        {error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">No pudimos cargar la asistencia del mes.</p>
            <TextButton className="mt-2" onClick={onRetry}>Reintentar</TextButton>
          </div>
        ) : loading ? (
          <div className="p-4"><Skeleton rows={5} /></div>
        ) : people.length === 0 ? (
          <EmptyNote><span className="block py-6 text-center">Nadie coincide con el filtro.</span></EmptyNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[46rem]">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-4 py-2.5 font-semibold">Persona</th>
                  {attendanceEnabled && <th className="text-right px-3 py-2.5 font-semibold">Ingreso prom.</th>}
                  {attendanceEnabled && <th className="text-right px-3 py-2.5 font-semibold">Llegadas tarde</th>}
                  <th className="text-right px-3 py-2.5 font-semibold">Ausencias</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Licencias</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Vacaciones rest.</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Días home</th>
                  {attendanceEnabled && <th className="text-right px-4 py-2.5 font-semibold">Horas disp.</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {people.map(u => {
                  const s = statsById[u.id] ?? {}
                  const open = expanded === u.id
                  const cols = 6 + (attendanceEnabled ? 3 : 0)
                  return (
                    <Fragment key={u.id}>
                      <tr onClick={() => onToggle(u.id)}
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar user={u} size="xs" />
                            <span className="text-sm text-gray-900 dark:text-white truncate">{u.name}</span>
                          </div>
                        </td>
                        {attendanceEnabled && (
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {s.avgArrivalMins != null ? minsToTime(s.avgArrivalMins) : '—'}
                          </td>
                        )}
                        {attendanceEnabled && (
                          <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${s.lateDays > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                            {s.lateDays == null ? '—' : s.lateDays}
                          </td>
                        )}
                        <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${s.absentDays > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}>
                          {s.absentDays ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 dark:text-gray-400">{s.leaveDays ?? '—'}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${(u.vacationDays ?? 0) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                          {u.vacationDays ?? 0}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 dark:text-gray-400">{homeTaken[u.id] ?? 0}</td>
                        {attendanceEnabled && (
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-500 dark:text-gray-400">
                            {s.availableHours != null ? `${fmtNum(s.availableHours)} h` : '—'}
                          </td>
                        )}
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={cols} className="bg-gray-50 dark:bg-gray-900/30 px-4 py-3">
                            <PersonLogins
                              user={u} logins={loginsByUser[u.id] ?? []} loading={loginsLoading}
                              onChanged={onLoginsChanged} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
        Ausencias = días laborables esperados sin licencia en los que no hubo actividad. Clic en una persona para ver y corregir sus ingresos del mes.
      </p>
    </section>
  )
}

// ═══ Resumen del mes ══════════════════════════════════════════════════════════

function MonthSummary({ summary, loading, monthLabel, attendanceEnabled }) {
  const rows = [
    attendanceEnabled && { label: 'Puntualidad', value: summary?.punctualityPct != null ? `${summary.punctualityPct}%` : '—' },
    attendanceEnabled && { label: 'Llegadas tarde', value: summary ? `${summary.lateDays} de ${summary.arrivalDays}` : '—' },
    { label: 'Días de licencia', value: summary?.leaveDays ?? '—' },
    { label: 'Ausencias sin aviso', value: summary?.absentDays ?? '—' },
  ].filter(Boolean)

  return (
    <Card>
      <CardHeader title={`Resumen de ${monthLabel}`} />
      <ul className="px-4 pb-4 space-y-2">
        {rows.map(r => (
          <li key={r.label} className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-300">{r.label}</span>
            <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{loading ? '…' : r.value}</span>
          </li>
        ))}
      </ul>
      {attendanceEnabled && summary?.membersWithSchedule === 0 && (
        <p className="px-4 pb-4 text-xs text-gray-400 dark:text-gray-500">
          Nadie tiene horario cargado, así que no se puede medir puntualidad. Se carga en Admin → Equipo.
        </p>
      )}
    </Card>
  )
}
