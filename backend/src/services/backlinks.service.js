const prisma = require('../lib/prisma')
const {
  normalizeLinkUrl, linkDomain, profileFromLinks,
  LINK_TYPES, LINK_STATUSES, PLACEMENTS,
} = require('../lib/backlinks')
const { listDomainRatingHistory } = require('./ahrefs.service')

// Tope de filas en una respuesta del inventario. El perfil cargado a mano de un
// cliente son decenas o unos cientos de enlaces, no miles (los miles están en
// Ahrefs, que es justo lo que no estamos replicando).
const MAX_PAGE_SIZE = 100
const HISTORY_LIMIT = 6   // lecturas del perfil que muestra la vista, como las pills de DR
const SNAPSHOT_MONTHS = 12

const LINK_SELECT = {
  id: true, sourceUrl: true, sourceDomain: true, targetUrl: true, anchor: true,
  linkType: true, placement: true, domainRating: true, traffic: true, language: true,
  notes: true, firstSeenAt: true, source: true, verifiable: true,
  status: true, lastCheckedAt: true, lastStatusCode: true, sourceNoindex: true,
  checkFailures: true, lostAt: true, statusLockedAt: true,
  createdAt: true, updatedAt: true,
  createdBy:      { select: { id: true, name: true, avatar: true } },
  updatedBy:      { select: { id: true, name: true, avatar: true } },
  createdByAgent: { select: { id: true, label: true } },
  createdByAgentName: true,
}

/**
 * Valida y normaliza los campos editables de un backlink.
 * Devuelve `{ data }` o `{ error }` — el caller responde 400 con el error.
 */
function buildLinkData(body, { isCreate = false } = {}) {
  const data = {}

  if (isCreate || body.sourceUrl !== undefined) {
    const { url, truncated } = normalizeLinkUrl(body.sourceUrl)
    if (!url) return { error: 'La URL de la página que enlaza no es válida' }
    const domain = linkDomain(url)
    if (!domain) return { error: 'No se pudo leer el dominio de esa URL' }
    data.sourceUrl    = url
    data.sourceDomain = domain
    // Lo truncado no se pierde: queda en la nota, porque sourceUrl es parte de un
    // UNIQUE y no puede crecer sin tope.
    if (truncated) data.notes = `URL original (truncada para el índice): ${String(body.sourceUrl).trim()}`
  }

  if (body.targetUrl !== undefined) {
    if (!body.targetUrl) data.targetUrl = null
    else {
      const { url } = normalizeLinkUrl(body.targetUrl)
      if (!url) return { error: 'La URL de destino no es válida' }
      data.targetUrl = url
    }
  }

  if (body.anchor !== undefined) data.anchor = textOrNull(body.anchor, 200)
  if (body.notes !== undefined && data.notes === undefined) data.notes = textOrNull(body.notes, 1000)
  if (body.language !== undefined) data.language = textOrNull(body.language, 10)

  if (body.linkType !== undefined) {
    if (!LINK_TYPES.includes(body.linkType)) return { error: 'Tipo de enlace inválido' }
    data.linkType = body.linkType
  }
  if (body.placement !== undefined) {
    if (body.placement && !PLACEMENTS.includes(body.placement)) return { error: 'Ubicación de enlace inválida' }
    data.placement = body.placement || null
  }

  for (const key of ['domainRating', 'traffic']) {
    if (body[key] === undefined) continue
    if (body[key] === null || body[key] === '') { data[key] = null; continue }
    const num = Number(body[key])
    if (!Number.isFinite(num) || num < 0) return { error: `${key} tiene que ser un número` }
    data[key] = key === 'traffic' ? Math.round(num) : num
  }

  if (body.firstSeenAt !== undefined) {
    if (!body.firstSeenAt) data.firstSeenAt = null
    else {
      const d = new Date(body.firstSeenAt)
      if (Number.isNaN(d.getTime())) return { error: 'La fecha de aparición no es válida' }
      data.firstSeenAt = d
    }
  }

  if (body.verifiable !== undefined) data.verifiable = !!body.verifiable

  // El estado lo escribe el verificador. Que lo toque una persona es un acto
  // deliberado ("yo lo vi, está puesto") y sella statusLockedAt para que el
  // próximo cron no lo vuelva a pisar: es la salida para los enlaces que un
  // sitio inyecta por JS y cheerio no puede ver.
  if (body.status !== undefined) {
    if (!LINK_STATUSES.includes(body.status)) return { error: 'Estado de enlace inválido' }
    data.status         = body.status
    data.statusLockedAt = new Date()
    data.checkFailures  = 0
    data.lostAt         = body.status === 'perdido' ? new Date() : null
  }
  if (body.unlockStatus === true) {
    data.statusLockedAt = null
  }

  return { data }
}

function textOrNull(value, max) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, max) : null
}

/** Autoría: una persona, o un agente actuando EN NOMBRE de esa persona (los dos conviven). */
function authorData({ userId, agentId, agentName }, { isCreate = false } = {}) {
  const data = {
    updatedById:        userId ?? null,
    updatedByAgentId:   agentId ?? null,
    updatedByAgentName: agentName ?? null,
  }
  if (isCreate) {
    data.createdById        = userId ?? null
    data.createdByAgentId   = agentId ?? null
    data.createdByAgentName = agentName ?? null
  }
  return data
}

async function listBacklinks({ projectId, workspaceId, status, domain, source, q, page = 1, limit = 50 }) {
  const where = { projectId, workspaceId }
  if (status && LINK_STATUSES.includes(status)) where.status = status
  if (source) where.source = source
  if (domain) where.sourceDomain = { contains: String(domain).toLowerCase() }
  if (q) {
    const text = String(q).trim()
    if (text) {
      where.OR = [
        { sourceUrl: { contains: text, mode: 'insensitive' } },
        { anchor:    { contains: text, mode: 'insensitive' } },
      ]
    }
  }

  const take = Math.min(Math.max(Number(limit) || 50, 1), MAX_PAGE_SIZE)
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take

  const [items, total, grouped, lastJob] = await Promise.all([
    prisma.backlink.findMany({ where, select: LINK_SELECT, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take, skip }),
    prisma.backlink.count({ where }),
    // Los conteos por estado se piden sobre el proyecto entero, no sobre la página
    // ni sobre el filtro: son los chips de la UI y tienen que seguir mostrando
    // "3 perdidos" mientras estás mirando los activos.
    prisma.backlink.groupBy({ by: ['status'], where: { projectId, workspaceId }, _count: { _all: true } }),
    prisma.backlinkJob.findFirst({ where: { projectId, kind: 'verify' }, orderBy: { createdAt: 'desc' } }),
  ])

  const counts = Object.fromEntries(LINK_STATUSES.map(s => [s, 0]))
  for (const row of grouped) counts[row.status] = row._count._all

  return { items, total, counts, lastJob }
}

async function createBacklink({ projectId, workspaceId, author, data, source = 'manual', importBatch = null }) {
  return prisma.backlink.create({
    data: {
      projectId, workspaceId, source, importBatch,
      ...data,
      ...authorData(author, { isCreate: true }),
    },
    select: LINK_SELECT,
  })
}

async function updateBacklink({ projectId, workspaceId, backlinkId, author, data }) {
  const existing = await prisma.backlink.findFirst({ where: { id: backlinkId, projectId, workspaceId }, select: { id: true } })
  if (!existing) return null
  return prisma.backlink.update({
    where: { id: backlinkId },
    data:  { ...data, ...authorData(author) },
    select: LINK_SELECT,
  })
}

async function deleteBacklink({ projectId, workspaceId, backlinkId }) {
  const { count } = await prisma.backlink.deleteMany({ where: { id: backlinkId, projectId, workspaceId } })
  return count > 0
}

async function listChecks({ projectId, workspaceId, backlinkId, limit = 20 }) {
  const link = await prisma.backlink.findFirst({ where: { id: backlinkId, projectId, workspaceId }, select: { id: true } })
  if (!link) return null
  return prisma.backlinkCheck.findMany({
    where:   { backlinkId },
    orderBy: { createdAt: 'desc' },
    take:    Math.min(Math.max(Number(limit) || 20, 1), 100),
    select:  {
      id: true, status: true, httpStatus: true, found: true, anchor: true, rel: true,
      linkType: true, targetUrl: true, noindex: true, redirectedTo: true, errorMsg: true, createdAt: true,
    },
  })
}

/**
 * El perfil: los contadores VIVOS derivados del inventario + las lecturas
 * externas acumuladas + la serie mensual + el DR de Ahrefs.
 *
 * Los contadores propios se derivan acá y no se leen de la última lectura: la
 * lectura es un registro histórico, no la fuente del número de hoy.
 */
async function getProfile({ projectId, workspaceId }) {
  const [links, readings, snapshots, project, drHistory] = await Promise.all([
    prisma.backlink.findMany({
      where:  { projectId, workspaceId },
      select: { sourceDomain: true, status: true, linkType: true, domainRating: true, firstSeenAt: true, lostAt: true },
    }),
    prisma.backlinkProfileReading.findMany({
      where:   { projectId, workspaceId },
      orderBy: { capturedAt: 'desc' },
      take:    HISTORY_LIMIT,
      select:  {
        id: true, ownLinks: true, ownDomains: true, ownFollowLinks: true, ownLostLinks: true,
        reportedDomains: true, reportedLinks: true, reportedSource: true, domainRating: true,
        source: true, notes: true, capturedAt: true,
        createdBy:      { select: { id: true, name: true, avatar: true } },
        createdByAgent: { select: { id: true, label: true } },
        createdByAgentName: true,
      },
    }),
    prisma.backlinkSnapshot.findMany({
      where:   { projectId, workspaceId },
      orderBy: { month: 'desc' },
      take:    SNAPSHOT_MONTHS,
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { websiteUrl: true, domainRating: true, domainRatingAt: true } }),
    listDomainRatingHistory(projectId),
  ])

  return {
    live:           profileFromLinks(links),
    totalLinks:     links.length,
    readings,
    snapshots:      snapshots.slice().reverse(),   // ascendente para el gráfico
    domainRating:   project?.domainRating ?? null,
    domainRatingAt: project?.domainRatingAt ?? null,
    drHistory,
    hasUrl:         !!project?.websiteUrl,
  }
}

/**
 * Registra una lectura externa. Los conteos propios NO los manda el cliente: se
 * calculan acá para que la fila se explique sola años después, aunque alguien
 * borre enlaces o corrija fechas.
 */
async function recordProfileReading({ projectId, workspaceId, author, reported = {}, source = 'manual', notes = null }) {
  const [links, project] = await Promise.all([
    prisma.backlink.findMany({
      where:  { projectId, workspaceId },
      select: { sourceDomain: true, status: true, linkType: true, domainRating: true },
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { domainRating: true } }),
  ])
  const live = profileFromLinks(links)

  return prisma.backlinkProfileReading.create({
    data: {
      projectId, workspaceId, source, notes,
      ownLinks:       live.activeLinks,
      ownDomains:     live.referringDomains,
      ownFollowLinks: live.followLinks,
      ownLostLinks:   live.lostLinks,
      reportedDomains: intOrNull(reported.reportedDomains),
      reportedLinks:   intOrNull(reported.reportedLinks),
      reportedSource:  textOrNull(reported.reportedSource, 20),
      domainRating:    project?.domainRating ?? null,
      createdById:        author?.userId ?? null,
      createdByAgentId:   author?.agentId ?? null,
      createdByAgentName: author?.agentName ?? null,
    },
  })
}

function intOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : null
}

module.exports = {
  listBacklinks,
  createBacklink,
  updateBacklink,
  deleteBacklink,
  listChecks,
  getProfile,
  recordProfileReading,
  buildLinkData,
  authorData,
  LINK_SELECT,
  MAX_PAGE_SIZE,
}
