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

  // Oportunidades: audits con tipo 'opportunity' y score < 1
  const opportunities = Object.values(audits)
    .filter(a =>
      a.details?.type === 'opportunity' &&
      a.score !== null &&
      a.score !== undefined &&
      a.score < 1
    )
    .sort((a, b) => (b.details?.overallSavingsMs ?? 0) - (a.details?.overallSavingsMs ?? 0))
    .slice(0, 8)
    .map(a => ({
      id:          a.id,
      title:       a.title,
      description: a.description,
      savingsMs:   Math.round(a.details?.overallSavingsMs ?? 0),
      score:       a.score,
    }))

  // Diagnósticos: audits fallidos que no son oportunidades
  const diagnostics = Object.values(audits)
    .filter(a =>
      a.details?.type === 'table' &&
      a.score !== null &&
      a.score !== undefined &&
      a.score < 1
    )
    .slice(0, 6)
    .map(a => ({
      id:          a.id,
      title:       a.title,
      description: a.description,
      score:       a.score,
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
      params:  { url, strategy, key: apiKey, category: 'performance' },
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

module.exports = { runPageSpeedAnalysis }
