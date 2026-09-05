const { logTokens } = require('../../lib/logTokens')
const { anthropic, hasTokenBudget } = require('../../lib/claude')

// Arma un contexto compacto de los briefs del cliente para el prompt de IA.
// Los briefs (memoria, marca, y los por-servicio) aportan objetivos, tono y contexto.
// Se recorta agresivamente por tokens: máx ~3500 chars totales, ~400 por valor.
function buildBriefsContext(briefs) {
  if (!briefs) return ''
  const arr = Array.isArray(briefs) ? briefs : Object.entries(briefs).map(([type, answers]) => ({ type, answers }))
  const TYPE_LABEL = {
    memoria: 'Memoria / notas del cliente', marca: 'Marca (documento madre)',
    organico: 'Orgánico / RRSS', meta_ads: 'Meta Ads', web: 'Web', seo_sem: 'SEO / SEM', crm: 'CRM',
  }
  const parts = []
  let budget = 3500
  for (const b of arr) {
    const answers = b.answers && typeof b.answers === 'object' ? b.answers : {}
    const lines = []
    for (const [k, v] of Object.entries(answers)) {
      if (v == null || v === '' || v === false) continue
      const val = String(v).replace(/\s+/g, ' ').trim().slice(0, 400)
      if (!val) continue
      const line = `- ${k}: ${val}`
      lines.push(line)
    }
    if (lines.length === 0) continue
    const block = `[${TYPE_LABEL[b.type] || b.type}]\n${lines.join('\n')}`
    if (budget - block.length < 0) { parts.push(block.slice(0, Math.max(0, budget))); break }
    parts.push(block)
    budget -= block.length
  }
  if (parts.length === 0) return ''
  return `\nCONTEXTO DEL CLIENTE (briefs cargados — usalos para entender los objetivos de negocio, la marca y el tono; alineá el análisis a esto):\n${parts.join('\n\n')}\n`
}

// Análisis vacío con motivo de falla (se propaga al front como `analysisError`).
// El `_error` nunca se cachea porque solo se persiste el análisis cuando hay `resumen`.
function emptyAnalysis(error) {
  return { resumen: '', highlights: [], alertas: [], nextSteps: [], _error: error }
}

async function generateAnalysis({ project, month, periodLabel, geo, analytics, instagram, tiktok, youtube, linkedin, facebook, keywords, seo, performance, googleAds, metaAds, competitors, workspaceId, objectives = [], services = [], briefs = null }) {
  // Cumplimiento de objetivos (array calculado por computeObjectives)
  const fmtVal = (v, unit) => v == null ? '—' : (unit === '$' ? `$${v}` : unit === '%' ? `${v}%` : unit === 'pos' ? `#${v}` : `${v}`)
  const objCtx = (Array.isArray(objectives) ? objectives : [])
    .filter(o => o.status !== 'orphaned')
    .map(o => ({
      metrica:  `${o.label} (${o.periodLabel})`,
      objetivo: o.metric === 'competidores' ? 'superar competidor' : fmtVal(o.target, o.unit),
      real:     fmtVal(o.actual, o.unit),
      pct:      o.pct,
      status:   o.status,
    }))

  const dataCtx = JSON.stringify({
    proyecto:          project?.name,
    mes:               month,
    serviciosContratados: services.length > 0 ? services : null,
    geo:      geo      ? { score: geo.score, band: geo.band } : null,
    analytics: analytics ? {
      sesiones:       analytics.sessions,
      deltaSesiones:  analytics.delta?.sessions,
      nuevosUsuarios: analytics.newUsers,
      deltaNuevos:    analytics.delta?.newUsers,
      conversiones:   analytics.conversions,
      deltaConversiones: analytics.delta?.conversions,
      tasaRebote:     analytics.bounceRate != null ? `${(analytics.bounceRate * 100).toFixed(1)}%` : null,
    } : null,
    instagram: instagram ? {
      seguidores:      instagram.followersCount,
      deltaSeguidores: instagram.deltaFollowers,
      engagement:      instagram.engagementRate != null ? `${instagram.engagementRate.toFixed(2)}%` : null,
      posts:           instagram.postsCount,
    } : null,
    // Solo se incluye cuando la cuenta propia LIDERA frente a competidores (rank #1).
    competidores: competitors ? {
      vsCompetidores: competitors.competitorsCount,
      lideramosEn:    competitors.wins.map(w => w.label),
    } : null,
    tiktok: tiktok ? {
      seguidores:      tiktok.followersCount,
      deltaSeguidores: tiktok.deltaFollowers,
      engagement:      tiktok.engagementRate != null ? `${tiktok.engagementRate.toFixed(2)}%` : null,
    } : null,
    youtube: youtube ? {
      suscriptores:      youtube.subscriberCount,
      deltaSuscriptores: youtube.deltaSubscribers,
      vistasDelMes:      youtube.monthViews,
      videosNuevos:      youtube.videosThisMonth,
      shorts:            youtube.shortsThisMonth,
      videosLargos:      youtube.longsThisMonth,
      engagement:        youtube.engagementRate != null ? `${youtube.engagementRate.toFixed(2)}%` : null,
    } : null,
    linkedin: linkedin ? {
      seguidores:       linkedin.followersCount,
      deltaSeguidores:  linkedin.deltaFollowers,
      impresiones:      linkedin.impressions,
      deltaImpresiones: linkedin.deltaImpressions,
      clicks:           linkedin.clicks,
      engagement:       linkedin.engagementRate != null ? `${linkedin.engagementRate.toFixed(2)}%` : null,
      posts:            linkedin.postsThisMonth,
    } : null,
    facebook: facebook ? {
      seguidores:      facebook.followersCount,
      deltaSeguidores: facebook.deltaFollowers,
      alcance:         facebook.reach,
      engagement:      facebook.engagementRate != null ? `${facebook.engagementRate.toFixed(2)}%` : null,
      posts:           facebook.postsThisMonth,
    } : null,
    posicionamiento: keywords ? {
      posPromedio:   keywords.avgPosition,
      totalKeywords: keywords.count,
      mejoraronTop3: keywords.improved.slice(0, 3).map(k => k.query),
    } : null,
    seo: seo ? {
      clicks:      seo.clicks,
      impresiones: seo.impressions,
      ctr:         seo.ctr != null ? `${(seo.ctr * 100).toFixed(2)}%` : null,
      posPromedio: seo.avgPosition,
      deltaClicks: seo.delta?.clicks,
    } : null,
    performance: performance ? {
      mobile:  performance.mobile?.score,
      desktop: performance.desktop?.score,
    } : null,
    googleAds: googleAds ? {
      inversion: `$${googleAds.cost.toFixed(2)}`,
      clicks:    googleAds.clicks,
      ctr:       `${googleAds.ctr}%`,
      conversiones: googleAds.conversions,
    } : null,
    metaAds: metaAds ? {
      inversion: `$${metaAds.spend.toFixed(2)}`,
      clicks:    metaAds.clicks,
      ctr:       `${metaAds.ctr}%`,
      alcance:   metaAds.reach,
    } : null,
  }, null, 2)

  const objetivosBloque = objCtx.length > 0
    ? `\nCUMPLIMIENTO DE OBJETIVOS (mencioná explícitamente qué se cumplió y qué no):\n${objCtx.map(o => `- ${o.metrica}: objetivo ${o.objetivo}, real ${o.real}${o.pct != null ? ` (${o.pct}% de cumplimiento)` : ''}`).join('\n')}\n`
    : ''

  const serviciosBloque = services.length > 0
    ? `\nSERVICIOS CONTRATADOS (enfocá el análisis solo en estas áreas):\n${services.map(s => `- ${s}`).join('\n')}\n`
    : ''

  const briefsBloque = buildBriefsContext(briefs)
  const periodoTxt   = periodLabel || month

  const prompt = `Sos un analista de marketing digital experto en comunicación con clientes.
Redactá un análisis en español para el informe del proyecto "${project?.name}" correspondiente al período: ${periodoTxt}.
${serviciosBloque}${briefsBloque}
DATOS DEL PERÍODO:
${dataCtx}
${objetivosBloque}
INSTRUCCIONES DE TONO (MUY IMPORTANTE):
- El NORTE del análisis son los OBJETIVOS del cliente (y el contexto de sus briefs si están): leé cada resultado a la luz de si acerca o aleja de esos objetivos.
- El informe tiene sesgo POSITIVO: destacá primero los logros y avances
- Si hay objetivos definidos, mencioná explícitamente si se cumplieron o no, con el porcentaje de avance
- Si hay métricas negativas o por debajo del objetivo, mencionálas brevemente y siempre con una propuesta de mejora concreta
- Estilo motivador, profesional y constructivo — como un partner estratégico, no como un auditor
- Si no hay datos de una área, omitila — no menciones ausencias a menos que sea relevante
- Usá números concretos en el resumen y en los highlights
- "highlights" = los 3 LOGROS concretos del período (con números); "nextSteps" = los 3 FOCOS/prioridades accionables para el próximo período (no genéricas)
- El "resumen" DEBE estar dividido en 2-3 párrafos cortos separados por un doble salto de línea real (\\n\\n) según la idea (logros / análisis / mejoras). NUNCA un solo bloque largo de texto corrido.

Respondé SOLO con un JSON con esta estructura exacta:
{
  "resumen": "Párrafo 1: logros del período con números leídos contra los objetivos.\\n\\nPárrafo 2: análisis y contexto.\\n\\nPárrafo 3: oportunidades de mejora con propuestas concretas.",
  "highlights": ["logro 1 concreto con número", "logro 2 concreto con número", "logro 3 concreto con número"],
  "alertas": ["solo si hay algo importante que mejorar, máximo 2, siempre con propuesta de solución concreta"],
  "nextSteps": ["foco/acción concreta 1", "foco 2", "foco 3"]
}`

  const tag = `Proyecto "${project?.name}" (${periodoTxt})`

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`[MonthlyReport] ${tag}: ANTHROPIC_API_KEY no configurada — no se puede generar el análisis IA`)
    return emptyAnalysis('Falta configurar la IA en el servidor (ANTHROPIC_API_KEY). Avisá al equipo técnico.')
  }

  // Presupuesto mensual de tokens de IA del workspace. El informe es el flujo más caro:
  // sin este guard un workspace podía regenerarlo en loop sin tope.
  if (!(await hasTokenBudget(workspaceId))) {
    console.warn(`[MonthlyReport] ${tag}: presupuesto de tokens de IA agotado — se omite el análisis`)
    return emptyAnalysis('Se alcanzó el límite mensual de tokens de IA del workspace. Ajustá el límite en SuperAdmin o esperá al próximo mes.')
  }

  try {
    const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      messages:   [{ role: 'user', content: prompt }],
    })

    logTokens('monthly_report', null, message.usage, workspaceId ?? null)
      .catch(err => console.error('[MonthlyReport] Error al registrar tokens de IA:', err.message))

    const stopReason = message.stop_reason
    const raw        = (message.content?.[0]?.text ?? '').trim()

    if (stopReason === 'max_tokens') {
      console.error(`[MonthlyReport] ${tag}: respuesta IA TRUNCADA por max_tokens (largo recibido: ${raw.length} chars)`)
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error(`[MonthlyReport] ${tag}: la IA no devolvió JSON. stop_reason=${stopReason}. Raw: ${raw.slice(0, 800)}`)
      return emptyAnalysis(stopReason === 'max_tokens'
        ? 'La IA quedó sin espacio y devolvió una respuesta truncada. Probá regenerar.'
        : 'La IA no devolvió un análisis con el formato esperado. Probá regenerar.')
    }

    let parsed
    try {
      parsed = JSON.parse(jsonMatch[0])
    } catch (parseErr) {
      console.error(`[MonthlyReport] ${tag}: no se pudo parsear el JSON de la IA. stop_reason=${stopReason}. ${parseErr.message}. Raw: ${raw.slice(0, 800)}`)
      return emptyAnalysis(stopReason === 'max_tokens'
        ? 'La respuesta de la IA quedó cortada y no se pudo leer. Probá regenerar.'
        : `No se pudo interpretar la respuesta de la IA (${parseErr.message}). Probá regenerar.`)
    }

    if (!parsed?.resumen || !String(parsed.resumen).trim()) {
      console.error(`[MonthlyReport] ${tag}: la IA devolvió un análisis sin resumen. Parsed: ${JSON.stringify(parsed).slice(0, 400)}`)
      return emptyAnalysis('La IA devolvió un análisis vacío (sin resumen). Probá regenerar.')
    }

    return {
      resumen:    String(parsed.resumen),
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      alertas:    Array.isArray(parsed.alertas)    ? parsed.alertas    : [],
      nextSteps:  Array.isArray(parsed.nextSteps)  ? parsed.nextSteps  : [],
    }
  } catch (err) {
    const detail = err.status ? `HTTP ${err.status}` : (err.message || 'error desconocido')
    console.error(`[MonthlyReport] ${tag}: error llamando a la IA — ${detail}`, err.stack || '')
    let msg = `No se pudo generar el análisis con IA (${detail}). Probá regenerar.`
    if (err.status === 429)      msg = 'La IA está saturada o se alcanzó el límite de uso (429). Esperá unos minutos y regenerá.'
    else if (err.status === 401) msg = 'Error de autenticación con la IA (401). Revisá la API key del servidor.'
    else if (err.status === 529) msg = 'El servicio de IA está sobrecargado (529). Reintentá en unos minutos.'
    return emptyAnalysis(msg)
  }
}

module.exports = { generateAnalysis, buildBriefsContext, emptyAnalysis }
