const axios     = require('axios')
const cheerio   = require('cheerio')
const prisma    = require('../lib/prisma')
const { logTokens } = require('../lib/logTokens')

const { anthropic } = require('../lib/claude')

const MAX_PAGES      = 15   // páginas a crawlear como máximo
const MAX_LINK_CHECK = 25   // enlaces internos a chequear por roto (además de las páginas crawleadas)
const UA = 'BlissTrackerBot/1.0 (+https://blisstracker.app)'

// ─── Helpers de URL ────────────────────────────────────────────────────────────

// Normaliza un href a URL absoluta del mismo origen; devuelve null si es externo/invalido.
function normalizeInternal(href, base, origin) {
  if (!href) return null
  const h = href.trim()
  if (!h || h.startsWith('#') || h.startsWith('mailto:') || h.startsWith('tel:') || h.startsWith('javascript:')) return null
  let u
  try { u = new URL(h, base) } catch { return null }
  if (u.origin !== origin) return null
  if (!/^https?:$/.test(u.protocol)) return null
  // Ignorar assets no-HTML por extensión
  if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|mp3|css|js|xml|json)$/i.test(u.pathname)) return null
  u.hash = ''
  u.search = ''
  let s = u.href
  if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1)
  return s
}

// ─── Extracción on-page de una página ──────────────────────────────────────────

function extractOnPage(html, url, origin) {
  const $ = cheerio.load(html)

  const title       = $('title').first().text().trim()
  const description = ($('meta[name="description"]').attr('content') ?? '').trim()
  const canonical   = !!$('link[rel="canonical"]').attr('href')
  const robotsMeta  = $('meta[name="robots"], meta[name="googlebot"]').map((_, el) => $(el).attr('content') ?? '').get().join(',')
  const noindex     = /noindex/i.test(robotsMeta)

  const h1Nodes = $('h1')
  const h1Count = h1Nodes.length
  const h1Text  = h1Nodes.first().text().trim()

  // Imágenes sin alt (alt ausente o vacío)
  let imgNoAlt = 0
  const imgTotal = $('img').length
  $('img').each((_, el) => {
    const alt = $(el).attr('alt')
    if (alt == null || alt.trim() === '') imgNoAlt++
  })

  // Enlaces internos
  const internalLinks = new Set()
  let externalLinks = 0
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    const norm = normalizeInternal(href, url, origin)
    if (norm) internalLinks.add(norm)
    else if (href && /^https?:\/\//i.test(href)) externalLinks++
  })

  // Word count sobre el texto del body (sin scripts/estilos)
  $('script, style, noscript, template').remove()
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
  const wordCount = bodyText ? bodyText.split(' ').length : 0

  return {
    url,
    status: 200,
    title, titleLen: title.length,
    description, descLen: description.length,
    canonical, noindex,
    h1Count, h1Text,
    imgTotal, imgNoAlt,
    externalLinks,
    internalLinks: [...internalLinks].slice(0, 150),
    wordCount,
  }
}

// ─── Evaluación de issues por página ───────────────────────────────────────────

const WEIGHT = { high: 25, medium: 12, low: 5 }

function pageIssues(p) {
  const out = []
  if (p.error) { out.push({ code: 'fetch_error', sev: 'high', msg: `No se pudo cargar (HTTP ${p.status || '?'})` }); return out }
  if (p.noindex)          out.push({ code: 'noindex',       sev: 'medium', msg: 'La página tiene meta robots noindex' })
  if (!p.title)           out.push({ code: 'missing_title', sev: 'high',   msg: 'Sin etiqueta <title>' })
  else if (p.titleLen < 30) out.push({ code: 'title_short', sev: 'low',    msg: `Title corto (${p.titleLen} caracteres)` })
  else if (p.titleLen > 60) out.push({ code: 'title_long',  sev: 'low',    msg: `Title largo (${p.titleLen} caracteres)` })
  if (!p.description)      out.push({ code: 'missing_desc',  sev: 'medium', msg: 'Sin meta description' })
  else if (p.descLen < 50)  out.push({ code: 'desc_short',  sev: 'low',    msg: `Meta description corta (${p.descLen})` })
  else if (p.descLen > 160) out.push({ code: 'desc_long',   sev: 'low',    msg: `Meta description larga (${p.descLen})` })
  if (p.h1Count === 0)    out.push({ code: 'h1_missing',    sev: 'high',   msg: 'Sin encabezado H1' })
  else if (p.h1Count > 1) out.push({ code: 'h1_multiple',   sev: 'medium', msg: `${p.h1Count} H1 (debería haber uno solo)` })
  if (p.imgNoAlt > 0)     out.push({ code: 'img_no_alt',    sev: 'low',    msg: `${p.imgNoAlt} de ${p.imgTotal} imágenes sin alt` })
  if (!p.canonical)       out.push({ code: 'no_canonical',  sev: 'low',    msg: 'Sin enlace canonical' })
  if (p.wordCount < 300)  out.push({ code: 'thin',          sev: 'medium', msg: `Contenido escaso (${p.wordCount} palabras)` })
  return out
}

function pageScore(issues) {
  const penalty = issues.reduce((s, i) => s + (WEIGHT[i.sev] || 0), 0)
  return Math.max(0, 100 - penalty)
}

// Metadata para armar los findings agregados por código de issue
const CODE_META = {
  fetch_error:   { category: 'Rastreo',    title: 'Páginas que no cargan',              action: 'Revisá que las URLs devuelvan HTTP 200 (arreglá 404/500 o redirecciones rotas).' },
  missing_title: { category: 'Meta',       title: 'Páginas sin title',                  action: 'Escribí un <title> único de 30-60 caracteres con la keyword principal.' },
  title_short:   { category: 'Meta',       title: 'Titles demasiado cortos',            action: 'Ampliá el title a 30-60 caracteres aprovechando el espacio en el SERP.' },
  title_long:    { category: 'Meta',       title: 'Titles demasiado largos',            action: 'Acortá el title a ≤60 caracteres para que no se trunque en Google.' },
  missing_desc:  { category: 'Meta',       title: 'Páginas sin meta description',       action: 'Escribí una meta description de 50-160 caracteres que invite al clic.' },
  desc_short:    { category: 'Meta',       title: 'Meta descriptions cortas',           action: 'Ampliá la meta description a 50-160 caracteres.' },
  desc_long:     { category: 'Meta',       title: 'Meta descriptions largas',           action: 'Acortá la meta description a ≤160 caracteres.' },
  h1_missing:    { category: 'Estructura', title: 'Páginas sin H1',                     action: 'Agregá un único H1 descriptivo con la keyword principal.' },
  h1_multiple:   { category: 'Estructura', title: 'Páginas con más de un H1',           action: 'Dejá un solo H1 por página; convertí el resto en H2/H3.' },
  img_no_alt:    { category: 'Imágenes',   title: 'Imágenes sin texto alternativo',     action: 'Agregá alt descriptivo a las imágenes (accesibilidad + SEO de imágenes).' },
  no_canonical:  { category: 'Técnico',    title: 'Páginas sin canonical',              action: 'Agregá <link rel="canonical"> apuntando a la URL preferida.' },
  thin:          { category: 'Contenido',  title: 'Contenido escaso (thin content)',    action: 'Ampliá el contenido a ≥300 palabras con información útil y original.' },
  noindex:       { category: 'Indexación', title: 'Páginas con noindex',                action: 'Verificá que el noindex sea intencional; si no, quitalo para que Google indexe la página.' },
}
const SEV_ORDER = { high: 0, medium: 1, low: 2 }

// ─── Chequeo de enlaces rotos (bounded) ────────────────────────────────────────

async function checkBrokenLinks(links) {
  const broken = []
  const slice = links.slice(0, MAX_LINK_CHECK)
  await Promise.all(slice.map(async (url) => {
    try {
      const res = await axios.get(url, { timeout: 8000, maxRedirects: 5, headers: { 'User-Agent': UA }, validateStatus: () => true })
      if (res.status >= 400) broken.push({ url, status: res.status })
    } catch { /* error transitorio/red — no lo reportamos como roto */ }
  }))
  return broken
}

// ─── Sugerencias de enlazado interno (IA) ──────────────────────────────────────

async function suggestInternalLinks(pages, projectName, workspaceId, userId) {
  const inventory = pages
    .filter(p => !p.error)
    .map(p => ({ url: p.url, title: p.title || p.h1Text || '(sin título)' }))
    .slice(0, MAX_PAGES)
  if (inventory.length < 3) return { suggestions: [], usage: null }

  const prompt = `Sos un especialista en SEO. Este es el inventario de páginas de un sitio ("${projectName}"):

${inventory.map((p, i) => `${i + 1}. ${p.title} — ${p.url}`).join('\n')}

Sugerí oportunidades de ENLAZADO INTERNO: pares de páginas donde tenga sentido que una enlace a la otra por relación temática, para repartir autoridad y mejorar la navegación. No inventes páginas fuera del inventario.

Respondé SOLO con un JSON válido (máximo 8 sugerencias), sin markdown:
{ "suggestions": [ { "from": "URL origen", "to": "URL destino", "anchor": "texto ancla sugerido", "reason": "por qué tiene sentido (1 oración)" } ] }`

  const res = await anthropic.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages:   [{ role: 'user', content: prompt }],
  })
  let parsed = { suggestions: [] }
  try {
    const raw = res.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    parsed = JSON.parse(raw)
  } catch { /* si la IA no devolvió JSON válido, seguimos sin sugerencias */ }
  const valid = new Set(inventory.map(p => p.url))
  const suggestions = (parsed.suggestions || []).filter(s => valid.has(s.from) && valid.has(s.to) && s.from !== s.to).slice(0, 8)
  return { suggestions, usage: res.usage }
}

// ─── Progreso ──────────────────────────────────────────────────────────────────

async function setStep(auditId, step) {
  await prisma.onPageAudit.update({ where: { id: auditId }, data: { errorMsg: step } })
    .catch(err => console.error('[OnPageAudit] Error al actualizar paso:', err.message))
}

// ─── Análisis principal ────────────────────────────────────────────────────────

async function runOnPageAnalysis(auditId, workspaceId, projectId, seedUrl, userId) {
  try {
    await prisma.onPageAudit.update({ where: { id: auditId }, data: { status: 'running', errorMsg: 'Rastreando páginas…' } })

    const origin = new URL(seedUrl).origin

    // URLs prioritarias del brief SEO/SEM (si están) como semillas adicionales
    let priorityUrls = []
    try {
      const brief = await prisma.projectBrief.findUnique({ where: { projectId_type: { projectId, type: 'seo_sem' } }, select: { answers: true } })
      const raw = brief?.answers?.urls_prioritarias
      if (raw && typeof raw === 'string') {
        priorityUrls = raw.split(/[\s,;\n]+/).map(u => normalizeInternal(u, seedUrl, origin)).filter(Boolean)
      }
    } catch {}

    // ── Crawl BFS acotado ──
    const visited = new Set()
    const queue   = [normalizeInternal(seedUrl, seedUrl, origin) || seedUrl, ...priorityUrls]
    const pages   = []

    while (queue.length && pages.length < MAX_PAGES) {
      const next = queue.shift()
      if (!next || visited.has(next)) continue
      visited.add(next)
      try {
        const res = await axios.get(next, { timeout: 15000, maxRedirects: 5, headers: { 'User-Agent': UA }, validateStatus: s => s < 400 })
        const data = extractOnPage(res.data, next, origin)
        pages.push(data)
        for (const link of data.internalLinks) {
          if (!visited.has(link) && queue.length < MAX_PAGES * 3) queue.push(link)
        }
      } catch (err) {
        pages.push({ url: next, error: true, status: err.response?.status || 0, title: '', internalLinks: [] })
      }
    }

    if (pages.length === 0) throw new Error('No se pudo rastrear ninguna página del sitio.')

    // ── Evaluación on-page ──
    await setStep(auditId, 'Analizando factores on-page…')
    const evaluated = pages.map(p => {
      const issues = pageIssues(p)
      return { ...p, issues, score: p.error ? 0 : pageScore(issues) }
    })

    // ── Enlaces rotos (los que descubrimos y no crawleamos) ──
    await setStep(auditId, 'Chequeando enlaces internos…')
    const allInternal = new Set()
    for (const p of evaluated) for (const l of (p.internalLinks || [])) allInternal.add(l)
    const notCrawled = [...allInternal].filter(u => !visited.has(u))
    const broken = await checkBrokenLinks(notCrawled)

    // ── Enlazado interno con IA (si hay presupuesto) ──
    let linkSuggestions = []
    let aiTokens = 0
    try {
      const { hasTokenBudget } = require('../lib/tokenBudget')
      if (await hasTokenBudget(workspaceId)) {
        await setStep(auditId, 'Generando sugerencias de enlazado con IA…')
        const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } })
        const { suggestions, usage } = await suggestInternalLinks(evaluated, project?.name || 'el sitio', workspaceId, userId)
        linkSuggestions = suggestions
        if (usage) {
          await logTokens('onPageAudit', userId, usage, workspaceId)
          aiTokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)
        }
      }
    } catch (err) { console.error('[OnPageAudit] Enlazado IA falló:', err.message) }

    // ── Findings agregados por código ──
    const byCode = {}
    for (const p of evaluated) {
      for (const iss of p.issues) {
        if (!byCode[iss.code]) byCode[iss.code] = { sev: iss.sev, urls: [] }
        byCode[iss.code].urls.push(p.url)
      }
    }
    const findings = Object.entries(byCode).map(([code, { sev, urls }]) => {
      const meta = CODE_META[code] || { category: 'On-Page', title: code, action: '' }
      return {
        severity:    sev,
        category:    meta.category,
        title:       meta.title,
        description: `${urls.length} página(s) afectada(s)${urls.length ? `. Ej: ${urls[0]}` : ''}.`,
        url:         urls[0],
        pages:       urls.length,
        action:      meta.action,
      }
    })
    if (broken.length) {
      findings.push({
        severity: 'high', category: 'Enlaces', title: 'Enlaces internos rotos',
        description: `${broken.length} enlace(s) internos devuelven error. Ej: ${broken[0].url} (HTTP ${broken[0].status}).`,
        url: broken[0].url, pages: broken.length,
        action: 'Corregí o eliminá los enlaces rotos; apuntan a páginas caídas (404/500).',
      })
    }
    findings.sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || (b.pages - a.pages))

    // ── Score global ──
    const okPages = evaluated.filter(p => !p.error)
    const avg = okPages.length ? Math.round(okPages.reduce((s, p) => s + p.score, 0) / okPages.length) : 0
    const errorPenalty = Math.min(20, (evaluated.length - okPages.length) * 8)
    const brokenPenalty = Math.min(10, broken.length * 2)
    const score = Math.max(0, avg - errorPenalty - brokenPenalty)

    // Adjuntamos enlaces rotos al detalle de páginas para la UI (compacto)
    const pagesOut = evaluated.map(p => ({
      url: p.url, status: p.status ?? (p.error ? 0 : 200), error: !!p.error,
      title: p.title || '', score: p.score,
      wordCount: p.wordCount ?? null, imgNoAlt: p.imgNoAlt ?? 0,
      issues: p.issues,
    }))

    await setStep(auditId, 'Guardando resultados…')
    await prisma.onPageAudit.update({
      where: { id: auditId },
      data: {
        status:          'completed',
        score,
        pagesCrawled:    evaluated.length,
        findings:        JSON.stringify(findings),
        pages:           JSON.stringify(pagesOut),
        linkSuggestions: JSON.stringify(linkSuggestions),
        tokensUsed:      aiTokens || null,
        errorMsg:        null,
      },
    })
  } catch (err) {
    console.error(`[OnPageAudit] Error en audit ${auditId}:`, err.message)
    await prisma.onPageAudit.update({
      where: { id: auditId },
      data:  { status: 'failed', errorMsg: err.message?.slice(0, 500) ?? 'Error desconocido' },
    }).catch(e => console.error('[OnPageAudit] Error al marcar como fallido:', e.message))
  }
}

module.exports = { runOnPageAnalysis }
