const cheerio = require('cheerio')
const prisma = require('../lib/prisma')
const { fetchPublicUrl } = require('../lib/safeUrl')
const { MARKETING_PROJECT_WHERE } = require('../lib/projectModules')
const { extractDomain } = require('./serpApi.service')
const { checkVerdict, nextLinkState, linkTypeFromRel, normalizeLinkUrl } = require('../lib/backlinks')

// Mismo UA que el crawler de GEO y On-Page: identificable a propósito, para que un
// sitio que no quiera que lo visitemos pueda bloquearnos por nombre.
const UA = 'BlissTrackerBot/1.0 (+https://blisstracker.app)'

// Cuántos enlaces entran en UNA corrida. Un proyecto de 400 enlaces se cubre en 4
// corridas: se priorizan los que nunca se chequearon y después el `lastCheckedAt`
// más viejo, que es un round-robin natural sin guardar ningún cursor.
const MAX_LINKS_PER_RUN = 100

// De a 5 y no los 100 de una. `checkBrokenLinks` de On-Page puede hacer 25 en
// paralelo porque son 25; 100 fetches simultáneos desde el mismo proceso compiten
// con el tráfico HTTP que el backend está sirviendo.
const CONCURRENCY = 5
const TIMEOUT_MS = 10_000

// El verificador hace tráfico a sitios de terceros con nuestro nombre, así que no
// se corre a demanda sin freno. 6h permite "lo arreglé, verificá de nuevo" en la
// misma jornada sin volverlo un botón de spam.
const MIN_VERIFY_INTERVAL_MS = 6 * 60 * 60 * 1000

// Un verify por proyecto a la vez, en memoria del proceso (mismo criterio que
// contentSeoStats.service.js y los locks de los crons: una sola instancia).
const running = new Map()

/** Progreso en vivo: se escribe en `errorMsg` mientras el job corre (patrón OnPageAudit). */
async function setStep(jobId, step) {
  await prisma.backlinkJob.update({ where: { id: jobId }, data: { errorMsg: step } }).catch(() => {})
}

/**
 * Chequea UN enlace y devuelve el resultado crudo, sin tocar la base.
 *
 * Qué mira, y por qué cada cosa:
 *  - El `<a href>` hacia nuestro dominio: es la única prueba de que el enlace sigue
 *    puesto. Un 200 que carga y ya no lo tiene es la pérdida real más común, y por
 *    eso no alcanza con mirar el status code.
 *  - El `rel`: decide si transmite autoridad. Un enlace que pasó a `nofollow` sigue
 *    existiendo pero dejó de servir para lo que se consiguió.
 *  - El `noindex` de la página: un enlace en una página desindexada no transmite
 *    nada. No cambia el estado (el enlace está), se informa.
 *  - La URL final del redirect chain: distingue "el sitio se mudó" de "ya no nos
 *    enlaza".
 */
async function checkOneBacklink(link, ownDomain) {
  const started = Date.now()
  let res
  try {
    res = await fetchPublicUrl(link.sourceUrl, {
      timeout: TIMEOUT_MS,
      headers: { 'User-Agent': UA },
      // Un 404 o un 403 son DATO, no excepción: el estado del enlace depende de
      // poder distinguirlos. Mismo criterio que checkBrokenLinks de On-Page.
      validateStatus: () => true,
    })
  } catch (err) {
    // Acá caen DNS que no resuelve, timeout, TLS roto y una URL que dejó de ser
    // pública (assertPublicUrl). Ninguna es evidencia de que el enlace se cayó.
    return {
      status: 'error', found: false, httpStatus: null,
      errorMsg: String(err.message || 'No se pudo acceder').slice(0, 200),
      durationMs: Date.now() - started,
    }
  }

  const httpStatus = res.status
  const finalHost = hostOf(res.finalUrl)
  const base = { httpStatus, durationMs: Date.now() - started }

  // 403/429 ni se parsean: el HTML que devuelve un sitio que nos bloquea es su
  // página de bloqueo, y buscarle un enlace adentro no dice nada.
  if (httpStatus === 403 || httpStatus === 429) {
    return { ...base, status: 'bloqueado', found: false }
  }
  if (httpStatus >= 400) {
    return { ...base, status: 'roto', found: false }
  }

  const html = typeof res.data === 'string' ? res.data : ''
  const hit = findLinkToUs(html, res.finalUrl || link.sourceUrl, ownDomain)
  const noindex = hasNoindex(html)
  const redirectedToHost = finalHost && finalHost !== hostOf(link.sourceUrl) ? finalHost : null

  return {
    ...base,
    status: checkVerdict({ found: !!hit, httpStatus, redirectedToHost, ownDomain }),
    found:  !!hit,
    anchor: hit?.anchor ?? null,
    rel:    hit?.rel ?? null,
    linkType: hit ? linkTypeFromRel(hit.rel) : null,
    targetUrl: hit?.targetUrl ?? null,
    noindex,
    redirectedTo: redirectedToHost ? res.finalUrl : null,
  }
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, '') } catch { return null }
}

function hasNoindex(html) {
  if (!html) return false
  const $ = cheerio.load(html)
  const metas = $('meta[name="robots"], meta[name="googlebot"]').map((_, el) => $(el).attr('content') || '').get()
  return metas.some(c => /noindex/i.test(c))
}

/**
 * Busca el primer `<a href>` que apunte a nuestro dominio. Resuelve cada href
 * contra la URL de la página, así los enlaces relativos y los protocol-relative
 * (`//cliente.com/x`) también cuentan.
 *
 * El anchor cae al `alt` de la imagen cuando el enlace es una imagen: un logo
 * enlazado es un backlink válido y su anchor efectivo es ese alt.
 */
function findLinkToUs(html, pageUrl, ownDomain) {
  if (!html || !ownDomain) return null
  const $ = cheerio.load(html)
  let hit = null

  $('a[href]').each((_, el) => {
    if (hit) return false
    const href = $(el).attr('href')
    if (!href) return
    let abs
    try { abs = new URL(href, pageUrl) } catch { return }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return

    const host = abs.host.toLowerCase().replace(/^www\./, '')
    const own = String(ownDomain).toLowerCase().replace(/^www\./, '')
    if (host !== own && !host.endsWith(`.${own}`)) return

    const text = $(el).text().replace(/\s+/g, ' ').trim()
    const alt = $(el).find('img').attr('alt')
    hit = {
      targetUrl: normalizeLinkUrl(abs.toString()).url || abs.toString(),
      anchor:    (text || alt || '').slice(0, 200) || null,
      rel:       $(el).attr('rel') || null,
    }
    return false
  })

  return hit
}

/** Los enlaces que entran en esta corrida: primero los que nunca se chequearon. */
function pickLinks(projectId) {
  return prisma.backlink.findMany({
    where: {
      projectId,
      verifiable: true,
      // Un estado confirmado a mano no se vuelve a tocar: es la salida para los
      // enlaces que el sitio inyecta por JS y cheerio no puede ver.
      statusLockedAt: null,
    },
    orderBy: [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }],
    take: MAX_LINKS_PER_RUN,
    select: { id: true, sourceUrl: true, status: true, checkFailures: true, lostAt: true },
  })
}

/** Aplica el resultado de un chequeo: la fila cacheada + el historial append-only. */
async function persistCheck(link, check, projectId) {
  const next = nextLinkState(link, check)

  await prisma.backlinkCheck.create({
    data: {
      backlinkId: link.id, projectId,
      status: check.status, httpStatus: check.httpStatus ?? null, found: !!check.found,
      anchor: check.anchor ?? null, rel: check.rel ?? null, linkType: check.linkType ?? null,
      targetUrl: check.targetUrl ?? null, noindex: !!check.noindex,
      redirectedTo: check.redirectedTo ?? null, errorMsg: check.errorMsg ?? null,
      durationMs: check.durationMs ?? null,
    },
  })

  const data = {
    status: next.status,
    checkFailures: next.checkFailures,
    lostAt: next.lostAt,
    lastCheckedAt: new Date(),
    lastStatusCode: check.httpStatus ?? null,
    sourceNoindex: !!check.noindex,
  }
  // Lo que el verificador LEYÓ gana sobre lo que alguien declaró al cargar: leyó
  // la página en vivo. El valor anterior no se pierde, queda en el chequeo previo.
  if (check.found) {
    data.anchor = check.anchor
    data.linkType = check.linkType
    if (check.targetUrl) data.targetUrl = check.targetUrl
  }

  await prisma.backlink.update({ where: { id: link.id }, data })
  return { changed: next.status !== link.status, lost: next.status !== link.status && !!next.lostAt }
}

/** Corre la verificación completa de un proyecto (el cuerpo del job). */
async function runVerification(jobId, workspaceId, projectId) {
  running.set(projectId, jobId)
  try {
    await prisma.backlinkJob.update({
      where: { id: jobId },
      data: { status: 'running', errorMsg: 'Buscando enlaces para verificar…' },
    })

    const [project, links] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { websiteUrl: true } }),
      pickLinks(projectId),
    ])
    const ownDomain = extractDomain(project?.websiteUrl)

    // Sin URL del proyecto no hay con qué comparar los href: cualquier enlace
    // daría "no encontrado" y perderíamos el inventario entero.
    if (!ownDomain) {
      await prisma.backlinkJob.update({
        where: { id: jobId },
        data: { status: 'failed', errorMsg: 'El proyecto no tiene una URL configurada, así que no se puede saber qué enlace apunta a él.' },
      })
      return
    }

    let checked = 0, changed = 0, lost = 0
    for (let i = 0; i < links.length; i += CONCURRENCY) {
      const chunk = links.slice(i, i + CONCURRENCY)
      await setStep(jobId, `Verificando ${i + 1}-${Math.min(i + chunk.length, links.length)} de ${links.length}…`)
      const results = await Promise.all(chunk.map(async link => {
        try {
          const check = await checkOneBacklink(link, ownDomain)
          return await persistCheck(link, check, projectId)
        } catch (err) {
          // Un enlace que explota no corta la corrida: el resto se sigue
          // verificando (mismo criterio que el catch por prompt de GEO Visibility).
          console.error(`[backlinkVerifier] enlace ${link.id} falló: ${err.message}`)
          return { changed: false, lost: false }
        }
      }))
      checked += chunk.length
      changed += results.filter(r => r.changed).length
      lost    += results.filter(r => r.lost).length
    }

    await prisma.backlinkJob.update({
      where: { id: jobId },
      data: { status: 'completed', checked, changed, lost, errorMsg: null },
    })
  } catch (err) {
    console.error('[backlinkVerifier] corrida fallida:', err)
    await prisma.backlinkJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMsg: String(err.message || 'Error inesperado').slice(0, 500) },
    }).catch(() => {})
  } finally {
    running.delete(projectId)
  }
}

/**
 * Arranca una verificación. Devuelve `{ jobId }` o `{ skipped, reason }` — el
 * controller traduce el motivo a 429 (cooldown) o 409 (ya está corriendo).
 *
 * `autorun: false` crea el job pero NO lo dispara: lo usa el cron, que necesita
 * esperar a que cada proyecto termine antes de arrancar el siguiente (con el
 * setImmediate correrían todos en paralelo y el tope de concurrencia por proyecto
 * no serviría de nada).
 */
async function startVerification({ projectId, workspaceId, force = false, autorun = true }) {
  if (running.has(projectId)) {
    return { skipped: true, reason: 'running', jobId: running.get(projectId) }
  }

  if (!force) {
    const last = await prisma.backlinkJob.findFirst({
      where:   { projectId, kind: 'verify', status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select:  { createdAt: true },
    })
    if (last) {
      const elapsed = Date.now() - new Date(last.createdAt).getTime()
      if (elapsed < MIN_VERIFY_INTERVAL_MS) {
        return { skipped: true, reason: 'cooldown', waitMinutes: Math.ceil((MIN_VERIFY_INTERVAL_MS - elapsed) / 60000) }
      }
    }
  }

  const pending = await prisma.backlink.count({ where: { projectId, verifiable: true, statusLockedAt: null } })
  if (!pending) return { skipped: true, reason: 'no_links' }

  const job = await prisma.backlinkJob.create({
    data: { workspaceId, projectId, kind: 'verify', status: 'pending' },
  })
  if (autorun) setImmediate(() => runVerification(job.id, workspaceId, projectId))
  return { jobId: job.id }
}

/**
 * Cron: verifica todos los proyectos con enlaces cargados. Secuencial a
 * propósito — el tope de concurrencia es por proyecto, y 20 proyectos en paralelo
 * serían 100 fetches simultáneos.
 */
async function verifyAllProjects({ force = false } = {}) {
  const projects = await prisma.project.findMany({
    where: {
      active: true,
      ...MARKETING_PROJECT_WHERE,
      websiteUrl: { not: null },
      backlinks:  { some: { verifiable: true, statusLockedAt: null } },
    },
    select: { id: true, workspaceId: true, name: true },
  })

  let ok = 0, skipped = 0
  for (const p of projects) {
    try {
      const res = await startVerification({ projectId: p.id, workspaceId: p.workspaceId, force, autorun: false })
      if (res.jobId) {
        await runVerification(res.jobId, p.workspaceId, p.id)
        ok++
      } else {
        skipped++
      }
    } catch (err) {
      console.error(`[backlinkVerifier] proyecto ${p.name} falló:`, err.message)
    }
  }
  console.log(`[backlinkVerifier] verificados ${ok} proyecto(s), ${skipped} salteado(s) de ${projects.length}`)
  return { total: projects.length, ok, skipped }
}

module.exports = {
  checkOneBacklink,
  findLinkToUs,
  hasNoindex,
  runVerification,
  startVerification,
  verifyAllProjects,
  setStep,
  MAX_LINKS_PER_RUN,
  MIN_VERIFY_INTERVAL_MS,
  CONCURRENCY,
}
