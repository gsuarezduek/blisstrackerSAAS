/**
 * Backfill (Parte B): arregla las imágenes rotas de Instagram en los informes ya
 * generados, regenerando su `dataCache` desde el snapshot cacheado actual.
 *
 * Solo toca informes "gratis": aquellos cuyo snapshot de Instagram del mes YA está
 * cacheado (sin URLs de cdninstagram.com). Para esos, regenerar el dataCache trae las
 * imágenes vivas. Preserva el análisis IA (NO re-corre Claude, no gasta tokens).
 *
 * Guardas de seguridad — NO persiste un informe si:
 *   - su snapshot del mes está ausente o todavía roto (necesita re-scrape, opción C)
 *   - la regeneración perdería alguna sección que antes tenía datos (degradación)
 *   - tras regenerar, instagram sigue teniendo URLs de CDN
 *
 * IMPORTANTE: correr en Railway (`railway run ...`) para tener TODAS las env vars
 * (ENCRYPTION_KEY, tokens de integraciones, etc.). Si faltan, las secciones que las
 * necesitan degradan y la guarda anti-degradación saltea ese informe (no rompe nada).
 *
 * Uso:
 *   railway run node scripts/backfill-report-images.js          # DRY-RUN (no escribe)
 *   railway run node scripts/backfill-report-images.js --apply  # aplica los cambios
 */
const prisma = require('../src/lib/prisma')
const { aggregateReportData } = require('../src/services/monthlyReport.service')

const APPLY = process.argv.includes('--apply')
const isCdn  = u => typeof u === 'string' && /cdninstagram\.com|fbcdn\.net/.test(u)
const hasCdn = obj => /cdninstagram\.com|fbcdn\.net/.test(JSON.stringify(obj ?? ''))

// Secciones con datos (no-null) en un bloque `sections`.
function liveSections(sections) {
  const out = new Set()
  for (const k of Object.keys(sections || {})) if (sections[k] != null) out.add(k)
  return out
}

;(async () => {
  console.log(APPLY ? '=== MODO APPLY (escribe en DB) ===' : '=== DRY-RUN (no escribe; usá --apply para aplicar) ===')

  const reports = await prisma.monthlyReport.findMany({
    where:  { dataCache: { not: null } },
    select: { id: true, projectId: true, workspaceId: true, month: true,
              dataCache: true, analysis: true, enabledSections: true },
  })

  let fixed = 0, skipRescrape = 0, skipDegrade = 0, skipOther = 0, healthy = 0

  for (const r of reports) {
    let dc; try { dc = JSON.parse(r.dataCache) } catch { continue }
    const ig = dc?.sections?.instagram
    if (!ig || !hasCdn(ig)) { healthy++; continue } // sin instagram, o ya sano

    const tag = `id${r.id} p${r.projectId}/${r.month}`

    // ¿snapshot del mes cacheado? (condición "gratis")
    const snap = await prisma.instagramSnapshot.findUnique({
      where:  { projectId_month: { projectId: r.projectId, month: r.month } },
      select: { topPosts: true },
    })
    let snapRoto = true
    if (snap) { try { snapRoto = JSON.parse(snap.topPosts || '[]').some(p => isCdn(p.imgSrc)) } catch {} }
    if (!snap || snapRoto) {
      skipRescrape++
      console.log(`  ⏭️  ${tag} — snapshot ${snap ? 'roto' : 'ausente'}, necesita re-scrape (opción C)`)
      continue
    }

    // Regenerar dataCache preservando el análisis IA (cachedData=null fuerza recálculo).
    const cachedAnalysis  = r.analysis ? JSON.parse(r.analysis) : null
    const enabledSections = r.enabledSections ? JSON.parse(r.enabledSections) : null
    let data
    try {
      data = await aggregateReportData(r.projectId, r.workspaceId, r.month, cachedAnalysis, {}, null, enabledSections)
    } catch (e) {
      skipOther++
      console.log(`  ⏭️  ${tag} — aggregate falló: ${e.message}`)
      continue
    }

    // Guarda anti-degradación: no perder secciones que antes tenían datos.
    const before = liveSections(dc.sections)
    const after  = liveSections(data.sections)
    const lost   = [...before].filter(k => !after.has(k))
    if (lost.length) {
      skipDegrade++
      console.log(`  ⚠️  ${tag} — regenerar perdería secciones [${lost.join(', ')}], se saltea (¿faltan env vars?)`)
      continue
    }
    if (hasCdn(data.sections.instagram)) {
      skipOther++
      console.log(`  ⏭️  ${tag} — sigue con CDN tras regenerar`)
      continue
    }

    if (APPLY) {
      await prisma.monthlyReport.update({
        where: { id: r.id },
        data: { dataCache: JSON.stringify({
          project:        data.project,
          dataMonth:      data.dataMonth,
          connectedTypes: data.connectedTypes,
          sections:       data.sections,
        }) },
      })
    }
    fixed++
    console.log(`  ✅ ${APPLY ? '' : '[dry] '}${tag} — imágenes cacheadas (posts actuales del snapshot)`)
  }

  console.log(`\nResumen:`)
  console.log(`  arreglados${APPLY ? '' : ' (dry)'}:        ${fixed}`)
  console.log(`  salteados (re-scrape):  ${skipRescrape}`)
  console.log(`  salteados (degradaban): ${skipDegrade}`)
  console.log(`  salteados (otros):      ${skipOther}`)
  console.log(`  ya sanos:               ${healthy}`)
  if (!APPLY) console.log(`\nNada se escribió. Reejecutá con --apply para aplicar.`)
  await prisma.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
