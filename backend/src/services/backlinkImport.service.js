const crypto = require('crypto')
const prisma = require('../lib/prisma')
const { parseBacklinkCsv } = require('../lib/backlinksCsv')
const {
  aggregateProspects, prospectDomain, mergeCompetitorEvidence,
  parseCompetitors, competitorLinkTotal,
} = require('../lib/backlinks')

/**
 * Importa un CSV de backlinks. Dos pasos, como el import del inventario del blog:
 * con `dryRun: true` devuelve exactamente lo que va a pasar sin escribir nada, y
 * la segunda llamada lo confirma.
 *
 * La idempotencia es doble: el `Set` de URLs ya cargadas evita el trabajo y el
 * UNIQUE (projectId, sourceUrl) es el que de verdad lo garantiza si dos
 * importaciones corren juntas. Re-importar el mismo export tiene que crear 0
 * filas — es la diferencia entre una herramienta usable y una que duplica el
 * inventario cada vez que alguien se equivoca de archivo.
 */
async function importBacklinks({
  projectId, workspaceId, author, csv, format = 'auto', target = 'own',
  competitorDomain = null, dryRun = false,
}) {
  const parsed = parseBacklinkCsv(csv, { format, target })
  if (parsed.error) {
    const err = new Error(parsed.error)
    err.status = 400
    err.code = 'CSV_UNREADABLE'
    err.unmappedHeaders = parsed.unmappedHeaders
    throw err
  }

  if (target === 'prospects') {
    return importProspects({ projectId, workspaceId, author, parsed, competitorDomain, dryRun })
  }

  const existing = await prisma.backlink.findMany({
    where:  { projectId },
    select: { sourceUrl: true },
  })
  const known = new Set(existing.map(b => b.sourceUrl))

  const toCreate = []
  // Las filas que vienen repetidas DENTRO del mismo archivo también se saltean:
  // un export de Ahrefs puede traer la misma página dos veces con anchors
  // distintos, y el UNIQUE las rechazaría de a una dejando el conteo mentiroso.
  const seen = new Set()
  const skipped = [...parsed.skipped]

  for (const row of parsed.rows) {
    if (known.has(row.sourceUrl)) { skipped.push({ value: row.sourceUrl, reason: 'ya_cargada' }); continue }
    if (seen.has(row.sourceUrl))  { skipped.push({ value: row.sourceUrl, reason: 'repetida_en_el_archivo' }); continue }
    seen.add(row.sourceUrl)
    toCreate.push(row)
  }

  const summary = {
    format:        parsed.format,
    separator:     parsed.separator,
    read:          parsed.rows.length + parsed.skipped.length,
    unmappedHeaders: parsed.unmappedHeaders,
    skippedCount:  skipped.length,
    // Se recorta el detalle: un archivo de 500 filas ya cargadas no tiene que
    // devolver 500 líneas de "ya_cargada" para decir lo mismo.
    skipped:       skipped.slice(0, MAX_SKIPPED_DETAIL),
  }

  if (dryRun) {
    return {
      ...summary,
      dryRun: true,
      createdCount: toCreate.length,
      created: toCreate.slice(0, MAX_PREVIEW).map(previewRow),
    }
  }

  // Un lote del mismo archivo comparte `importBatch`: permite auditar o deshacer
  // una importación entera sin adivinar por fecha.
  const importBatch = crypto.randomUUID()
  const source = SOURCE_BY_FORMAT[parsed.format] ?? (author?.agentId ? 'agent' : 'manual')

  const created = []
  for (const row of toCreate) {
    try {
      const link = await prisma.backlink.create({
        data: {
          projectId, workspaceId, source, importBatch,
          ...row,
          createdById:        author?.userId ?? null,
          updatedById:        author?.userId ?? null,
          createdByAgentId:   author?.agentId ?? null,
          updatedByAgentId:   author?.agentId ?? null,
          createdByAgentName: author?.agentName ?? null,
          updatedByAgentName: author?.agentName ?? null,
        },
        select: { id: true, sourceUrl: true, sourceDomain: true, verifiable: true },
      })
      created.push(link)
    } catch (err) {
      // P2002 = alguien la cargó entre el Set y el insert. No frena el lote.
      if (err.code === 'P2002') skipped.push({ value: row.sourceUrl, reason: 'ya_cargada' })
      else throw err
    }
  }

  return {
    ...summary,
    dryRun: false,
    importBatch,
    createdCount: created.length,
    created: created.slice(0, MAX_PREVIEW),
    skippedCount: skipped.length,
    skipped: skipped.slice(0, MAX_SKIPPED_DETAIL),
  }
}

/**
 * El mismo CSV, pero cargado como COMPETENCIA: las filas se agrupan por dominio
 * antes de escribir nada.
 *
 * Es la diferencia central entre los dos destinos. Un enlace propio es una página
 * concreta que hay que poder verificar; un prospecto de competencia es un SITIO
 * sobre el que hay que tomar una decisión ("¿podemos conseguir un enlace de acá?"),
 * y el export de un competidor trae miles de filas de página para esa única
 * decisión. Sin agrupar, la tabla de competencia sería ilegible y el UNIQUE por
 * dominio rechazaría casi todo.
 */
async function importProspects({ projectId, workspaceId, author, parsed, competitorDomain, dryRun }) {
  const competitor = prospectDomain(competitorDomain)
  const domains = aggregateProspects(parsed.rows)

  const existing = await prisma.backlinkProspect.findMany({
    where:  { projectId },
    select: { id: true, domain: true, competitors: true, domainRating: true, traffic: true, exampleUrl: true, exampleAnchor: true, language: true },
  })
  const known = new Map(existing.map(p => [p.domain, p]))

  const toCreate = []
  const toMerge = []
  for (const item of domains) {
    if (known.has(item.domain)) toMerge.push(item)
    else toCreate.push(item)
  }

  const summary = {
    target:          'prospects',
    format:          parsed.format,
    separator:       parsed.separator,
    competitorDomain: competitor,
    read:            parsed.rows.length + parsed.skipped.length,
    domains:         domains.length,
    unmappedHeaders: parsed.unmappedHeaders,
    skippedCount:    parsed.skipped.length,
    skipped:         parsed.skipped.slice(0, MAX_SKIPPED_DETAIL),
  }

  if (dryRun) {
    return {
      ...summary,
      dryRun: true,
      createdCount: toCreate.length,
      mergedCount:  toMerge.length,
      // El preview muestra los dos grupos juntos marcando cuál es cuál: lo
      // importante no es "entran 40" sino "40 nuevos y 12 que ya estaban, a los
      // que se les suma este competidor".
      created: [...toCreate, ...toMerge]
        .slice(0, MAX_PREVIEW)
        .map(r => ({ ...prospectPreview(r), merge: known.has(r.domain) })),
    }
  }

  const importBatch = crypto.randomUUID()
  const source = SOURCE_BY_FORMAT[parsed.format] ?? (author?.agentId ? 'agent' : 'manual')
  const skipped = [...parsed.skipped]
  const created = []
  const merged = []

  for (const item of domains) {
    const previous = known.get(item.domain)
    try {
      if (previous) {
        merged.push(await prisma.backlinkProspect.update({
          where: { id: previous.id },
          data: {
            ...mergeEvidence(previous, item, competitor),
            // Los datos del dominio se COMPLETAN, no se pisan: un export viejo no
            // tiene que borrar un DR que alguien corrigió a mano.
            ...fillMissing(previous, item),
            ...authorPatch(author),
          },
          select: PROSPECT_RESULT,
        }))
      } else {
        const evidence = competitor ? [{ domain: competitor, links: item.links }] : []
        created.push(await prisma.backlinkProspect.create({
          data: {
            projectId, workspaceId, source, importBatch,
            domain:             item.domain,
            exampleUrl:         item.exampleUrl,
            exampleAnchor:      item.exampleAnchor,
            domainRating:       item.domainRating,
            traffic:            item.traffic,
            language:           item.language,
            competitors:        JSON.stringify(evidence),
            linksToCompetitors: competitorLinkTotal(evidence),
            ...authorPatch(author, { isCreate: true }),
          },
          select: PROSPECT_RESULT,
        }))
      }
    } catch (err) {
      // P2002 = lo creó otra importación entre la lectura y el insert. No frena el
      // lote: la fila está, sólo le falta la evidencia de este competidor.
      if (err.code === 'P2002') skipped.push({ value: item.domain, reason: 'ya_cargado' })
      else throw err
    }
  }

  return {
    ...summary,
    dryRun: false,
    importBatch,
    createdCount: created.length,
    mergedCount:  merged.length,
    created:      created.slice(0, MAX_PREVIEW),
    merged:       merged.slice(0, MAX_PREVIEW),
    skippedCount: skipped.length,
    skipped:      skipped.slice(0, MAX_SKIPPED_DETAIL),
  }
}

const PROSPECT_RESULT = {
  id: true, domain: true, linksToCompetitors: true, domainRating: true, alreadyLinked: true, verdict: true,
}

/**
 * La evidencia del competidor se REEMPLAZA, no se suma: así re-importar el mismo
 * archivo deja el mismo número. Con un contador plano, importar dos veces el
 * export de un competidor duplicaba la señal de prioridad del dominio.
 */
function mergeEvidence(previous, item, competitor) {
  const evidence = competitor
    ? mergeCompetitorEvidence(previous.competitors, { domain: competitor, links: item.links })
    : parseCompetitors(previous.competitors)
  return {
    competitors:        JSON.stringify(evidence),
    linksToCompetitors: competitorLinkTotal(evidence),
  }
}

function fillMissing(previous, item) {
  const patch = {}
  for (const key of ['exampleUrl', 'exampleAnchor', 'domainRating', 'traffic', 'language']) {
    if (previous[key] == null && item[key] != null) patch[key] = item[key]
  }
  return patch
}

function authorPatch(author, { isCreate = false } = {}) {
  const data = {
    updatedById:        author?.userId ?? null,
    updatedByAgentId:   author?.agentId ?? null,
    updatedByAgentName: author?.agentName ?? null,
  }
  if (isCreate) {
    data.createdById        = author?.userId ?? null
    data.createdByAgentId   = author?.agentId ?? null
    data.createdByAgentName = author?.agentName ?? null
  }
  return data
}

function prospectPreview(row) {
  return {
    domain:        row.domain,
    links:         row.links,
    domainRating:  row.domainRating,
    traffic:       row.traffic,
    exampleAnchor: row.exampleAnchor,
  }
}

// Cuántas filas del resultado se devuelven. El preview no necesita las 500 para
// que alguien decida si el archivo es el correcto.
const MAX_PREVIEW = 50
const MAX_SKIPPED_DETAIL = 50

const SOURCE_BY_FORMAT = {
  ahrefs:  'csv_ahrefs',
  semrush: 'csv_semrush',
  gsc:     'csv_gsc',
}

function previewRow(row) {
  return {
    sourceUrl:    row.sourceUrl,
    sourceDomain: row.sourceDomain,
    anchor:       row.anchor,
    linkType:     row.linkType,
    domainRating: row.domainRating,
    verifiable:   row.verifiable,
  }
}

module.exports = { importBacklinks, MAX_PREVIEW, MAX_SKIPPED_DETAIL }
