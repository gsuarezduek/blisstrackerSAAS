const prisma = require('../lib/prisma')
const {
  scrapeInstagramProfile,
  scrapeLinkedinCompany,
  scrapeFacebookPage,
} = require('./socialScrape.service')
const { cacheImagesInArray }     = require('./socialImageCache.service')

// Scraper por plataforma — keep en sync con PLATFORM_SCRAPERS de competitors.controller.js
// Instagram con skipPostsActor: los competidores no corren la 2ª llamada (actor de
// posts), alcanza el scrape de perfil para trackear seguidores y no duplica costo.
const PLATFORM_SCRAPERS = {
  instagram: (username, opts) => scrapeInstagramProfile(username, { ...opts, skipPostsActor: true }),
  linkedin:  scrapeLinkedinCompany,
  facebook:  scrapeFacebookPage,
}

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

  // Procesamos todas las plataformas soportadas (Instagram + LinkedIn)
  const competitors = await prisma.competitorAccount.findMany({
    where:  { platform: { in: Object.keys(PLATFORM_SCRAPERS) } },
    select: { id: true, username: true, workspaceId: true, platform: true },
  })

  console.log(`[CompetitorSnapshot] Procesando ${competitors.length} competidores (mes: ${month})`)

  for (const c of competitors) {
    try {
      const scrape = PLATFORM_SCRAPERS[c.platform]
      if (!scrape) {
        console.warn(`[CompetitorSnapshot] Plataforma "${c.platform}" sin scraper, omito competidor ${c.id}`)
        continue
      }
      const metrics = await scrape(c.username, { targetMonth: month, workspaceId: c.workspaceId, context: `Competidores — snapshot mensual (${c.platform})` })
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
