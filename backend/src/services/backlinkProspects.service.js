const prisma = require('../lib/prisma')
const {
  prospectDomain, mergeCompetitorEvidence, parseCompetitors, competitorLinkTotal,
  effectiveVerdict, VERDICTS, PIPELINE_STATUSES,
} = require('../lib/backlinks')

// Un export de competencia agregado por dominio son decenas o cientos de sitios,
// no miles: los miles son filas de página, y agrupar es justamente el punto.
const MAX_PAGE_SIZE = 100

/**
 * Qué estados de un `Backlink` significan "tenemos un enlace de ese dominio".
 *
 * `sin_verificar` cuenta: alguien lo cargó porque lo consiguió, y el cruce no
 * puede esperar a que el verificador pase el lunes para reconocerlo. `no_verificable`
 * también: viene del reporte de Search Console, que es Google diciéndonos que ese
 * dominio nos enlaza. Los tres estados de pérdida (`perdido`, `roto`, `redirigido`)
 * NO cuentan, y por eso el cruce también sabe DESMARCAR.
 */
const OWNED_STATUSES = ['activo', 'sin_verificar', 'no_verificable']

const PROSPECT_SELECT = {
  id: true, domain: true, competitors: true, linksToCompetitors: true,
  exampleUrl: true, exampleAnchor: true, domainRating: true, traffic: true, language: true,
  alreadyLinked: true, alreadyLinkedAt: true,
  verdict: true, verdictSource: true, verdictReason: true, verdictAt: true, verdictLockedAt: true,
  pipelineStatus: true, pipelineNote: true, cost: true, dueDate: true,
  ownerId: true, taskId: true, backlinkId: true,
  source: true, importBatch: true, createdAt: true, updatedAt: true,
  owner:          { select: { id: true, name: true, avatar: true } },
  createdBy:      { select: { id: true, name: true, avatar: true } },
  updatedBy:      { select: { id: true, name: true, avatar: true } },
  createdByAgent: { select: { id: true, label: true } },
  createdByAgentName: true,
  updatedByAgentName: true,
}

/**
 * La fila como la ve quien la lee: la evidencia ya parseada y el estado único.
 *
 * `effectiveVerdict` se resuelve acá y no en la escritura para que el cruce
 * automático pueda correr cuantas veces quiera sin destruir la opinión — ver el
 * modelo en schema.prisma.
 */
function shapeProspect(row) {
  const competitors = parseCompetitors(row.competitors)
  return {
    ...row,
    competitors,
    competitorCount:  competitors.length,
    effectiveVerdict: effectiveVerdict(row),
    // Un veredicto corregido a mano se rotula distinto: es la diferencia entre
    // "lo dijo la IA" y "lo decidimos nosotros", y la IA no lo vuelve a pisar.
    verdictLocked:    !!row.verdictLockedAt,
  }
}

/**
 * Valida y normaliza los campos editables de un prospecto.
 * Devuelve `{ data }` o `{ error }`; el caller responde 400 con el error.
 *
 * `verdict` y `alreadyLinked` NO comparten camino a propósito: `alreadyLinked` es
 * un hecho que sólo escribe `syncProspectOwnership`, y acá no se puede tocar.
 */
function buildProspectData(body, { isCreate = false } = {}) {
  const data = {}

  if (isCreate) {
    const domain = prospectDomain(body?.domain ?? body?.url)
    if (!domain) return { error: 'No se pudo leer el dominio. Escribilo como "diario.com" o pegá una URL del sitio.' }
    data.domain = domain
  } else if (body.domain !== undefined) {
    // El dominio es la identidad de la fila (UNIQUE con el proyecto). Cambiarlo
    // convertiría el prospecto en otro, perdiendo su veredicto y su pipeline:
    // para eso se borra y se crea.
    return { error: 'El dominio de un prospecto no se puede cambiar. Borralo y cargá el nuevo.' }
  }

  if (body.exampleUrl !== undefined)    data.exampleUrl    = textOrNull(body.exampleUrl, 1000)
  if (body.exampleAnchor !== undefined) data.exampleAnchor = textOrNull(body.exampleAnchor, 200)
  if (body.language !== undefined)      data.language      = textOrNull(body.language, 10)
  if (body.pipelineNote !== undefined)  data.pipelineNote  = textOrNull(body.pipelineNote, 1000)
  if (body.verdictReason !== undefined) data.verdictReason = textOrNull(body.verdictReason, 300)

  for (const key of ['domainRating', 'traffic', 'cost']) {
    if (body[key] === undefined) continue
    if (body[key] === null || body[key] === '') { data[key] = null; continue }
    const num = Number(body[key])
    if (!Number.isFinite(num) || num < 0) return { error: `${key} tiene que ser un número` }
    data[key] = key === 'traffic' ? Math.round(num) : num
  }

  if (body.dueDate !== undefined) {
    if (!body.dueDate) data.dueDate = null
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate))) return { error: 'La fecha tiene que ser YYYY-MM-DD' }
    else data.dueDate = String(body.dueDate)
  }

  if (body.pipelineStatus !== undefined) {
    if (!PIPELINE_STATUSES.includes(body.pipelineStatus)) return { error: 'Estado de pipeline inválido' }
    data.pipelineStatus = body.pipelineStatus
  }

  if (body.ownerId !== undefined) {
    if (!body.ownerId) data.ownerId = null
    else {
      const id = Number(body.ownerId)
      if (!Number.isInteger(id) || id <= 0) return { error: 'Responsable inválido' }
      data.ownerId = id
    }
  }

  // Un veredicto escrito a mano SELLA el candado: la clasificación IA lo lleva en
  // el WHERE de su updateMany, así la corrección es inmune incluso durante una
  // corrida que ya empezó.
  if (body.verdict !== undefined) {
    if (!VERDICTS.includes(body.verdict)) return { error: 'Veredicto inválido' }
    data.verdict         = body.verdict
    data.verdictSource   = 'manual'
    data.verdictAt       = new Date()
    data.verdictLockedAt = new Date()
    if (body.verdictReason === undefined) data.verdictReason = null
  }

  // Volver atrás: la fila queda disponible para que la IA la vuelva a evaluar.
  if (body.resetVerdict === true) {
    data.verdict         = 'sin_evaluar'
    data.verdictSource   = 'none'
    data.verdictReason   = null
    data.verdictAt       = null
    data.verdictLockedAt = null
  }

  return { data }
}

function textOrNull(value, max) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, max) : null
}

function authorData({ userId, agentId, agentName } = {}, { isCreate = false } = {}) {
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

async function listProspects({
  projectId, workspaceId, verdict, pipeline, alreadyLinked, competitor, q,
  page = 1, limit = 50,
}) {
  const where = { projectId, workspaceId }

  // "ya_lo_tenemos" no es un valor de la columna `verdict` sino el hecho que gana
  // sobre ella, así que filtrar por él es filtrar por el booleano.
  if (verdict === 'ya_lo_tenemos') where.alreadyLinked = true
  else if (verdict && VERDICTS.includes(verdict)) {
    where.verdict = verdict
    // Sin esto, "conseguible" mostraría también los que ya conseguimos: la fila
    // conserva su veredicto viejo y la UI la rotula "Ya lo tenemos".
    where.alreadyLinked = false
  }

  if (pipeline && PIPELINE_STATUSES.includes(pipeline)) where.pipelineStatus = pipeline
  if (alreadyLinked === 'true' || alreadyLinked === true) where.alreadyLinked = true
  if (alreadyLinked === 'false' || alreadyLinked === false) where.alreadyLinked = false
  if (competitor) where.competitors = { contains: String(competitor).toLowerCase() }
  if (q) {
    const text = String(q).trim()
    if (text) {
      where.OR = [
        { domain:        { contains: text, mode: 'insensitive' } },
        { exampleAnchor: { contains: text, mode: 'insensitive' } },
      ]
    }
  }

  const take = Math.min(Math.max(Number(limit) || 50, 1), MAX_PAGE_SIZE)
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take

  const [items, total, byVerdict, ownedCount] = await Promise.all([
    prisma.backlinkProspect.findMany({
      where, select: PROSPECT_SELECT, take, skip,
      // Primero lo que enlaza a más competidores: es la señal de prioridad, y lo
      // que alguien abre esta pantalla a decidir.
      orderBy: [{ linksToCompetitors: 'desc' }, { domainRating: 'desc' }, { domain: 'asc' }],
    }),
    prisma.backlinkProspect.count({ where }),
    // Los conteos de los chips se piden sobre el proyecto entero y no sobre el
    // filtro: tienen que seguir diciendo "12 conseguibles" mientras mirás otro.
    prisma.backlinkProspect.groupBy({
      by: ['verdict'], where: { projectId, workspaceId, alreadyLinked: false }, _count: { _all: true },
    }),
    prisma.backlinkProspect.count({ where: { projectId, workspaceId, alreadyLinked: true } }),
  ])

  const counts = Object.fromEntries(VERDICTS.map(v => [v, 0]))
  for (const row of byVerdict) counts[row.verdict] = row._count._all
  counts.ya_lo_tenemos = ownedCount

  return { items: items.map(shapeProspect), total, counts }
}

/**
 * Alta de prospectos. Acepta un array: un agente que leyó 50 dominios en Ahrefs
 * los carga en una llamada.
 *
 * Un dominio que YA existe no es un error: se le suma la evidencia del competidor
 * nuevo (`merged`). Es el caso central — el mismo medio enlaza a varios
 * competidores, y es justamente el dominio más valioso. Lo que NUNCA se toca al
 * re-cargar es el veredicto ni el pipeline: la decisión ya tomada sobrevive a
 * cualquier importación posterior.
 */
async function createProspects({ projectId, workspaceId, author, items, competitorDomain = null, source = 'manual', importBatch = null }) {
  const created = []
  const merged = []
  const skipped = []

  for (const item of items) {
    const { data, error } = buildProspectData(item, { isCreate: true })
    if (error) { skipped.push({ value: item?.domain ?? null, reason: error }); continue }

    const links = Number(item.links) || 0
    const evidence = competitorDomain ? [{ domain: competitorDomain, links: links || 1 }] : []

    try {
      const row = await prisma.backlinkProspect.create({
        data: {
          projectId, workspaceId, source, importBatch,
          ...data,
          competitors:        JSON.stringify(evidence),
          linksToCompetitors: competitorLinkTotal(evidence),
          ...authorData(author, { isCreate: true }),
        },
        select: PROSPECT_SELECT,
      })
      created.push(shapeProspect(row))
    } catch (err) {
      if (err.code !== 'P2002') throw err
      const row = await mergeIntoExisting({ projectId, workspaceId, author, data, item, competitorDomain, links })
      if (row) merged.push(shapeProspect(row))
      else skipped.push({ value: data.domain, reason: 'ya_cargado' })
    }
  }

  return { created, merged, skipped }
}

/**
 * El dominio ya estaba: se completa lo que falta y se reemplaza la entrada de ESTE
 * competidor en la evidencia.
 *
 * Reemplaza en vez de sumar para que re-importar el mismo archivo sea idempotente;
 * con un contador plano, importar dos veces el export de un competidor duplicaba
 * la señal de prioridad del dominio.
 *
 * Los datos del dominio (DR, tráfico, ejemplo) sólo se completan si estaban
 * vacíos: un export viejo no tiene que pisar un dato que alguien corrigió a mano.
 */
async function mergeIntoExisting({ projectId, workspaceId, author, data, item, competitorDomain, links }) {
  const existing = await prisma.backlinkProspect.findUnique({
    where:  { projectId_domain: { projectId, domain: data.domain } },
    select: { id: true, competitors: true, domainRating: true, traffic: true, exampleUrl: true, exampleAnchor: true, language: true },
  })
  if (!existing) return null

  const evidence = competitorDomain
    ? mergeCompetitorEvidence(existing.competitors, { domain: competitorDomain, links: links || 1 })
    : parseCompetitors(existing.competitors)

  const patch = {
    competitors:        JSON.stringify(evidence),
    linksToCompetitors: competitorLinkTotal(evidence),
    ...authorData(author),
  }
  for (const key of ['domainRating', 'traffic', 'exampleUrl', 'exampleAnchor', 'language']) {
    if (existing[key] == null && item[key] != null) patch[key] = item[key]
  }

  return prisma.backlinkProspect.update({ where: { id: existing.id }, data: patch, select: PROSPECT_SELECT })
}

async function updateProspect({ projectId, workspaceId, prospectId, author, data }) {
  const existing = await prisma.backlinkProspect.findFirst({
    where: { id: prospectId, projectId, workspaceId }, select: { id: true },
  })
  if (!existing) return null
  const row = await prisma.backlinkProspect.update({
    where:  { id: prospectId },
    data:   { ...data, ...authorData(author) },
    select: PROSPECT_SELECT,
  })
  return shapeProspect(row)
}

async function deleteProspect({ projectId, workspaceId, prospectId }) {
  const { count } = await prisma.backlinkProspect.deleteMany({ where: { id: prospectId, projectId, workspaceId } })
  return count > 0
}

/**
 * EL CRUCE AUTOMÁTICO: marca "ya lo tenemos" en los prospectos cuyo dominio ya
 * aparece como origen de un enlace nuestro vivo, y lo DESMARCA cuando deja de
 * aparecer.
 *
 * Es una query y no IA: es exacto, gratis y puede correr en cada escritura. Se
 * llama desde todos los caminos que pueden cambiar la respuesta (alta, edición y
 * baja de un enlace, importación, verificación y alta de un prospecto).
 *
 * Tres propiedades que importan:
 *  - **Nunca toca `verdict`.** "Ya lo tenemos" es un hecho y el veredicto una
 *    opinión; si compartieran campo, cada corrida destruiría la opinión y al
 *    perder el enlace la fila volvería a "sin evaluar" habiendo estado evaluada.
 *  - **Es idempotente.** Correrla dos veces no cambia nada, porque los `updateMany`
 *    filtran por el valor que van a escribir.
 *  - **`alreadyLinkedAt` es "cuándo lo conseguimos", no "cuándo lo chequeamos"**:
 *    sólo se escribe en la transición, que es lo que el filtro del `where` logra.
 *
 * El cruce es por DOMINIO y no por página a propósito: "ya lo tenemos" puede ser
 * un enlace en una página irrelevante del mismo sitio. La UI lo dice así ("ya
 * tenemos un enlace de este dominio") para no prometer más de lo que sabe.
 */
async function syncProspectOwnership({ projectId, workspaceId }) {
  const [anyProspect, rows] = await Promise.all([
    prisma.backlinkProspect.count({ where: { projectId, workspaceId } }),
    prisma.backlink.findMany({
      where:    { projectId, workspaceId, status: { in: OWNED_STATUSES } },
      select:   { sourceDomain: true },
      distinct: ['sourceDomain'],
    }),
  ])
  // Sin prospectos no hay nada que cruzar: el camino más común es un proyecto que
  // sólo carga sus propios enlaces, y no tiene que pagar dos updateMany por eso.
  if (!anyProspect) return { gained: 0, lost: 0 }

  const owned = rows.map(r => r.sourceDomain).filter(Boolean)

  const [gained, lost] = await Promise.all([
    prisma.backlinkProspect.updateMany({
      where: { projectId, workspaceId, alreadyLinked: false, domain: { in: owned } },
      data:  { alreadyLinked: true, alreadyLinkedAt: new Date() },
    }),
    // `notIn: []` matchea todo, que es exactamente lo correcto: sin enlaces vivos,
    // ningún prospecto puede estar marcado.
    prisma.backlinkProspect.updateMany({
      where: { projectId, workspaceId, alreadyLinked: true, domain: { notIn: owned } },
      data:  { alreadyLinked: false, alreadyLinkedAt: null },
    }),
  ])

  return { gained: gained.count, lost: lost.count }
}

/**
 * El cruce como efecto secundario de una escritura: nunca lanza.
 *
 * Que el cruce falle no puede hacer fallar el alta del enlace que lo disparó — el
 * dato que la persona quiso guardar ya está guardado, y la próxima escritura (o el
 * verificador semanal) recalcula el cruce igual porque es idempotente.
 */
async function syncOwnershipQuietly(ctx) {
  try {
    return await syncProspectOwnership(ctx)
  } catch (err) {
    console.error('[Backlinks] No se pudo cruzar los prospectos:', err.message)
    return { gained: 0, lost: 0 }
  }
}

module.exports = {
  listProspects,
  createProspects,
  updateProspect,
  deleteProspect,
  syncProspectOwnership,
  syncOwnershipQuietly,
  buildProspectData,
  shapeProspect,
  OWNED_STATUSES,
  MAX_PAGE_SIZE,
}
