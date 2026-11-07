const prisma = require('../lib/prisma')
const { encrypt } = require('../lib/encryption')
const { normalizeIcsUrl } = require('../lib/externalCalendar')
const externalCalendar = require('../services/externalCalendar.service')
const { DATE_RE, parseUserIds } = require('../lib/calendarEvents')

// Calendarios de afuera traídos a BlissTracker (ver modelo ExternalCalendar).
// TODO es por persona: cada uno gestiona los suyos y nadie —ni un admin— suscribe
// el calendario de otro. Mismo criterio que GoogleCalendarConnection, que ya era
// una conexión personal y no del workspace.

// Tope por persona: son fetchs de red que el cron repite cada 15 minutos.
const MAX_PER_USER = 10
const NAME_MAX = 120
const HEX_RE = /^#[0-9a-fA-F]{6}$/

function shape(cal) {
  return {
    id: cal.id,
    source: cal.source,
    name: cal.name,
    color: cal.color,
    showDetails: cal.showDetails,
    active: cal.active,
    lastSyncAt: cal.lastSyncAt,
    lastSyncError: cal.lastSyncError,
    lastSyncCount: cal.lastSyncCount,
    eventCount: cal._count?.events,
    createdAt: cal.createdAt,
    // La URL NUNCA sale: es la llave del calendario (ver icsUrl en el schema). Solo
    // se informa el host, que se guarda en claro aparte del secreto porque es lo
    // único que sirve para reconocer cuál es.
    icsHost: cal.source === 'ics' ? (cal.icsHost || null) : null,
  }
}

function cleanName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
}

// ─── GET /api/calendar/external-calendars ─────────────────────────────────────
async function list(req, res, next) {
  try {
    // Da de alta sola la fila del Google ya conectado (ver ensureGoogleCalendar):
    // quien conectó Google antes de que esto existiera no tiene que hacer nada.
    await externalCalendar.ensureGoogleCalendar({ workspaceId: req.workspace.id, userId: req.user.userId })
    const cals = await prisma.externalCalendar.findMany({
      where: { workspaceId: req.workspace.id, userId: req.user.userId },
      include: { _count: { select: { events: true } } },
      orderBy: [{ source: 'asc' }, { createdAt: 'asc' }],
    })
    res.json(cals.map(shape))
  } catch (err) { next(err) }
}

// ─── POST /api/calendar/external-calendars ────────────────────────────────────
// Suscribe una URL iCal (Google, Outlook, Apple, la que sea). La URL se prueba
// ANTES de guardar: bajarla y parsearla es la única forma de saber si sirve, y un
// calendario que nunca sincroniza es peor que un error en el momento.
async function create(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId = req.user.userId

    let url
    try { url = normalizeIcsUrl(req.body?.url) } catch (e) { return res.status(400).json({ error: e.message }) }

    const color = req.body?.color
    if (color && !HEX_RE.test(color)) return res.status(400).json({ error: 'El color tiene que ser un hex tipo #4285F4' })

    const count = await prisma.externalCalendar.count({ where: { workspaceId, userId, source: 'ics' } })
    if (count >= MAX_PER_USER) {
      return res.status(400).json({ error: `Llegaste al máximo de ${MAX_PER_USER} calendarios agregados por URL` })
    }

    let probe
    try {
      probe = await externalCalendar.probeIcsUrl(url, { tz: req.workspace.timezone })
    } catch (e) {
      return res.status(400).json({ error: `No se pudo leer ese calendario: ${e.message}`, code: 'ICS_UNREADABLE' })
    }

    const host = (() => { try { return new URL(url).host } catch { return null } })()
    const name = cleanName(req.body?.name) || probe.name || host || 'Calendario externo'

    const cal = await prisma.externalCalendar.create({
      data: {
        workspaceId, userId, source: 'ics', name,
        icsUrl: encrypt(url),
        icsHost: host,
        color: color || null,
        showDetails: req.body?.showDetails === true,
      },
    })
    // Primera carga ya mismo: el usuario acaba de pegar la URL y espera verlo.
    await externalCalendar.syncCalendar(cal, { tz: req.workspace.timezone })
    const fresh = await prisma.externalCalendar.findUnique({
      where: { id: cal.id },
      include: { _count: { select: { events: true } } },
    })
    res.status(201).json(shape(fresh))
  } catch (err) { next(err) }
}

async function loadOwn(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return null
  return prisma.externalCalendar.findFirst({
    where: { id, workspaceId: req.workspace.id, userId: req.user.userId },
  })
}

// ─── PATCH /api/calendar/external-calendars/:id ───────────────────────────────
async function update(req, res, next) {
  try {
    const cal = await loadOwn(req)
    if (!cal) return res.status(404).json({ error: 'Calendario no encontrado' })

    const data = {}
    if (req.body?.name !== undefined) {
      const name = cleanName(req.body.name)
      if (!name) return res.status(400).json({ error: 'El nombre no puede quedar vacío' })
      data.name = name
    }
    if (req.body?.color !== undefined) {
      if (req.body.color && !HEX_RE.test(req.body.color)) return res.status(400).json({ error: 'El color tiene que ser un hex tipo #4285F4' })
      data.color = req.body.color || null
    }
    if (typeof req.body?.active === 'boolean') data.active = req.body.active
    if (typeof req.body?.showDetails === 'boolean') data.showDetails = req.body.showDetails
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nada que actualizar' })

    const updated = await prisma.externalCalendar.update({
      where: { id: cal.id },
      data,
      include: { _count: { select: { events: true } } },
    })
    res.json(shape(updated))
  } catch (err) { next(err) }
}

// ─── DELETE /api/calendar/external-calendars/:id ──────────────────────────────
// Borra la suscripción y, en cascada, su cache. El de Google se puede sacar sin
// desconectar la cuenta: dejar de VER sus eventos acá y dejar de EMPUJAR los de
// BlissTracker allá son dos decisiones distintas.
async function remove(req, res, next) {
  try {
    const cal = await loadOwn(req)
    if (!cal) return res.status(404).json({ error: 'Calendario no encontrado' })
    await prisma.externalCalendar.delete({ where: { id: cal.id } })
    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ─── POST /api/calendar/external-calendars/:id/sync ───────────────────────────
async function sync(req, res, next) {
  try {
    const cal = await loadOwn(req)
    if (!cal) return res.status(404).json({ error: 'Calendario no encontrado' })
    const result = await externalCalendar.syncCalendar(cal, { tz: req.workspace.timezone })
    const fresh = await prisma.externalCalendar.findUnique({
      where: { id: cal.id },
      include: { _count: { select: { events: true } } },
    })
    res.json({ ...shape(fresh), synced: result.ok, error: result.error ?? null })
  } catch (err) { next(err) }
}

// ─── GET /api/calendar/external-events?from=&to=[&userIds=] ───────────────────
// Va por su propia ruta y no sumado a GET /calendar/events para no cambiarle el
// shape (un array de reuniones) a algo que ya consumen el Calendario, la ficha del
// proyecto y el Dashboard. El frontend pide las dos cosas en paralelo.
async function listEvents(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const requesterId = req.user.userId
    const { from, to } = req.query
    if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) {
      return res.status(400).json({ error: 'from/to inválidos (YYYY-MM-DD)' })
    }
    const requested = req.query.userIds ? parseUserIds(req.query.userIds) : [requesterId]
    if (!requested.length) return res.json([])

    // Solo refresca lo propio: la vista Equipo con 6 personas no puede disparar 6
    // fetchs de red por render (de los demás se encarga el cron).
    if (requested.includes(requesterId)) {
      await externalCalendar.syncIfStale({ workspaceId, userId: requesterId, tz: req.workspace.timezone })
    }
    const events = await externalCalendar.listForRange({
      workspaceId, userIds: requested, from, to, requesterId,
    })
    res.json(events)
  } catch (err) { next(err) }
}

// ─── GET /api/calendar/external-events/:id ───────────────────────────────────
// El detalle de un evento traído de afuera: lo que abre el bloque de la grilla,
// donde el título va truncado y no entra nada más. Es de solo lectura — se edita
// donde vive, y para eso está el link a su calendario de origen.
async function getEvent(req, res, next) {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id inválido' })
    const event = await externalCalendar.getOne({ workspaceId: req.workspace.id, id, requesterId: req.user.userId })
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' })
    res.json(event)
  } catch (err) { next(err) }
}

module.exports = { list, create, update, remove, sync, listEvents, getEvent }
