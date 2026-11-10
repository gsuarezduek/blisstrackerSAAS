// Importación inicial del blog: traer lo que YA está publicado y crear la pieza
// correspondiente, para no cargar a mano 65 notas que el sitio ya conoce.
//
// Dos fuentes, por orden de preferencia:
//   1. La API de WordPress (/wp-json/wp/v2/posts) — trae el título real, la
//      fecha de publicación y, con Polylang instalado, el idioma y las
//      traducciones. Es lo que hay que usar cuando el sitio es WordPress.
//   2. El sitemap — funciona con cualquier CMS, pero sólo trae URLs: el título
//      sale del slug y el idioma, del prefijo de la ruta.
//
// Lo importado NO es una copia del contenido: la pieza queda con su URL, su
// título y su fecha. El texto de la nota vive en el sitio, y duplicarlo acá
// sería tener dos versiones de lo mismo envejeciendo por separado.

const prisma = require('../lib/prisma')
const { fetchPublicUrl } = require('../lib/safeUrl')
const { dateStringInTz } = require('../utils/dates')
const { isValidLanguage } = require('../lib/contentCatalog')
const {
  normalizeUrl, languageFromUrl, titleFromUrl, parseSitemap, normalizeWpPosts,
} = require('../lib/contentSeo')

const WP_PER_PAGE    = 100
const WP_MAX_PAGES   = 10  // 1000 entradas: más que cualquier blog de cliente
const SITEMAP_MAX_CHILDREN = 10 // un índice de sitemaps grande no se baja entero
const MAX_IMPORT     = 500 // tope de piezas creadas por corrida
// Tope de la lista de salteadas que viaja en la respuesta. El CONTEO es exacto;
// lo que se recorta es el detalle: un índice de sitemaps puede traer 20.000 URLs
// y una respuesta con 19.500 líneas de "ya cargada" no la lee nadie.
const MAX_SKIPPED_DETAIL = 100
const FETCH_TIMEOUT  = 15000
const USER_AGENT     = 'BlissTrackerBot/1.0 (+https://blisstracker.app)'

function err(message, httpStatus, code) {
  return Object.assign(new Error(message), { httpStatus, code })
}

function get(url, opts = {}) {
  return fetchPublicUrl(url, {
    timeout: FETCH_TIMEOUT,
    headers: { 'User-Agent': USER_AGENT },
    validateStatus: s => s >= 200 && s < 300,
    ...opts,
  })
}

/** Raíz del sitio a partir de lo que haya: lo que mandaron o el sitio del proyecto. */
function siteRoot(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withProtocol)
    return `${u.protocol}//${u.host}`
  } catch { return null }
}

// ── WordPress ───────────────────────────────────────────────────────────────

/**
 * Entradas publicadas desde /wp-json/wp/v2/posts, paginando con el header
 * `x-wp-totalpages` que devuelve la propia API.
 */
async function fetchWordpressPosts(root) {
  const posts = []
  let totalPages = 1

  for (let page = 1; page <= Math.min(totalPages, WP_MAX_PAGES); page++) {
    const url = `${root}/wp-json/wp/v2/posts?per_page=${WP_PER_PAGE}&page=${page}&status=publish&_fields=id,link,title,date,date_gmt,lang,translations`
    let res
    try {
      res = await get(url)
    } catch (e) {
      // El primer intento es el que decide si el sitio tiene la API abierta;
      // un fallo en la página 4 no tiene por qué perder las 3 primeras.
      if (page === 1) {
        throw err(
          'No se pudo leer /wp-json/wp/v2/posts. Verificá que el sitio sea WordPress y que la API REST esté habilitada, o importá desde el sitemap.',
          400, 'WP_API_UNAVAILABLE',
        )
      }
      break
    }
    if (page === 1) {
      const header = Number(res.headers?.['x-wp-totalpages'])
      if (Number.isInteger(header) && header > 0) totalPages = header
    }
    const batch = normalizeWpPosts(res.data)
    posts.push(...batch)
    if (batch.length < WP_PER_PAGE) break
  }

  return posts
}

// ── Sitemap ─────────────────────────────────────────────────────────────────

/**
 * URLs de un sitemap, siguiendo un índice un nivel (que es como está armado
 * cualquier sitemap de WordPress/Yoast: un índice y un sitemap por tipo).
 */
async function fetchSitemapUrls(sitemapUrl) {
  let res
  try {
    res = await get(sitemapUrl, { responseType: 'text' })
  } catch {
    throw err(`No se pudo leer el sitemap (${sitemapUrl}).`, 400, 'SITEMAP_UNAVAILABLE')
  }

  const { urls, sitemaps } = parseSitemap(res.data)
  if (urls.length > 0 || sitemaps.length === 0) return urls

  const children = sitemaps.slice(0, SITEMAP_MAX_CHILDREN)
  const results = await Promise.all(children.map(async child => {
    try {
      const r = await get(child, { responseType: 'text' })
      return parseSitemap(r.data).urls
    } catch { return [] } // un sitemap hijo caído no invalida el resto
  }))
  return results.flat()
}

// ── Importación ─────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {'wordpress'|'sitemap'} opts.source
 * @param {string?} opts.url     — raíz del sitio (wordpress) o URL del sitemap. Sin
 *                                 esto se usa el sitio configurado en el proyecto.
 * @param {string?} opts.filter  — sólo las URLs que contengan este texto (ej. "/blog/")
 * @param {string?} opts.defaultLanguage — idioma de las URLs sin prefijo de ruta
 * @param {boolean} opts.dryRun  — devuelve qué se importaría, sin crear nada
 * @returns {{ created:Array, skipped:Array, total:number, dryRun:boolean }}
 */
async function importPublishedPieces({
  projectId, workspaceId, userId, source, url, filter, defaultLanguage = null, dryRun = false,
}) {
  const project = await prisma.project.findFirst({
    where:  { id: projectId, workspaceId },
    select: { websiteUrl: true, timezone: true },
  })
  if (!project) throw err('Proyecto no encontrado', 404)

  const root = siteRoot(url || project.websiteUrl)
  if (!root) {
    throw err(
      'No hay sitio web configurado en el proyecto. Cargalo en la ficha → Ajustes, o indicá la URL en la importación.',
      400, 'NO_SITE_URL',
    )
  }

  // Entradas de la fuente elegida, ya en una forma común.
  let entries
  if (source === 'wordpress') {
    entries = (await fetchWordpressPosts(root)).map(p => ({
      url: p.url, title: p.title, date: p.date, lang: p.lang, wpId: p.wpId, translations: p.translations,
    }))
  } else {
    const sitemapUrl = /sitemap|\.xml$/i.test(String(url ?? '')) ? url : `${root}/sitemap.xml`
    entries = (await fetchSitemapUrls(sitemapUrl)).map(u => ({
      url: u.url, title: titleFromUrl(u.url), date: u.lastmod, lang: null, wpId: null, translations: null,
    }))
  }

  if (filter) {
    const needle = String(filter).trim().toLowerCase()
    if (needle) entries = entries.filter(e => e.url.toLowerCase().includes(needle))
  }

  // Lo que ya está cargado no se vuelve a crear — una importación se corre más
  // de una vez (el blog sigue publicando) y tiene que ser idempotente.
  const existing = await prisma.contentPiece.findMany({
    where:  { projectId, workspaceId, deletedAt: null, publishedUrl: { not: null } },
    select: { id: true, publishedUrl: true },
  })
  const known = new Set(existing.map(p => normalizeUrl(p.publishedUrl)))

  const seen = new Set()
  const toCreate = []
  const skipped = []
  let skippedCount = 0
  const skip = (url, reason) => {
    skippedCount++
    if (skipped.length < MAX_SKIPPED_DETAIL) skipped.push({ url, reason })
  }

  for (const entry of entries) {
    const key = normalizeUrl(entry.url)
    if (seen.has(key)) continue
    seen.add(key)
    if (known.has(key)) { skip(entry.url, 'ya_cargada'); continue }
    if (toCreate.length >= MAX_IMPORT) { skip(entry.url, 'tope'); continue }

    // El idioma declarado por el CMS (Polylang) manda sobre el deducido del
    // prefijo de la ruta: el sitio sabe en qué idioma escribió, la ruta es una
    // pista. Si declara uno que no está en el catálogo, se cae a la ruta.
    const language = isValidLanguage(entry.lang)
      ? entry.lang
      : languageFromUrl(entry.url, defaultLanguage)

    const date = entry.date ? new Date(entry.date) : null
    const publishedAt = date && !Number.isNaN(date.getTime()) ? date : null

    toCreate.push({
      url:   entry.url,
      title: (entry.title || titleFromUrl(entry.url)).slice(0, 200),
      language,
      publishedAt,
      wpId:  entry.wpId,
      translations: entry.translations,
    })
  }

  if (dryRun) {
    return {
      dryRun: true,
      total: entries.length,
      created: toCreate.map(c => ({ url: c.url, title: c.title, language: c.language, publishedAt: c.publishedAt })),
      skipped,
      skippedCount,
    }
  }

  // Se crean de a una (y no con createMany) porque hace falta el id de cada
  // pieza: para el log de estado y para vincular las traducciones.
  const created = []
  const byWpId = new Map()
  for (const item of toCreate) {
    const piece = await prisma.contentPiece.create({
      data: {
        projectId, workspaceId,
        title:    item.title,
        status:   'publicado',
        types:    JSON.stringify(['articulo']),
        networks: JSON.stringify(['blog']),
        language: item.language,
        publishedUrl: item.url,
        publishedAt:  item.publishedAt,
        // La fecha de publicación también va a scheduledAt/scheduledDate: la
        // navegación de Contenido es por mes, y una pieza sin fecha cae toda
        // junta en "Sin programar" — 65 notas importadas ahí no son un
        // inventario, son una pila.
        scheduledAt:   item.publishedAt,
        scheduledDate: item.publishedAt ? dateStringInTz(item.publishedAt, project.timezone) : null,
        approvedAt:    item.publishedAt, // ya salió: no está esperando aprobación de nadie
        createdById:   userId ?? null,
      },
      select: { id: true, title: true, publishedUrl: true, language: true, publishedAt: true },
    })
    created.push(piece)
    if (item.wpId) byWpId.set(item.wpId, { pieceId: piece.id, translations: item.translations })
  }

  if (created.length > 0) {
    await prisma.contentStatusEvent.createMany({
      data: created.map(p => ({
        pieceId: p.id, workspaceId, action: 'created', toStatus: 'publicado',
        actorUserId: userId ?? null, comment: 'Importada del sitio',
      })),
    })
  }

  const linkedGroups = await linkWordpressTranslations(byWpId)

  return { dryRun: false, total: entries.length, created, skipped, skippedCount, linkedGroups }
}

/**
 * Vincula como traducciones las piezas que WordPress declara como tales
 * (Polylang expone `translations: { es: 12, en: 34 }` en cada entrada).
 * Best-effort: sin Polylang el campo no viene y las traducciones se vinculan a
 * mano desde la ficha de la pieza — no vale la pena adivinarlas por el slug,
 * que en una traducción decente está traducido.
 */
async function linkWordpressTranslations(byWpId) {
  if (byWpId.size === 0) return 0

  const assigned = new Map() // wpId → groupId
  let groups = 0

  for (const [wpId, { translations }] of byWpId) {
    if (!translations || assigned.has(wpId)) continue
    const siblings = Object.values(translations)
      .filter(id => Number.isInteger(id) && byWpId.has(id))
    if (siblings.length < 2) continue // una entrada sola no es un grupo

    const groupId = `wp-${wpId}-${Date.now().toString(36)}`
    for (const id of siblings) assigned.set(id, groupId)
    if (!assigned.has(wpId)) assigned.set(wpId, groupId)
    groups++
  }

  for (const [wpId, groupId] of assigned) {
    const entry = byWpId.get(wpId)
    if (!entry) continue
    await prisma.contentPiece.update({
      where: { id: entry.pieceId },
      data:  { translationGroupId: groupId },
    }).catch(() => {}) // vincular es un extra: no puede hacer fallar la importación
  }

  return groups
}

module.exports = { importPublishedPieces, siteRoot, MAX_IMPORT }
