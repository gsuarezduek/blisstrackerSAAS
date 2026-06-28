const axios = require('axios')

const YT_BASE = 'https://www.googleapis.com/youtube/v3'

// Umbral para clasificar un video como Short. La YouTube Data API NO expone un
// flag oficial "isShort", así que se infiere por duración (<= 60s). Es una
// heurística estándar (a 2026): un video largo de <60s contaría como Short, pero
// es la mejor aproximación disponible sin endpoints privados.
const SHORT_MAX_SECONDS = 60

/**
 * Parsea una duración ISO 8601 (ej. "PT1M30S", "PT45S", "PT1H2M3S") a segundos.
 */
function parseISODuration(iso) {
  if (!iso || typeof iso !== 'string') return null
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return null
  const [, h, mm, s] = m
  return (Number(h) || 0) * 3600 + (Number(mm) || 0) * 60 + (Number(s) || 0)
}

function ytGet(path, accessToken, params) {
  return axios.get(`${YT_BASE}/${path}`, {
    params,
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

function artMonthOf(date) {
  const art = new Date(date.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${art.getFullYear()}-${String(art.getMonth() + 1).padStart(2, '0')}`
}

// Mejor thumbnail disponible (de mayor a menor calidad).
function pickThumb(thumbnails) {
  if (!thumbnails) return null
  return (thumbnails.maxres || thumbnails.standard || thumbnails.high || thumbnails.medium || thumbnails.default)?.url ?? null
}

/**
 * Obtiene métricas de YouTube (Data API v3) para el canal del token.
 * Calcula los KPIs del mes objetivo (ART) filtrando los videos publicados ese mes.
 *
 * @param {string} accessToken — access token de Google válido (scope youtube.readonly)
 * @param {string|null} targetMonth — "YYYY-MM"; si null, usa el mes actual (ART)
 * @param {string|null} channelId — si se provee, consulta ese canal; si no, usa mine=true (canal por defecto)
 * @returns {Promise<object>}
 */
async function fetchYouTubeMetrics(accessToken, targetMonth = null, channelId = null) {
  // ── Canal ───────────────────────────────────────────────────────────────────
  const chParams = { part: 'snippet,statistics,contentDetails' }
  if (channelId) chParams.id = channelId
  else           chParams.mine = true

  const chRes   = await ytGet('channels', accessToken, chParams)
  const channel = chRes.data?.items?.[0]
  if (!channel) {
    const err = new Error('No se encontró ningún canal de YouTube para esta cuenta')
    err.code = 'CHANNEL_NOT_FOUND'
    throw err
  }

  const stats        = channel.statistics ?? {}
  const subscriberCount = stats.hiddenSubscriberCount ? null : (stats.subscriberCount != null ? Number(stats.subscriberCount) : null)
  const viewCountTotal  = stats.viewCount  != null ? Number(stats.viewCount)  : null
  const videoCount      = stats.videoCount != null ? Number(stats.videoCount) : null
  const uploadsPlaylist = channel.contentDetails?.relatedPlaylists?.uploads ?? null

  // ── Mes objetivo (ART) ────────────────────────────────────────────────────────
  const filterMonth = targetMonth || artMonthOf(new Date())

  // ── Videos recientes (uploads playlist, paginado) ──────────────────────────────
  // Traemos IDs de la playlist de uploads (orden: más nuevos primero) y paramos de
  // paginar en cuanto la página ya es anterior al mes objetivo (los del mes ya pasaron).
  const videoIds = []
  if (uploadsPlaylist) {
    let pageToken = null
    let pages = 0
    const MAX_PAGES = 4 // hasta ~200 videos — cubre el mes en canales muy activos
    while (pages < MAX_PAGES) {
      const plParams = { part: 'contentDetails', playlistId: uploadsPlaylist, maxResults: 50 }
      if (pageToken) plParams.pageToken = pageToken
      const plRes = await ytGet('playlistItems', accessToken, plParams)
      const items = plRes.data?.items ?? []
      for (const it of items) {
        const vid = it.contentDetails?.videoId
        if (vid) videoIds.push(vid)
      }
      pages++
      pageToken = plRes.data?.nextPageToken
      // Si el último item de la página ya es de un mes anterior al objetivo, no
      // hace falta seguir paginando (los uploads vienen de más nuevo a más viejo).
      const lastPublished = items[items.length - 1]?.contentDetails?.videoPublishedAt
      if (!pageToken) break
      if (lastPublished && artMonthOf(new Date(lastPublished)) < filterMonth) break
    }
  }

  // ── Detalle de cada video (stats + duración) ───────────────────────────────────
  const videos = []
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50)
    const vRes  = await ytGet('videos', accessToken, { part: 'snippet,statistics,contentDetails', id: batch.join(',') })
    for (const v of vRes.data?.items ?? []) {
      const durationSec = parseISODuration(v.contentDetails?.duration)
      videos.push({
        id:           v.id,
        title:        v.snippet?.title ?? null,
        publishedAt:  v.snippet?.publishedAt ?? null,
        coverUrl:     pickThumb(v.snippet?.thumbnails),
        url:          `https://www.youtube.com/watch?v=${v.id}`,
        viewCount:    v.statistics?.viewCount    != null ? Number(v.statistics.viewCount)    : null,
        likeCount:    v.statistics?.likeCount    != null ? Number(v.statistics.likeCount)    : null,
        commentCount: v.statistics?.commentCount != null ? Number(v.statistics.commentCount) : null,
        durationSec,
        isShort:      durationSec != null ? durationSec <= SHORT_MAX_SECONDS : false,
      })
    }
  }

  // ── Videos del mes objetivo ─────────────────────────────────────────────────────
  const monthVideos = videos.filter(v => v.publishedAt && artMonthOf(new Date(v.publishedAt)) === filterMonth)

  const videosThisMonth = monthVideos.length
  const shortsThisMonth = monthVideos.filter(v => v.isShort).length
  const longsThisMonth  = videosThisMonth - shortsThisMonth

  function avgField(arr, key) {
    const valid = arr.filter(v => v[key] != null)
    return valid.length > 0
      ? parseFloat((valid.reduce((s, v) => s + v[key], 0) / valid.length).toFixed(1))
      : null
  }

  const monthViews  = monthVideos.filter(v => v.viewCount != null).reduce((s, v) => s + v.viewCount, 0) || null
  const avgViews    = avgField(monthVideos, 'viewCount')
  const avgLikes    = avgField(monthVideos, 'likeCount')
  const avgComments = avgField(monthVideos, 'commentCount')

  // Engagement rate = (likes + comments) / views * 100, por video, promediado.
  const monthWithViews = monthVideos.filter(v => (v.viewCount ?? 0) > 0)
  const engagementRate = monthWithViews.length > 0
    ? parseFloat((
        monthWithViews.reduce((s, v) => {
          const eng = (v.likeCount ?? 0) + (v.commentCount ?? 0)
          return s + (eng / v.viewCount * 100)
        }, 0) / monthWithViews.length
      ).toFixed(2))
    : null

  // ── Top videos del mes (score = likes + comments) ───────────────────────────────
  function videoScore(v) {
    return (v.likeCount ?? 0) + (v.commentCount ?? 0)
  }
  function toCard(v) {
    if (!v) return null
    return {
      id:           v.id,
      title:        v.title,
      coverUrl:     v.coverUrl,
      url:          v.url,
      viewCount:    v.viewCount,
      likeCount:    v.likeCount,
      commentCount: v.commentCount,
      durationSec:  v.durationSec,
      isShort:      v.isShort,
      publishedAt:  v.publishedAt,
    }
  }

  const topVideos = monthVideos
    .filter(v => v.likeCount != null || v.commentCount != null || v.viewCount != null)
    .sort((a, b) => videoScore(b) - videoScore(a))
    .slice(0, 3)
    .map(toCard)

  const bestVideo = topVideos[0] ?? null

  // Top del mes por categoría (para la grilla del tab).
  const withViews = monthVideos.filter(v => v.viewCount != null)
  const withLikes = monthVideos.filter(v => v.likeCount != null)
  const topViews = withViews.length > 0 ? toCard(withViews.reduce((b, v) => v.viewCount > b.viewCount ? v : b)) : null
  const topLikes = withLikes.length > 0 ? toCard(withLikes.reduce((b, v) => v.likeCount > b.likeCount ? v : b)) : null

  return {
    channelId:      channel.id,
    title:          channel.snippet?.title ?? null,
    description:    channel.snippet?.description ?? null,
    avatarUrl:      pickThumb(channel.snippet?.thumbnails),
    customUrl:      channel.snippet?.customUrl ?? null,
    subscriberCount,
    viewCountTotal,
    videoCount,
    monthViews,
    videosThisMonth,
    longsThisMonth,
    shortsThisMonth,
    avgViews,
    avgLikes,
    avgComments,
    engagementRate,
    topVideos,
    bestVideo,
    topOfMonth: { topViews, topLikes, videosThisMonth, shortsThisMonth, longsThisMonth },
    recentVideos: videos.slice(0, 9).map(toCard),
  }
}

module.exports = { fetchYouTubeMetrics, parseISODuration, SHORT_MAX_SECONDS }
