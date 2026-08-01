const axios = require('axios')
const prisma = require('../lib/prisma')
const { getValidMetaToken }  = require('./metaTokenRefresh.service')
const { cacheSocialImage }   = require('./socialImageCache.service')
const { DEFAULT_TZ } = require('../utils/dates')

const BASE_IGAAM = 'https://graph.instagram.com/v21.0'
const BASE_FB    = 'https://graph.facebook.com/v21.0'

// Métricas de insights de stories. Los nombres cambiaron entre versiones de la API
// (views reemplazó impressions; taps/exits siguen disponibles en v21). Pedimos el set
// más completo y vamos degradando si la API rechaza alguna métrica, para no perder todo.
const STORY_METRIC_SETS = [
  'reach,replies,views,taps_forward,taps_back,exits',
  'reach,replies,taps_forward,taps_back,exits',
  'reach,replies',
]

function monthFromTimestampART(ts) {
  const d = new Date(new Date(ts).toLocaleString('en-US', { timeZone: DEFAULT_TZ }))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Trae las historias ACTIVAS (últimas 24h) de una cuenta y sus insights.
 * Devuelve [] si la cuenta no tiene stories activas o la API no las expone.
 *
 * @param {string}  igUserId    — Instagram User ID (propertyId)
 * @param {string}  accessToken — token desencriptado
 * @param {boolean} useFbGraph  — true si el token es de Facebook Graph (Business Manager)
 */
async function fetchActiveStories(igUserId, accessToken, useFbGraph = false) {
  const base = useFbGraph ? BASE_FB  : BASE_IGAAM
  const meId = useFbGraph ? igUserId : 'me'

  const res = await axios.get(`${base}/${meId}/stories`, {
    params: {
      fields:       'id,media_type,media_url,thumbnail_url,timestamp,permalink',
      access_token: accessToken,
    },
  })
  const stories = res.data?.data ?? []
  if (stories.length === 0) return []

  // Insights por story (best-effort). Concurrencia acotada; las stories por corrida
  // son pocas (una cuenta rara vez tiene >20 stories vivas a la vez).
  async function withInsights(story) {
    let insights = null
    for (const metric of STORY_METRIC_SETS) {
      try {
        const r = await axios.get(`${base}/${story.id}/insights`, {
          params: { metric, access_token: accessToken },
        })
        insights = r.data?.data ?? []
        break
      } catch { /* probamos el siguiente set más reducido */ }
    }
    const vals = {}
    for (const row of insights ?? []) {
      vals[row.name] = row.values?.[0]?.value ?? row.total_value?.value ?? null
    }
    return {
      storyId:     story.id,
      publishedAt: story.timestamp ? new Date(story.timestamp) : new Date(),
      month:       monthFromTimestampART(story.timestamp ?? Date.now()),
      mediaType:   story.media_type ?? null,
      imgSrc:      story.thumbnail_url ?? story.media_url ?? null,
      permalink:   story.permalink ?? null,
      reach:       vals.reach        ?? null,
      replies:     vals.replies      ?? null,
      views:       vals.views        ?? vals.impressions ?? null,
      tapsForward: vals.taps_forward ?? null,
      tapsBack:    vals.taps_back    ?? null,
      exits:       vals.exits        ?? null,
      insightsRaw: insights ? JSON.stringify(insights) : null,
    }
  }

  const out = []
  const CONCURRENCY = 4
  for (let i = 0; i < stories.length; i += CONCURRENCY) {
    out.push(...await Promise.all(stories.slice(i, i + CONCURRENCY).map(withInsights)))
  }
  return out
}

/**
 * Captura y persiste las stories activas de un proyecto. Idempotente: upsert por
 * (projectId, storyId), así refresca los insights mientras la story sigue viva.
 * Devuelve la cantidad de stories capturadas/actualizadas.
 */
async function captureStoriesForProject(projectId, workspaceId, integration) {
  const useFbGraph = integration.scopes?.startsWith('fb_graph')
  const token      = await getValidMetaToken(integration)
  const stories    = await fetchActiveStories(integration.propertyId, token, useFbGraph)

  for (const s of stories) {
    // Cacheamos el thumbnail mientras la URL firmada del CDN sigue viva.
    const imgSrc = s.imgSrc ? await cacheSocialImage(s.imgSrc, workspaceId) : null
    await prisma.instagramStory.upsert({
      where:  { projectId_storyId: { projectId, storyId: s.storyId } },
      update: {
        month: s.month, publishedAt: s.publishedAt, mediaType: s.mediaType,
        imgSrc, permalink: s.permalink,
        reach: s.reach, replies: s.replies, views: s.views,
        tapsForward: s.tapsForward, tapsBack: s.tapsBack, exits: s.exits,
        insightsRaw: s.insightsRaw,
      },
      create: {
        projectId, workspaceId, storyId: s.storyId,
        month: s.month, publishedAt: s.publishedAt, mediaType: s.mediaType,
        imgSrc, permalink: s.permalink,
        reach: s.reach, replies: s.replies, views: s.views,
        tapsForward: s.tapsForward, tapsBack: s.tapsBack, exits: s.exits,
        insightsRaw: s.insightsRaw,
      },
    })
  }
  return stories.length
}

/**
 * Cron: captura stories de TODOS los proyectos con Instagram conectado por API oficial
 * (scopes ≠ 'scrape'). Secuencial con delay para no saturar la Graph API.
 */
async function captureAllStories() {
  const integrations = await prisma.projectIntegration.findMany({
    where: { type: 'instagram', status: 'active', NOT: { scopes: 'scrape' } },
    include: { project: { select: { workspaceId: true, name: true } } },
  })

  console.log(`[InstagramStories] Capturando stories de ${integrations.length} proyecto(s)...`)
  let ok = 0, fail = 0, total = 0
  for (const intg of integrations) {
    try {
      const n = await captureStoriesForProject(intg.projectId, intg.project.workspaceId, intg)
      total += n
      ok++
    } catch (err) {
      fail++
      console.error(`[InstagramStories] Error en proyecto ${intg.projectId} (${intg.project.name}): ${err.response?.data?.error?.message || err.message}`)
    }
    await new Promise(r => setTimeout(r, 1500))
  }
  console.log(`[InstagramStories] Completado. ${ok} OK / ${fail} errores. ${total} stories capturadas.`)
}

/**
 * Agrega las stories de un mes para un proyecto. Devuelve null si no hay ninguna.
 * Métricas: cantidad, alcance/vistas promedio, respuestas, salidas, tasa de retención
 * (1 − exits/reach promedio) y las top 5 stories por alcance con su miniatura.
 */
async function getStoriesSummary(projectId, month) {
  const stories = await prisma.instagramStory.findMany({
    where:   { projectId, month },
    orderBy: { publishedAt: 'asc' },
  })
  if (stories.length === 0) return null

  const num = (arr) => arr.filter(v => v != null)
  const sum = (arr) => num(arr).reduce((s, v) => s + v, 0)
  const avg = (arr) => { const n = num(arr); return n.length ? Math.round(n.reduce((s, v) => s + v, 0) / n.length) : null }

  const reaches = stories.map(s => s.reach)
  const exits   = stories.map(s => s.exits)
  const withReachAndExits = stories.filter(s => s.reach != null && s.exits != null && s.reach > 0)
  const retentionRate = withReachAndExits.length
    ? parseFloat((withReachAndExits.reduce((s, x) => s + (1 - x.exits / x.reach), 0) / withReachAndExits.length * 100).toFixed(1))
    : null

  const hasInsights = stories.some(s => s.reach != null || s.views != null || s.replies != null)

  const topStories = [...stories]
    .filter(s => s.reach != null)
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
    .slice(0, 5)
    .map(s => ({
      id: s.storyId, imgSrc: s.imgSrc, permalink: s.permalink, mediaType: s.mediaType,
      publishedAt: s.publishedAt, reach: s.reach, replies: s.replies, views: s.views, exits: s.exits,
    }))

  return {
    count:         stories.length,
    hasInsights,
    avgReach:      avg(reaches),
    avgViews:      avg(stories.map(s => s.views)),
    totalReach:    hasInsights ? sum(reaches) : null,
    totalReplies:  hasInsights ? sum(stories.map(s => s.replies)) : null,
    totalExits:    hasInsights ? sum(exits) : null,
    totalTapsForward: hasInsights ? sum(stories.map(s => s.tapsForward)) : null,
    totalTapsBack:    hasInsights ? sum(stories.map(s => s.tapsBack)) : null,
    retentionRate,
    // Miniaturas para mostrar (aunque no haya insights): últimas 5 publicadas
    recent: stories.slice(-5).reverse().map(s => ({
      id: s.storyId, imgSrc: s.imgSrc, permalink: s.permalink, mediaType: s.mediaType,
      publishedAt: s.publishedAt, reach: s.reach, replies: s.replies,
    })),
    topStories,
  }
}

module.exports = { fetchActiveStories, captureStoriesForProject, captureAllStories, getStoriesSummary }
