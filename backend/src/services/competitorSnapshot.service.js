const prisma = require('../lib/prisma')
const { scrapeInstagramProfile } = require('./socialScrape.service')
const { cacheImagesInArray }     = require('./socialImageCache.service')

function currentMonthStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

function todayStr() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Snapshot mensual de competidores de Instagram (todos los workspaces).
 * Corre el 1° del mes y guarda el snapshot del mes anterior + log de seguidores.
 * Procesamiento secuencial con delay para no saturar el proveedor de scraping.
 */
async function saveAllMonthlyCompetitorSnapshots() {
  const month = prevMonthStr(currentMonthStr())
  const date  = todayStr()

  const competitors = await prisma.competitorAccount.findMany({
    where:  { platform: 'instagram' },
    select: { id: true, username: true, workspaceId: true },
  })

  console.log(`[CompetitorSnapshot] Procesando ${competitors.length} competidores (mes: ${month})`)

  for (const c of competitors) {
    try {
      const metrics = await scrapeInstagramProfile(c.username, { targetMonth: month, workspaceId: c.workspaceId, context: 'Competidores — snapshot mensual' })
      const topPostsCached = await cacheImagesInArray(metrics.topPosts ?? [], 'imgSrc', c.workspaceId)
      const topPostsJson = JSON.stringify(topPostsCached)
      await Promise.allSettled([
        prisma.competitorSnapshot.upsert({
          where:  { competitorId_month: { competitorId: c.id, month } },
          update: {
            followersCount: metrics.followersCount,
            mediaCount:     metrics.mediaCount     ?? null,
            postsCount:     metrics.postsThisMonth ?? null,
            avgLikes:       metrics.avgLikes       ?? null,
            avgComments:    metrics.avgComments    ?? null,
            engagementRate: metrics.engagementRate ?? null,
            topPosts:       topPostsJson,
          },
          create: {
            competitorId: c.id, workspaceId: c.workspaceId, month,
            followersCount: metrics.followersCount,
            mediaCount:     metrics.mediaCount     ?? null,
            postsCount:     metrics.postsThisMonth ?? null,
            avgLikes:       metrics.avgLikes       ?? null,
            avgComments:    metrics.avgComments    ?? null,
            engagementRate: metrics.engagementRate ?? null,
            topPosts:       topPostsJson,
          },
        }),
        prisma.competitorFollowerLog.upsert({
          where:  { competitorId_date: { competitorId: c.id, date } },
          update: { followersCount: metrics.followersCount },
          create: { competitorId: c.id, workspaceId: c.workspaceId, date, followersCount: metrics.followersCount },
        }),
      ])
      await new Promise(r => setTimeout(r, 3000))
    } catch (err) {
      console.error(`[CompetitorSnapshot] Error en competidor ${c.id} (@${c.username}):`, err.message)
    }
  }
}

module.exports = { saveAllMonthlyCompetitorSnapshots }
