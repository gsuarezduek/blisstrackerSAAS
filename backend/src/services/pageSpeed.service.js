const axios = require('axios')

const PAGESPEED_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

// ─── Rating helpers ───────────────────────────────────────────────────────────

function scoreRating(score) {
  if (score == null) return null
  if (score >= 0.9) return 'good'
  if (score >= 0.5) return 'needs-improvement'
  return 'poor'
}

function parseAudit(audits, id) {
  const a = audits[id]
  if (!a) return null
  return {
    displayValue: a.displayValue  ?? null,
    numericValue: a.numericValue  ?? null,
    score:        a.score         ?? null,
    rating:       scoreRating(a.score),
  }
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseResult(data) {
  const lhr    = data.lighthouseResult ?? {}
  const audits = lhr.audits            ?? {}

  const performanceScore = lhr.categories?.performance?.score != null
    ? Math.round(lhr.categories.performance.score * 100)
    : null

  const metrics = {
    lcp:  parseAudit(audits, 'largest-contentful-paint'),
    fcp:  parseAudit(audits, 'first-contentful-paint'),
    tbt:  parseAudit(audits, 'total-blocking-time'),
    cls:  parseAudit(audits, 'cumulative-layout-shift'),
    si:   parseAudit(audits, 'speed-index'),
    ttfb: parseAudit(audits, 'server-response-time'),
  }

  // Oportunidades: audits tipo 'opportunity' con mejoras estimadas (con ahorros en ms primero)
  const opportunities = Object.values(audits)
    .filter(a =>
      a.details?.type === 'opportunity' &&
      a.score !== null &&
      a.score !== undefined &&
      a.score < 1
    )
    .sort((a, b) => (b.details?.overallSavingsMs ?? 0) - (a.details?.overallSavingsMs ?? 0))
    .map(a => ({
      id:          a.id,
      title:       a.title,
      description: a.description,
      savingsMs:   Math.round(a.details?.overallSavingsMs ?? 0),
      score:       a.score,
      type:        'opportunity',
    }))

  // Diagnósticos: audits fallidos que no son oportunidades (igualmente accionables)
  const diagnostics = Object.values(audits)
    .filter(a =>
      a.details?.type === 'table' &&
      a.score !== null &&
      a.score !== undefined &&
      a.score < 1
    )
    .map(a => ({
      id:          a.id,
      title:       a.title,
      description: a.description,
      score:       a.score,
      type:        'diagnostic',
    }))

  return { performanceScore, metrics, opportunities, diagnostics }
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Llama a la PageSpeed Insights API y devuelve el resultado parseado.
 * @param {string} url
 * @param {'mobile'|'desktop'} strategy
 * @returns {Promise<object>}
 */
async function runPageSpeedAnalysis(url, strategy = 'mobile') {
  const apiKey = process.env.PAGESPEED_API_KEY
  if (!apiKey) throw new Error('PAGESPEED_API_KEY no configurada en el entorno')

  try {
    const { data } = await axios.get(PAGESPEED_API, {
      params:  { url, strategy, key: apiKey, category: 'performance', locale: 'es' },
      timeout: 90_000,
    })
    return parseResult(data)
  } catch (err) {
    // Extraer el mensaje real de Google si viene en el body
    const googleMsg = err.response?.data?.error?.message
    const status    = err.response?.status
    console.error('[PageSpeed] Error de API:', status, googleMsg ?? err.message)
    if (err.response?.data) {
      console.error('[PageSpeed] Body:', JSON.stringify(err.response.data).slice(0, 500))
    }
    throw new Error(googleMsg ?? err.message)
  }
}

/**
 * Cron mensual: corre ambas estrategias (mobile + desktop) para todos los
 * proyectos con websiteUrl configurada. Se ejecuta el 1° de cada mes.
 */
async function runAllMonthlyPageSpeed() {
  const prisma = require('../lib/prisma')

  const projects = await prisma.project.findMany({
    where:  { websiteUrl: { not: null }, active: true },
    select: { id: true, workspaceId: true, websiteUrl: true, name: true },
  })

  console.log(`[PageSpeed] Análisis mensual automático: ${projects.length} proyecto(s)`)
  let ok = 0, fail = 0

  for (const p of projects) {
    const url = /^https?:\/\//i.test(p.websiteUrl) ? p.websiteUrl : `https://${p.websiteUrl}`

    for (const strategy of ['mobile', 'desktop']) {
      try {
        const result = await runPageSpeedAnalysis(url, strategy)
        await prisma.pageSpeedResult.create({
          data: {
            workspaceId:      p.workspaceId,
            projectId:        p.id,
            url,
            strategy,
            status:           'done',
            performanceScore: result.performanceScore,
            metrics:          JSON.stringify(result.metrics),
            opportunities:    JSON.stringify(result.opportunities),
            diagnostics:      JSON.stringify(result.diagnostics),
          },
        })
        ok++
      } catch (err) {
        console.error(`[PageSpeed] Error en "${p.name}" (${strategy}):`, err.message)
        fail++
      }
      // Pausa entre llamadas para no saturar la cuota
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  console.log(`[PageSpeed] Mensual completado: ${ok} OK, ${fail} errores.`)
}

module.exports = { runPageSpeedAnalysis, runAllMonthlyPageSpeed }
