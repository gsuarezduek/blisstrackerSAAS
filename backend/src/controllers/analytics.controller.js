const prisma = require('../lib/prisma')
const {
  fetchGA4Report, fetchAiTrafficData, fetchMonthlySeries, isGA4PermissionDenied,
} = require('../services/googleAnalytics.service')
const { askAnalytics } = require('../services/analyticsAsk.service')
const { todayString }  = require('../utils/dates')

// Acepta 'NdaysAgo', 'today', 'yesterday' o 'YYYY-MM-DD'
const VALID_GA4_DATE = /^(\d{4}-\d{2}-\d{2}|\d+daysAgo|today|yesterday)$/

function parseDateParam(val, fallback) {
  if (val && VALID_GA4_DATE.test(val.trim())) return val.trim()
  return fallback
}

/**
 * Resuelve proyecto + integración de GA4 en un solo lugar. Devuelve
 * `{ error: {status, body} }` con el mismo vocabulario de códigos que ya lee el
 * frontend (`NO_INTEGRATION` / `TOKEN_EXPIRED` / `NO_PROPERTY`), para no tener
 * una tercera redacción de los mismos tres estados.
 */
async function resolveGa4(projectId, workspaceId) {
  const project = await prisma.project.findFirst({
    where:  { id: projectId, workspaceId },
    select: { id: true, name: true, websiteUrl: true },
  })
  if (!project) return { error: { status: 404, body: { error: 'Proyecto no encontrado' } } }

  const integration = await prisma.projectIntegration.findUnique({
    where: { projectId_type: { projectId, type: 'google_analytics' } },
  })
  if (!integration) return { error: { status: 404, body: { error: 'Google Analytics no conectado', code: 'NO_INTEGRATION' } } }
  if (integration.status === 'expired' || integration.status === 'error') {
    return { error: { status: 400, body: { error: 'El token de Google Analytics expiró. Reconectá la integración.', code: 'TOKEN_EXPIRED' } } }
  }
  if (!integration.propertyId) {
    return { error: { status: 400, body: { error: 'GA4 Property ID no configurado.', code: 'NO_PROPERTY' } } }
  }
  return { project, integration }
}

/** Mapeo de errores de GA4 a respuesta HTTP (token vencido, sin permiso, el resto). */
async function respondGa4Error(err, projectId, res, label) {
  if (err?.status === 429 || err?.code === 'TOKEN_BUDGET_EXCEEDED') {
    return res.status(429).json({ error: 'El workspace agotó su presupuesto mensual de IA.', code: 'TOKEN_BUDGET_EXCEEDED' })
  }
  if (isGA4PermissionDenied(err)) {
    return res.status(400).json({ error: 'La cuenta de Google conectada no tiene acceso a esta propiedad GA4.', code: 'PERMISSION_DENIED' })
  }
  if (err?.code === 'TOKEN_EXPIRED' || /invalid_grant|UNAUTHENTICATED|Token has been expired/.test(err?.message ?? '')) {
    await prisma.projectIntegration.update({
      where: { projectId_type: { projectId, type: 'google_analytics' } },
      data:  { status: 'expired' },
    }).catch(() => {})
    return res.status(400).json({ error: 'El token de Google Analytics expiró. Reconectá la integración.', code: 'TOKEN_EXPIRED' })
  }
  console.error(`[${label}]`, err?.code ?? '', err?.message)
  return res.status(502).json({
    error: 'No se pudo obtener los datos de Google Analytics. Probá de nuevo o reconectá la integración.',
    code:  'FETCH_ERROR',
  })
}

/**
 * GET /api/marketing/projects/:id/analytics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * También acepta ?dateRange=NdaysAgo para compatibilidad.
 */
async function getAnalyticsData(req, res, next) {
  let integration
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    // Soporte para startDate/endDate explícitos o el viejo dateRange
    let startDate, endDate
    if (req.query.startDate || req.query.endDate) {
      startDate = parseDateParam(req.query.startDate, '30daysAgo')
      endDate   = parseDateParam(req.query.endDate,   'today')
    } else {
      const legacy = ['7daysAgo', '30daysAgo', '90daysAgo'].includes(req.query.dateRange)
        ? req.query.dateRange
        : '30daysAgo'
      startDate = legacy
      endDate   = 'today'
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, name: true, websiteUrl: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'google_analytics' } },
    })

    if (!integration) {
      return res.status(404).json({ error: 'Google Analytics no conectado para este proyecto' })
    }

    if (integration.status === 'error') {
      return res.status(400).json({
        error: 'La integración tiene un error. Desconectá y volvé a conectar Google Analytics.',
        status: 'error',
      })
    }

    if (!integration.propertyId) {
      return res.status(400).json({
        error: 'GA4 Property ID no configurado. Ingresalo en la tab Info del proyecto.',
        status: 'no_property',
      })
    }

    const comparePrevious = req.query.compare === 'true'
    const data = await fetchGA4Report(integration, startDate, endDate, { comparePrevious })
    res.json({ ...data, projectName: project.name, websiteUrl: project.websiteUrl })
  } catch (err) {
    // Sin acceso a la propiedad: es un problema de configuración (Property ID o permisos
    // en GA4), no un fallo del servidor ni un token vencido — no marcamos la integración.
    if (isGA4PermissionDenied(err)) {
      const propertyId = String(integration?.propertyId ?? '').replace(/^properties\//, '')
      console.warn(`[analytics.getAnalyticsData] sin acceso a la propiedad GA4 ${propertyId} (proyecto ${req.params.id})`)
      return res.status(400).json({
        error: `La cuenta de Google conectada no tiene acceso a la propiedad GA4 ${propertyId}. Verificá el Property ID o pedí acceso a esa propiedad en Google Analytics.`,
        code:  'PERMISSION_DENIED',
        propertyId,
      })
    }
    console.error('[analytics.getAnalyticsData] error:', err.code ?? '', err.message)
    // Marcar como error si el token fue revocado por el usuario en Google
    if (
      err.code === 'TOKEN_EXPIRED' ||
      err.message?.includes('invalid_grant') ||
      err.message?.includes('Token has been expired') ||
      err.message?.includes('UNAUTHENTICATED')
    ) {
      await prisma.projectIntegration.update({
        where: { projectId_type: { projectId: Number(req.params.id), type: 'google_analytics' } },
        data:  { status: 'expired' },
      }).catch(err => console.error('[Analytics] Error al marcar integración como expirada:', err.message))
      return res.status(400).json({
        error: 'El token de Google Analytics expiró. Reconectá la integración.',
        code:  'TOKEN_EXPIRED',
      })
    }
    // Cualquier otro error al pedir datos a Google: no lo dejamos caer en un 500
    // genérico — el usuario puede reintentar o reconectar sin salir de esta vista.
    return res.status(502).json({
      error: 'No se pudo obtener los datos de Google Analytics. Probá de nuevo o reconectá la integración.',
      code:  'FETCH_ERROR',
    })
  }
}

/**
 * GET /api/marketing/projects/:id/ads
 * Placeholder hasta que el Developer Token de Google Ads sea aprobado.
 */
async function getAdsData(req, res) {
  const projectId   = Number(req.params.id)
  const workspaceId = req.workspace.id

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { id: true },
  }).catch(() => null)

  if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

  const integration = await prisma.projectIntegration.findUnique({
    where: { projectId_type: { projectId, type: 'google_ads' } },
  }).catch(() => null)

  if (!integration) {
    return res.status(404).json({ error: 'Google Ads no conectado para este proyecto' })
  }

  // TODO: implementar cuando el Developer Token esté aprobado
  res.status(503).json({
    error: 'Google Ads API en proceso de configuración',
    pending: true,
  })
}

/**
 * GET /api/marketing/projects/:id/ai-traffic
 * Query: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD  (default: últimos 30 días)
 *
 * Devuelve:
 *   live:            { chatgpt: 45, claude: 12, ... }  — período solicitado en tiempo real
 *   history:         [{ month: "2026-04", chatgpt: 38, claude: 9, ... }]  — snapshots guardados
 *   geoResolutions:  [{ month: "2026-04", items: ["Agregar llms.txt", ...] }]  — recomendaciones
 *                    GEO completadas ese mes (vía GeoFindingTask → Task.completedAt), para marcar
 *                    el historial — es una correlación a simple vista, no una medición causal
 *                    (el tráfico IA es mensual y de todo el sitio, no por recomendación).
 */
async function getAiTrafficData(req, res, next) {
  try {
    const projectId   = Number(req.params.id)
    const workspaceId = req.workspace.id

    const startDate = parseDateParam(req.query.startDate, '30daysAgo')
    const endDate   = parseDateParam(req.query.endDate,   'today')

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, name: true },
    })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })

    const integration = await prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type: 'google_analytics' } },
    })

    if (!integration) {
      return res.status(404).json({ error: 'Google Analytics no conectado', code: 'NO_INTEGRATION' })
    }
    if (integration.status === 'expired') {
      return res.status(400).json({ error: 'Token expirado. Reconectá GA4.', code: 'TOKEN_EXPIRED' })
    }
    if (!integration.propertyId) {
      return res.status(400).json({ error: 'GA4 Property ID no configurado.', code: 'NO_PROPERTY' })
    }

    // Fetch en paralelo: datos live + histórico de snapshots + recomendaciones GEO resueltas
    const [live, snapshots, geoLinks] = await Promise.all([
      fetchAiTrafficData(integration, startDate, endDate),
      prisma.analyticsSnapshot.findMany({
        where:   { projectId, workspaceId },
        orderBy: { month: 'asc' },
        select:  { month: true, aiTraffic: true },
      }),
      prisma.geoFindingTask.findMany({
        where:   { audit: { projectId }, task: { status: 'COMPLETED', completedAt: { not: null } } },
        select:  { task: { select: { completedAt: true, description: true } } },
      }),
    ])

    // Parsear histórico — solo incluir meses que tengan algún dato de IA
    const history = snapshots
      .map(s => {
        let t = {}
        try { t = JSON.parse(s.aiTraffic || '{}') } catch { /* ignore */ }
        const total = Object.values(t).reduce((a, b) => a + b, 0)
        return total > 0 ? { month: s.month, ...t } : null
      })
      .filter(Boolean)

    // Agrupar recomendaciones GEO completadas por mes de cierre
    const resolutionsByMonth = new Map()
    for (const { task } of geoLinks) {
      const month = task.completedAt.toISOString().slice(0, 7)
      if (!resolutionsByMonth.has(month)) resolutionsByMonth.set(month, [])
      resolutionsByMonth.get(month).push(task.description)
    }
    const geoResolutions = [...resolutionsByMonth.entries()].map(([month, items]) => ({ month, items }))

    res.json({ live, history, projectName: project.name, geoResolutions })
  } catch (err) {
    if (
      err.code === 'TOKEN_EXPIRED' ||
      err.message?.includes('invalid_grant') ||
      err.message?.includes('UNAUTHENTICATED')
    ) {
      await prisma.projectIntegration.update({
        where: { projectId_type: { projectId: Number(req.params.id), type: 'google_analytics' } },
        data:  { status: 'expired' },
      }).catch(() => {})
      return res.status(400).json({ error: 'Token expirado. Reconectá GA4.', code: 'TOKEN_EXPIRED' })
    }
    if (isGA4PermissionDenied(err)) {
      return res.status(400).json({ error: 'La cuenta de Google conectada no tiene acceso a esta propiedad GA4.', code: 'PERMISSION_DENIED' })
    }
    next(err)
  }
}


/**
 * GET /api/marketing/projects/:id/analytics/monthly?months=12
 *
 * Serie mes a mes de visitas y eventos clave para el gráfico de evolución.
 * Sale de UNA consulta a GA4 con la dimensión `yearMonth` (no de AnalyticsSnapshot):
 * así cubre también los meses anteriores a que el proyecto se conectara acá.
 * Un mes sin dato vuelve en `null` (no 0) y el mes en curso viene `partial: true`.
 */
async function getMonthlySeries(req, res) {
  const projectId = Number(req.params.id)
  const months    = Math.min(Math.max(Number(req.query.months) || 12, 2), 24)

  const resolved = await resolveGa4(projectId, req.workspace.id)
  if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body)

  try {
    const today = todayString(req.workspace.timezone)
    const data  = await fetchMonthlySeries(resolved.integration, months, today)
    res.json({ ...data, months, projectName: resolved.project.name })
  } catch (err) {
    return respondGa4Error(err, projectId, res, 'analytics.getMonthlySeries')
  }
}

/**
 * POST /api/marketing/projects/:id/analytics/ask
 * Body: { question: "¿cuántas visitas tuve desde Chile en el último año?" }
 *
 * Devuelve `{ answer, steps }`: la respuesta en castellano y las consultas reales
 * que la respaldan (query + filas). El frontend muestra las dos cosas — una
 * respuesta de IA sobre números sin la tabla al lado no es verificable.
 */
async function askAnalyticsQuestion(req, res) {
  const projectId = Number(req.params.id)
  const question  = String(req.body?.question ?? '').trim()

  if (question.length < 5)   return res.status(400).json({ error: 'Escribí una pregunta un poco más larga.' })
  if (question.length > 500) return res.status(400).json({ error: 'La pregunta es demasiado larga (máximo 500 caracteres).' })

  const resolved = await resolveGa4(projectId, req.workspace.id)
  if (resolved.error) return res.status(resolved.error.status).json(resolved.error.body)

  try {
    const result = await askAnalytics({
      integration: resolved.integration,
      project:     resolved.project,
      question,
      workspaceId: req.workspace.id,
      userId:      req.user?.userId ?? null,
      timezone:    req.workspace.timezone,
    })
    if (!result.answer) {
      return res.status(502).json({ error: 'La IA no devolvió una respuesta. Probá reformulando la pregunta.', code: 'EMPTY_ANSWER' })
    }
    res.json({ question, ...result })
  } catch (err) {
    return respondGa4Error(err, projectId, res, 'analytics.askAnalyticsQuestion')
  }
}

module.exports = { getAnalyticsData, getAdsData, getAiTrafficData, getMonthlySeries, askAnalyticsQuestion }
