import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import useMembers from '../hooks/useMembers'
import WeekTimeGrid from '../components/calendar/WeekTimeGrid'
import CalendarMonthView from '../components/calendar/CalendarMonthView'
import PeoplePicker from '../components/calendar/PeoplePicker'
import PersonSearchSelect from '../components/calendar/PersonSearchSelect'
import ScheduleEventModal from '../components/calendar/ScheduleEventModal'
import EventDetailModal from '../components/calendar/EventDetailModal'
import { todayYMD, shiftDay, weekDates, weekdayLabel, weekRangeLabel } from '../components/calendar/dateHelpers'
import { useCalendarSocket } from '../components/calendar/useCalendarSocket'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import GoogleCalendarConnectButton from '../components/calendar/GoogleCalendarConnectButton'

const VIEWS = [
  { id: 'semana', label: '🗓️ Semana' },
  { id: 'equipo', label: '👥 Equipo' },
  { id: 'mes',    label: '📅 Mes' },
]
const VALID_VIEWS = new Set(VIEWS.map(v => v.id))
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// "YYYY-MM-DD" → mes que lo contiene, en formato "YYYY-MM" (para la vista Mes).
function monthOf(dateStr) {
  return dateStr.slice(0, 7)
}
function monthBounds(month) {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` }
}

export default function Calendario() {
  const { user } = useAuth()
  const { enabled, loading: flagLoading } = useFeatureFlag('calendario')
  const moduleAllowed = enabled && !!user?.moduleAccess?.calendario
  const { byId: memberById } = useMembers()
  const [searchParams, setSearchParams] = useSearchParams()

  const rawView = searchParams.get('view')
  const view = VALID_VIEWS.has(rawView) ? rawView : 'semana'

  const rawDate = searchParams.get('date')
  const date = DATE_RE.test(rawDate || '') ? rawDate : todayYMD()

  const peopleIds = useMemo(() => {
    const raw = searchParams.get('people')
    if (!raw) return []
    return [...new Set(raw.split(',').map(Number).filter(n => Number.isInteger(n) && n > 0 && n !== user?.id))]
  }, [searchParams, user?.id])

  // Vista "semana": de quién estoy viendo el calendario — null = el mío.
  const rawPerson = searchParams.get('person')
  const personId = rawPerson && Number.isInteger(Number(rawPerson)) && Number(rawPerson) !== user?.id ? Number(rawPerson) : null
  const targetUserId = personId || user.id
  const viewingOther = view === 'semana' && personId != null

  function updateParams(next) {
    const params = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === undefined || v === '') params.delete(k)
      else params.set(k, v)
    }
    setSearchParams(params, { replace: true })
  }

  const [events, setEvents] = useState([])        // eventos donde soy organizador/participante, del rango visible
  const [availability, setAvailability] = useState({}) // { [userId]: {workStart, workEnd, fullDayOff, blocks} }
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [scheduleModal, setScheduleModal] = useState(null) // null | { date?, startTime?, participantIds? }
  const [detailEvent, setDetailEvent] = useState(null)

  const range = useMemo(() => {
    if (view === 'mes') return monthBounds(monthOf(date))
    if (view === 'equipo') return { from: date, to: date }
    const week = weekDates(date)
    return { from: week[0], to: week[6] }
  }, [view, date])

  const availabilityUserIds = useMemo(() => {
    if (view === 'equipo') return [user.id, ...peopleIds]
    if (view === 'semana') return [targetUserId]
    return [user.id]
  }, [view, peopleIds, user.id, targetUserId])

  const load = useCallback(async () => {
    if (!moduleAllowed) return
    setLoading(true)
    setLoadError('')
    try {
      const [eventsRes, availRes] = await Promise.all([
        api.get('/calendar/events', { params: range }),
        view !== 'mes'
          ? api.get('/calendar/availability', { params: { ...range, userIds: availabilityUserIds.join(',') } })
          : Promise.resolve({ data: {} }),
      ])
      setEvents(eventsRes.data)
      setAvailability(availRes.data)
    } catch (e) {
      setLoadError(e.response?.data?.error || 'No se pudo cargar el calendario.')
    } finally {
      setLoading(false)
    }
  }, [moduleAllowed, range.from, range.to, availabilityUserIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])
  useCalendarSocket(load)

  const eventsById = useMemo(() => {
    const map = new Map()
    for (const e of events) map.set(e.id, e)
    return map
  }, [events])

  // La mayoría de los clicks resuelven contra `events` (mis reuniones, ya
  // cargadas). Para una reunión ajena (visible en el calendario de otra
  // persona pero donde no participo) no está en esa lista — se pide su
  // detalle completo al backend, que ahora lo expone a cualquier miembro del
  // workspace (ver getEvent en calendar.controller.js).
  async function openEventById(id) {
    const ev = eventsById.get(id)
    if (ev) { setDetailEvent(ev); return }
    try {
      const res = await api.get(`/calendar/events/${id}`)
      setDetailEvent(res.data)
    } catch {
      // el evento pudo haberse cancelado justo antes del click; no hacemos nada
    }
  }

  function shiftView(delta) {
    if (view === 'equipo') updateParams({ date: shiftDay(date, delta) })
    else updateParams({ date: shiftDay(date, delta * 7) })
  }

  function goToday() {
    updateParams({ date: todayYMD() })
  }

  // ── Bloques para WeekTimeGrid ──────────────────────────────────────────────
  function blocksFor(key, onlyDate) {
    const state = availability[key]
    if (!state) return []
    return state.blocks
      .filter(b => b.date === onlyDate)
      .map(b => ({
        id: `${b.kind}-${b.refId ?? `${b.date}${b.start}`}`,
        start: b.start,
        end: b.end,
        title: (b.recurrenceId ? '🔁 ' : '') + (b.title || (b.kind === 'task' ? 'Tarea' : 'Ocupado')),
        tentative: b.tentative,
        tone: b.kind === 'task' ? 'task' : 'event',
        onClick: b.kind === 'calendar_event' && b.refId ? () => openEventById(b.refId) : undefined,
      }))
  }

  // ── Rango horario de la grilla: recortado al horario laboral real ──────────
  // Por defecto WeekTimeGrid mostraría 7–22, y la mayor parte de esa franja no
  // la trabaja nadie. Acá se calcula el rango efectivo a partir del horario
  // laboral configurado (WorkspaceMember.workStartTime/workEndTime) de las
  // columnas visibles + cualquier bloque real que caiga fuera de ese horario
  // (para no recortar una reunión agendada fuera de hora) — con un margen de 1h
  // a cada lado. Sin horarios configurados ni bloques fuera de rango, cae a un
  // 9–18 razonable en vez de 7–22.
  function hourFloor(hhmm) { return Number(hhmm.slice(0, 2)) }
  function hourCeil(hhmm) {
    const [h, m] = hhmm.split(':').map(Number)
    return m > 0 ? h + 1 : h
  }
  function computeHourRange(keys) {
    let min = null, max = null
    for (const key of keys) {
      const state = availability[key]
      if (!state) continue
      if (state.workStart) min = min === null ? hourFloor(state.workStart) : Math.min(min, hourFloor(state.workStart))
      if (state.workEnd)   max = max === null ? hourCeil(state.workEnd)   : Math.max(max, hourCeil(state.workEnd))
      for (const b of state.blocks || []) {
        min = min === null ? hourFloor(b.start) : Math.min(min, hourFloor(b.start))
        max = max === null ? hourCeil(b.end)   : Math.max(max, hourCeil(b.end))
      }
    }
    if (min === null || max === null || max <= min) return { startHour: 9, endHour: 18 }
    const startHour = Math.max(0, min - 1)
    const endHour = Math.min(24, Math.max(max + 1, startHour + 6)) // franja mínima de 6h para que no quede aplastada
    return { startHour, endHour }
  }
  const weekHourRange = useMemo(() => computeHourRange([targetUserId]), [availability, targetUserId]) // eslint-disable-line react-hooks/exhaustive-deps
  const teamHourRange = useMemo(() => computeHourRange([user.id, ...peopleIds]), [availability, user.id, peopleIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const weekColumns = useMemo(() => weekDates(date).map(d => ({ key: d, label: weekdayLabel(d) })), [date])
  const teamColumns = useMemo(() => (
    [user.id, ...peopleIds].map(uid => ({
      key: uid,
      label: uid === user.id ? 'Vos' : (memberById.get(uid)?.name || `#${uid}`),
    }))
  ), [user.id, peopleIds, memberById])

  if (flagLoading) return <LoadingSpinner size="lg" fullPage />

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Calendario</h1>
          {moduleAllowed && (
            <div className="flex items-center gap-2">
              <GoogleCalendarConnectButton />
              <button
                onClick={() => setScheduleModal(viewingOther ? { participantIds: [targetUserId] } : {})}
                className="bg-primary-600 hover:bg-primary-700 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors"
              >
                + Agendar reunión
              </button>
            </div>
          )}
        </div>

        {!moduleAllowed ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Sección no disponible</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
              {enabled
                ? 'No tenés acceso a esta sección. Consultá con un administrador.'
                : 'Esta sección está siendo activada gradualmente. Si querés acceso anticipado, contactá al equipo de BlissTracker.'}
            </p>
          </div>
        ) : (
        <>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1">
            {VIEWS.map(v => (
              <button
                key={v.id}
                onClick={() => updateParams({ view: v.id })}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  view === v.id
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {view !== 'mes' && (
            <div className="flex items-center gap-2">
              {view === 'semana' && (
                <PersonSearchSelect
                  value={personId}
                  onChange={id => updateParams({ person: id ?? null })}
                />
              )}
              <div className="flex items-center gap-1">
                <button onClick={() => shiftView(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">‹</button>
                <button onClick={goToday} className="px-3 py-1.5 text-xs font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">Hoy</button>
                <button onClick={() => shiftView(1)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">›</button>
                <span className="text-sm text-gray-600 dark:text-gray-300 ml-2 capitalize">
                  {viewingOther && `${memberById.get(targetUserId)?.name || 'Persona'} · `}
                  {view === 'equipo' ? weekdayLabel(date) : weekRangeLabel(date)}
                </span>
              </div>
            </div>
          )}
        </div>

        {viewingOther && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 -mt-2">
            Clickeá un hueco libre, o "+ Agendar reunión" arriba, para proponerle una reunión.
          </p>
        )}

        {view === 'equipo' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Comparar disponibilidad con</p>
            <PeoplePicker
              value={peopleIds}
              onChange={ids => updateParams({ people: ids.join(',') || null })}
              excludeIds={user ? [user.id] : []}
            />
          </div>
        )}

        {loading && <LoadingSpinner />}

        {!loading && loadError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400 mb-4">
            {loadError}
          </div>
        )}

        {!loading && !loadError && view === 'mes' && (
          <CalendarMonthView
            events={events}
            month={monthOf(date)}
            onMonthChange={m => updateParams({ date: `${m}-01` })}
            onOpenEvent={setDetailEvent}
            onOpenDay={d => updateParams({ view: 'semana', date: d })}
          />
        )}

        {!loading && !loadError && view === 'semana' && (
          <WeekTimeGrid
            columns={weekColumns}
            startHour={weekHourRange.startHour}
            endHour={weekHourRange.endHour}
            getBlocks={colDate => blocksFor(targetUserId, colDate)}
            getWorkWindow={() => {
              const s = availability[targetUserId]
              return s?.workStart && s?.workEnd ? { start: s.workStart, end: s.workEnd } : null
            }}
            isFullDayOff={key => availability[targetUserId]?.fullDayOff?.includes(key)}
            onSlotClick={(dateKey, time) => setScheduleModal({
              date: dateKey, startTime: time,
              ...(viewingOther ? { participantIds: [targetUserId] } : {}),
            })}
          />
        )}

        {!loading && !loadError && view === 'equipo' && (
          <WeekTimeGrid
            columns={teamColumns}
            startHour={teamHourRange.startHour}
            endHour={teamHourRange.endHour}
            getBlocks={uid => blocksFor(uid, date)}
            getWorkWindow={uid => {
              const s = availability[uid]
              return s?.workStart && s?.workEnd ? { start: s.workStart, end: s.workEnd } : null
            }}
            isFullDayOff={uid => availability[uid]?.fullDayOff?.includes(date)}
            onSlotClick={(_uid, time) => setScheduleModal({ date, startTime: time, participantIds: peopleIds })}
          />
        )}

        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3">
          Franjas punteadas = invitación sin responder (no cuenta como ocupado para buscar huecos). Zona gris = fuera del horario laboral.
        </p>
        </>
        )}
      </div>

      <ScheduleEventModal
        open={!!scheduleModal}
        initial={scheduleModal}
        onClose={() => setScheduleModal(null)}
        onCreated={() => load()}
      />
      <EventDetailModal
        event={detailEvent}
        onClose={() => setDetailEvent(null)}
        onChanged={ev => { setDetailEvent(ev); load() }}
        onDeleted={() => { setDetailEvent(null); load() }}
        onStarted={() => { setDetailEvent(null); load() }}
      />
    </div>
  )
}
