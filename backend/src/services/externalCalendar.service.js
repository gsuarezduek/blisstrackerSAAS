const axios = require('axios')
const ical = require('node-ical')
const prisma = require('../lib/prisma')
const { decrypt } = require('../lib/encryption')
const { assertPublicUrl } = require('../lib/safeUrl')
const { getValidAccessToken } = require('./googleCalendarToken.service')
const { addDaysYMD } = require('./recurrence.service')
const { todayString, DEFAULT_TZ } = require('../utils/dates')
const { mapGoogleEvent, mapIcsEvent, dedupeExternalRows } = require('../lib/externalCalendar')

// Trae a BlissTracker los calendarios de afuera (ver modelo ExternalCalendar) y
// mantiene el cache de ExternalCalendarEvent. El camino inverso al push de
// googleCalendarSync.service.js, y como ese: best-effort, nunca rompe lo que el
// usuario vino a hacer — si Google no responde o el ICS está caído, se sigue
// mostrando lo último que se trajo y el error queda en `lastSyncError`.

const CAL_BASE = 'https://www.googleapis.com/calendar/v3'

// Ventana que se sincroniza SIEMPRE, sin importar qué rango esté mirando el
// usuario: el cache tiene que servirle igual a la vista Semana, a la Mes y a la
// tarjeta de hoy del Dashboard, y a getBusyBlocks pidiendo el de otra persona.
// Más allá de esto no se trae nada (las vistas reales no van tan lejos).
const SYNC_PAST_DAYS = 30
const SYNC_AHEAD_DAYS = 90

// Cada cuánto vale volver a preguntar. El ICS de Google se regenera con horas de
// atraso, así que pedirlo cada 10 minutos sería tráfico sin datos nuevos.
const STALE_MINS = { google: 10, ics: 60 }

// Tope de filas por calendario y ventana: una agenda con miles de eventos en 97
// días es casi siempre un calendario institucional pegado por error (un feriario,
// el fixture de un torneo), y lo que importa es que no haga lenta la grilla ni la
// query de disponibilidad de todo el workspace.
const MAX_EVENTS_PER_CALENDAR = 2000

// Cuánto se espera a la fuente cuando alguien está mirando la pantalla. El fetch
// sigue corriendo si se pasa de acá: lo que se descarta es la ESPERA, no el
// refresco — su resultado queda cacheado para el próximo render.
const INTERACTIVE_DEADLINE_MS = 8000

const ICS_MAX_BYTES = 5 * 1024 * 1024
const ICS_TIMEOUT_MS = 15000
const GOOGLE_PAGE_SIZE = 250
const GOOGLE_MAX_PAGES = 8

function syncWindow(tz) {
  const today = todayString(tz)
  return { from: addDaysYMD(today, -SYNC_PAST_DAYS), to: addDaysYMD(today, SYNC_AHEAD_DAYS) }
}

function isStale(cal) {
  if (!cal.lastSyncAt) return true
  const mins = STALE_MINS[cal.source] ?? 30
  return Date.now() - cal.lastSyncAt.getTime() > mins * 60 * 1000
}

// ─── Fuente: Google Calendar (la conexión OAuth que ya existe) ────────────────

// El scope `calendar.events` de GoogleCalendarConnection ya es de lectura y
// escritura, así que traer los eventos no necesita consentimiento nuevo. Se pide
// con singleEvents=true: Google expande las series por nosotros y así no hay que
// interpretar RRULE.
async function fetchGoogleEvents(cal, { from, to, tz }) {
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { userId_workspaceId: { userId: cal.userId, workspaceId: cal.workspaceId } },
  })
  if (!connection) throw new Error('No hay una cuenta de Google conectada')
  const accessToken = await getValidAccessToken(connection)

  const calendarId = encodeURIComponent(cal.googleCalendarId || 'primary')
  const rows = []
  let pageToken

  for (let page = 0; page < GOOGLE_MAX_PAGES; page++) {
    const res = await axios.get(`${CAL_BASE}/calendars/${calendarId}/events`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        timeMin: new Date(`${from}T00:00:00Z`).toISOString(),
        timeMax: new Date(`${addDaysYMD(to, 1)}T00:00:00Z`).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: GOOGLE_PAGE_SIZE,
        showDeleted: false,
        ...(pageToken ? { pageToken } : {}),
      },
      timeout: 20000,
    })
    for (const ev of res.data?.items || []) {
      const row = mapGoogleEvent(ev, tz)
      if (row) rows.push(row)
    }
    pageToken = res.data?.nextPageToken
    if (!pageToken) break
  }
  return rows
}

// ─── Fuente: una URL iCal pegada a mano ──────────────────────────────────────

async function fetchIcsText(rawUrl) {
  // assertPublicUrl corre acá y no solo al guardar la URL: un DNS puede cambiar de
  // IP en el medio (SSRF por rebinding) — mismo criterio que el webhook de agentes.
  await assertPublicUrl(rawUrl)
  const res = await axios.get(rawUrl, {
    responseType: 'text',
    timeout: ICS_TIMEOUT_MS,
    maxContentLength: ICS_MAX_BYTES,
    maxRedirects: 3,
    transformResponse: [d => d],
    headers: { Accept: 'text/calendar, text/plain, */*' },
  })
  const text = String(res.data || '')
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    throw new Error('La URL no devolvió un calendario iCal (no aparece BEGIN:VCALENDAR)')
  }
  return text
}

async function fetchIcsEvents(cal, { from, to, tz }) {
  if (!cal.icsUrl) throw new Error('El calendario no tiene URL guardada')
  const text = await fetchIcsText(decrypt(cal.icsUrl))
  const parsed = ical.parseICS(text)
  const rows = []
  for (const value of Object.values(parsed)) {
    rows.push(...mapIcsEvent(value, { tz, from, to }))
  }
  return rows
}

/**
 * Prueba una URL iCal sin guardar nada: la baja, la parsea y devuelve el nombre que
 * declara el archivo (`X-WR-CALNAME`) + cuántos eventos trae. Es lo que deja que el
 * alta falle en el momento, con un error que se entiende, en vez de crear un
 * calendario que después no sincroniza nunca.
 */
async function probeIcsUrl(url, { tz = DEFAULT_TZ } = {}) {
  const text = await fetchIcsText(url)
  const parsed = ical.parseICS(text)
  const { from, to } = syncWindow(tz)
  let events = 0
  for (const value of Object.values(parsed)) events += mapIcsEvent(value, { tz, from, to }).length
  const nameMatch = text.match(/^X-WR-CALNAME:(.+)$/im)
  return { name: nameMatch ? nameMatch[1].trim().slice(0, 120) : null, events }
}

// ─── Sincronización ───────────────────────────────────────────────────────────

/**
 * Los eventos que NOSOTROS empujamos a Google vuelven en su respuesta — sin este
 * filtro cada reunión agendada acá se vería dos veces: la propia y su espejo
 * "externo". `CalendarEvent.googleEventId` es el id que Google devolvió al crearla.
 *
 * Mira TODO el workspace y no solo lo que organizó el dueño del calendario: cuando
 * una reunión se empuja, los demás participantes viajan como `attendees`, así que
 * Google la pone también en el calendario de cada invitado — y con el MISMO id, que
 * es lo que hace que comparar por id alcance. Filtrar por organizador dejaba ver
 * doble exactamente a los invitados, que son la mayoría de los participantes de
 * cualquier reunión. Acotado al rango que se está sincronizando, que es lo único
 * que puede aparecer en la respuesta.
 */
async function ownPushedGoogleIds(workspaceId, { from, to }) {
  const rows = await prisma.calendarEvent.findMany({
    where: { workspaceId, googleEventId: { not: null }, date: { gte: from, lte: to } },
    select: { googleEventId: true },
  })
  return new Set(rows.map(r => r.googleEventId))
}

/**
 * Trae el calendario y **reemplaza entero** su cache: borra todas sus filas y
 * escribe la ventana recién traída.
 *
 * Borrar todo en vez de diffear por `externalId` resuelve de una los eventos
 * cancelados o movidos del lado de la fuente. Y borrar TODO en vez de solo el rango
 * que se vuelve a traer evita dos problemas que no se arreglan solos: un evento que
 * arranca antes del `from` y sigue adentro volvería en la respuesta y chocaría con
 * el `@@unique`, y —peor— cualquier fila vieja que quedara fuera de la ventana no la
 * tocaría nunca nadie: ni se refresca ni se borra. Así el cache de un calendario es
 * siempre, exactamente, su ventana actual. Mirar más atrás que eso muestra las
 * reuniones de BlissTracker (que sí son historial) y no los eventos de afuera.
 */
async function syncCalendar(cal, { tz }) {
  const { from, to } = syncWindow(tz)
  try {
    const rows = cal.source === 'google'
      ? await fetchGoogleEvents(cal, { from, to, tz })
      : await fetchIcsEvents(cal, { from, to, tz })

    let keep = rows
    if (cal.source === 'google') {
      const mine = await ownPushedGoogleIds(cal.workspaceId, { from, to })
      keep = rows.filter(r => !mine.has(r.externalId))
    }
    const truncated = keep.length > MAX_EVENTS_PER_CALENDAR
    if (truncated) keep = keep.slice(0, MAX_EVENTS_PER_CALENDAR)

    await prisma.$transaction([
      prisma.externalCalendarEvent.deleteMany({ where: { calendarId: cal.id } }),
      prisma.externalCalendarEvent.createMany({
        data: keep.map(r => ({
          ...r,
          calendarId: cal.id,
          workspaceId: cal.workspaceId,
          userId: cal.userId,
        })),
        skipDuplicates: true,
      }),
      prisma.externalCalendar.update({
        where: { id: cal.id },
        data: {
          lastSyncAt: new Date(),
          // Se avisa, no se falla: el calendario igual sirve con lo que entró.
          lastSyncError: truncated ? `Este calendario tiene más de ${MAX_EVENTS_PER_CALENDAR} eventos en el rango: se muestran los primeros.` : null,
          lastSyncCount: keep.length,
        },
      }),
    ])
    return { ok: true, count: keep.length }
  } catch (err) {
    const message = err.code === 'TOKEN_EXPIRED'
      ? 'Hay que volver a conectar Google Calendar'
      : (err.response?.data?.error?.message || err.message || 'Error desconocido')
    await prisma.externalCalendar.update({
      where: { id: cal.id },
      data: { lastSyncAt: new Date(), lastSyncError: String(message).slice(0, 300) },
    }).catch(() => {})
    console.error(`[ExternalCalendar] Sync falló (cal ${cal.id}, ${cal.source}):`, message)
    return { ok: false, error: String(message) }
  }
}

/**
 * Da de alta sola la fila del calendario de Google de esa persona si ya tiene la
 * conexión OAuth hecha. Así quien conectó Google antes de que esto existiera no
 * tiene que hacer nada: la primera vez que abre el calendario, aparece.
 */
async function ensureGoogleCalendar({ workspaceId, userId }) {
  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { id: true, accountEmail: true },
  })
  if (!connection) return null
  const existing = await prisma.externalCalendar.findFirst({
    where: { workspaceId, userId, source: 'google', googleCalendarId: 'primary' },
  })
  if (existing) return existing
  try {
    return await prisma.externalCalendar.create({
      data: {
        workspaceId, userId, source: 'google', googleCalendarId: 'primary',
        name: connection.accountEmail || 'Google Calendar',
        // El de Google es la agenda propia de la persona: su título se le muestra al
        // equipo (es el mismo criterio que una reunión de BlissTracker, que ya es
        // visible para todo el workspace). Los ICS pegados a mano arrancan cerrados.
        showDetails: true,
        color: '#4285F4',
      },
    })
  } catch (err) {
    // El @@unique resuelve la carrera de dos requests en paralelo (el Calendario
    // pide eventos y disponibilidad al mismo tiempo, y las dos pasan por acá):
    // el que pierde se queda con la fila que creó el otro.
    if (err.code !== 'P2002') throw err
    return prisma.externalCalendar.findFirst({
      where: { workspaceId, userId, source: 'google', googleCalendarId: 'primary' },
    })
  }
}

/**
 * Refresca, si hace falta, los calendarios de UNA persona — la que está mirando.
 * Para los de otras personas (vista Equipo) se usa el cache tal cual: mirar la
 * semana de 6 compañeros no puede disparar 6 fetchs de red por render. De eso se
 * encarga el cron.
 */
async function syncIfStale({ workspaceId, userId, tz, deadlineMs = INTERACTIVE_DEADLINE_MS }) {
  const work = (async () => {
    await ensureGoogleCalendar({ workspaceId, userId })
    const cals = await prisma.externalCalendar.findMany({ where: { workspaceId, userId, active: true } })
    const due = cals.filter(isStale)
    for (const cal of due) await syncCalendar(cal, { tz })
    return due.length
  })()

  // Si la fuente tarda, se responde con el cache y el refresco sigue solo: nadie
  // debería esperar 20 segundos a que Google conteste para ver su propio
  // calendario. El `catch` va sobre `work` y no sobre el race, para que un rechazo
  // posterior al deadline no quede sin manejar.
  work.catch(err => console.error('[ExternalCalendar] syncIfStale falló:', err.message))
  if (!deadlineMs) return work.catch(() => 0)
  let timer
  const deadline = new Promise(resolve => { timer = setTimeout(() => resolve(0), deadlineMs) })
  try {
    return await Promise.race([work.catch(() => 0), deadline])
  } finally {
    clearTimeout(timer)
  }
}

/** Cron: refresca todos los calendarios activos que ya están vencidos. */
async function syncAllDue({ limit = 200 } = {}) {
  const cals = await prisma.externalCalendar.findMany({
    where: { active: true },
    include: { workspace: { select: { timezone: true } } },
    orderBy: { lastSyncAt: 'asc' },
    take: limit,
  })
  let done = 0
  for (const cal of cals) {
    if (!isStale(cal)) continue
    // Sin deadline: acá nadie está esperando la respuesta.
    const res = await syncCalendar(cal, { tz: cal.workspace?.timezone || DEFAULT_TZ })
    if (res.ok) done++
  }
  return { checked: cals.length, synced: done }
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

/**
 * Eventos externos cacheados que solapan [from, to], por persona.
 * `requesterId` decide cuánto se cuenta de cada uno: el título de la agenda de otra
 * persona solo se muestra si ese calendario está marcado `showDetails` — un evento
 * traído de una agenda personal ("Médico 15h") no es una reunión de trabajo.
 */
async function listForRange({ workspaceId, userIds, from, to, requesterId }) {
  if (!userIds?.length) return []
  const rows = await prisma.externalCalendarEvent.findMany({
    where: {
      workspaceId, userId: { in: userIds },
      date: { lte: to }, endDate: { gte: from },
      calendar: { active: true },
    },
    include: { calendar: { select: { id: true, name: true, color: true, source: true, showDetails: true } } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })
  return dedupeExternalRows(rows).map(r => {
    const own = r.userId === requesterId
    const reveal = own || r.calendar.showDetails
    return {
      id: r.id,
      kind: 'external',
      userId: r.userId,
      calendarId: r.calendarId,
      calendarName: r.calendar.name,
      calendarSource: r.calendar.source,
      color: r.calendar.color,
      title: reveal ? r.title : 'Ocupado',
      date: r.date,
      endDate: r.endDate,
      startTime: r.startTime,
      durationMins: r.durationMins,
      allDay: r.allDay,
      busy: r.busy,
      location: reveal ? r.location : null,
      url: own ? r.url : null,
    }
  })
}

module.exports = {
  SYNC_PAST_DAYS, SYNC_AHEAD_DAYS, STALE_MINS, MAX_EVENTS_PER_CALENDAR, INTERACTIVE_DEADLINE_MS,
  syncWindow, isStale, syncCalendar, syncIfStale, syncAllDue,
  ensureGoogleCalendar, listForRange, probeIcsUrl, fetchIcsText,
}
