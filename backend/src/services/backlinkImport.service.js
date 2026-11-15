const crypto = require('crypto')
const prisma = require('../lib/prisma')
const { parseBacklinkCsv } = require('../lib/backlinksCsv')

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
  projectId, workspaceId, author, csv, format = 'auto', target = 'own', dryRun = false,
}) {
  const parsed = parseBacklinkCsv(csv, { format, target })
  if (parsed.error) {
    const err = new Error(parsed.error)
    err.status = 400
    err.code = 'CSV_UNREADABLE'
    err.unmappedHeaders = parsed.unmappedHeaders
    throw err
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
