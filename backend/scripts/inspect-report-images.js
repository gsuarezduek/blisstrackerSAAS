/**
 * Diagnóstico de las imágenes de un informe mensual.
 *
 * Lee el `dataCache` del MonthlyReport (lo que efectivamente se renderiza) y,
 * por cada red, clasifica las imágenes de los top posts/videos en:
 *   - CACHEADA  → URL propia (cdn.blisstracker.app o /api/social-image/) → estable
 *   - EXTERNA   → URL directa del CDN de la red → SE VENCE (queda rota)
 *   - (sin posts) → la sección no trajo publicaciones
 *
 * Uso:
 *   # listar informes recientes para elegir uno:
 *   DATABASE_URL=... node scripts/inspect-report-images.js
 *   # inspeccionar uno puntual:
 *   DATABASE_URL=... node scripts/inspect-report-images.js <projectId> <YYYY-MM>
 */
const prisma = require('../src/lib/prisma')

// red → { campo del array, campo de la imagen dentro de cada item }
const NETS = {
  instagram: { arr: 'topPosts',  img: 'imgSrc' },
  facebook:  { arr: 'topPosts',  img: 'imgSrc' },
  linkedin:  { arr: 'topPosts',  img: 'imgSrc' },
  tiktok:    { arr: 'topVideos', img: 'coverUrl' },
  youtube:   { arr: 'topVideos', img: 'coverUrl' },
}

function classify(url) {
  if (!url || typeof url !== 'string') return 'VACÍA'
  if (url.includes('cdn.blisstracker.app') || url.includes('/api/social-image/')) return 'CACHEADA'
  return 'EXTERNA'
}

function parse(v) {
  if (v == null) return null
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return null }
}

async function listRecent() {
  const reports = await prisma.monthlyReport.findMany({
    orderBy: { month: 'desc' },
    take: 20,
    select: { projectId: true, month: true, dataCache: true, enabledSections: true,
              project: { select: { name: true } } },
  })
  console.log('\nInformes recientes (projectId · mes · proyecto · generado):')
  for (const r of reports) {
    const gen = r.dataCache != null || r.enabledSections != null
    console.log(`  ${String(r.projectId).padStart(4)} · ${r.month} · ${r.project?.name ?? '?'} · ${gen ? 'generado' : 'vacío'}`)
  }
  console.log('\nCorré de nuevo con: node scripts/inspect-report-images.js <projectId> <YYYY-MM>\n')
}

async function inspect(projectId, month) {
  const report = await prisma.monthlyReport.findFirst({
    where: { projectId, month },
    select: { dataCache: true, project: { select: { name: true } } },
  })
  if (!report) { console.log(`No hay informe para project ${projectId} mes ${month}`); return }

  const data = parse(report.dataCache)
  const sections = data?.sections
  if (!sections) { console.log('El informe no tiene dataCache (no generado o sin secciones).'); return }

  console.log(`\nInforme de "${report.project?.name}" · ${month}\n${'─'.repeat(60)}`)
  for (const [net, { arr, img }] of Object.entries(NETS)) {
    const sec = sections[net]
    if (!sec) { console.log(`\n${net.toUpperCase()}: (sección ausente/no incluida)`); continue }
    const items = Array.isArray(sec[arr]) ? sec[arr] : []
    const tally = { CACHEADA: 0, EXTERNA: 0, VACÍA: 0 }
    for (const it of items) tally[classify(it?.[img])]++
    const fallback = sec._fallbackMonth ? ` [fuente: ${sec._fallbackMonth}]` : ''
    console.log(`\n${net.toUpperCase()}: ${items.length} ${arr}${fallback}`)
    console.log(`   CACHEADA ${tally.CACHEADA} · EXTERNA(vence) ${tally.EXTERNA} · VACÍA ${tally.VACÍA}`)
    items.slice(0, 3).forEach((it, i) => {
      const url = it?.[img]
      console.log(`   #${i + 1} [${classify(url)}] ${url ? url.slice(0, 90) : '—'}`)
    })
  }
  console.log('')
}

async function main() {
  const projectId = process.argv[2] ? Number(process.argv[2]) : null
  const month = process.argv[3] || null
  if (projectId && month) await inspect(projectId, month)
  else await listRecent()
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
