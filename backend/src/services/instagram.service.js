const axios = require('axios')

// Instagram Business Login usa graph.instagram.com (no graph.facebook.com)
const BASE = 'https://graph.instagram.com'

/**
 * Obtiene métricas de Instagram para un IG Business/Creator Account.
 * Usa graph.instagram.com — flujo Instagram Business Login.
 *
 * @param {string} igUserId    — Instagram User ID (almacenado en integration.propertyId)
 * @param {string} accessToken — Long-lived Instagram token
 * @returns {Promise<object>}
 */
async function fetchInstagramMetrics(igUserId, accessToken) {
  const [profileRes, mediaRes] = await Promise.all([
    axios.get(`${BASE}/${igUserId}`, {
      params: {
        fields:       'followers_count,media_count,name,username,profile_picture_url,biography,website',
        access_token: accessToken,
      },
    }),
    axios.get(`${BASE}/${igUserId}/media`, {
      params: {
        fields:       'id,like_count,comments_count,timestamp,media_type',
        limit:        30,
        access_token: accessToken,
      },
    }),
  ])

  const profile  = profileRes.data
  const media    = mediaRes.data?.data ?? []

  const followersCount = profile.followers_count ?? 0
  const mediaCount     = profile.media_count     ?? 0

  // Likes y comentarios promedio
  const postsWithLikes    = media.filter(m => m.like_count    != null)
  const postsWithComments = media.filter(m => m.comments_count != null)
  const avgLikes    = postsWithLikes.length    > 0
    ? parseFloat((postsWithLikes.reduce((s, m) => s + m.like_count, 0)    / postsWithLikes.length).toFixed(1))
    : null
  const avgComments = postsWithComments.length > 0
    ? parseFloat((postsWithComments.reduce((s, m) => s + m.comments_count, 0) / postsWithComments.length).toFixed(1))
    : null

  // Engagement rate = (avg_likes + avg_comments) / followers * 100
  const engagementRate = followersCount > 0 && avgLikes != null
    ? parseFloat((((avgLikes ?? 0) + (avgComments ?? 0)) / followersCount * 100).toFixed(2))
    : null

  // Posts por semana — contar publicaciones en las últimas 4 semanas
  const fourWeeksAgo  = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
  const recentPosts   = media.filter(m => m.timestamp && new Date(m.timestamp) >= fourWeeksAgo)
  const postsPerWeek  = parseFloat((recentPosts.length / 4).toFixed(1))

  return {
    followersCount,
    mediaCount,
    name:           profile.name          ?? null,
    username:       profile.username      ?? null,
    profilePicUrl:  profile.profile_picture_url ?? null,
    biography:      profile.biography     ?? null,
    website:        profile.website       ?? null,
    avgLikes,
    avgComments,
    engagementRate,
    postsPerWeek,
  }
}

/**
 * Resuelve el Instagram User ID a partir de un user access token.
 * Recorre las Facebook Pages del usuario y extrae el instagram_business_account.
 *
 * @param {string} accessToken — Long-lived user access token
 * @returns {Promise<{ igUserId: string, username: string }>}
 */
async function resolveIgUserId(accessToken) {
  // Paso 1: obtener páginas con sus Page Access Tokens
  const { data } = await axios.get(`${BASE}/me/accounts`, {
    params: {
      fields:       'name,access_token',
      access_token: accessToken,
    },
  })

  const pages = data?.data ?? []
  console.log(`[Instagram] /me/accounts devolvió ${pages.length} página(s):`,
    pages.map(p => ({ id: p.id, name: p.name }))
  )

  // Paso 2: para cada página, consultar instagram_business_account usando el Page Access Token
  for (const page of pages) {
    try {
      const pageToken = page.access_token || accessToken
      const { data: pageData } = await axios.get(`${BASE}/${page.id}`, {
        params: {
          fields:       'instagram_business_account{id,username}',
          access_token: pageToken,
        },
      })
      const igAccount = pageData?.instagram_business_account
      if (igAccount?.id) {
        console.log(`[Instagram] IG Business Account encontrado en página "${page.name}": @${igAccount.username}`)
        return {
          igUserId: igAccount.id,
          username: igAccount.username ?? null,
        }
      }
    } catch (err) {
      console.warn(`[Instagram] Error consultando página "${page.name}":`, err.response?.data || err.message)
    }
  }

  const pageNames = pages.map(p => p.name).join(', ') || 'ninguna'
  throw new Error(
    `No se encontró una cuenta de Instagram Business vinculada. ` +
    `Páginas consultadas: ${pageNames}. ` +
    `Asegurate de que la cuenta de Instagram esté conectada a una de esas páginas.`
  )
}

module.exports = { fetchInstagramMetrics, resolveIgUserId }
