/**
 * adsSummary.controller.js
 * Vistas globales cross-proyecto de inversión publicitaria (Meta Ads / Google Ads).
 */

const prisma = require('../../lib/prisma')
const { computeObjectives } = require('../../services/marketingObjectives.service')
const { getValidFbToken, fetchMetaAdsData } = require('../../services/metaAds.service')
const { fetchGoogleAdsData }                = require('../../services/googleAds.service')
const { todayString, DEFAULT_TZ } = require('../../utils/dates')

function safeParseArr(v) {
  try { return JSON.parse(v) } catch { return [] }
}

// Marca `starred` (preferencia personal, mismo criterio que "Mis Proyectos" y el panel
// de Prioridades) sobre una lista de filas con `projectId`, para que el frontend pueda
// mostrar los destacados agrupados aparte del resto.
async function markStarred(rows, userId) {
  if (!rows.length) return rows
  const stars = await prisma.projectStar.findMany({
    where:  { userId, projectId: { in: rows.map(r => r.projectId) } },
    select: { projectId: true },
  })
  const starredSet = new Set(stars.map(s => s.projectId))
  return rows.map(r => ({ ...r, starred: starredSet.has(r.projectId) }))
}

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

// Rango de fechas del período INMEDIATO ANTERIOR equivalente, con la MISMA cantidad de
// días transcurridos que el período actual (ej. "este mes" con hoy=15 compara contra el
// 1-15 del mes anterior, no el mes anterior completo) — mismo criterio de "ventanas de
// igual largo" que ya usa Productividad, así los números quedan comparables. Se usa para
// pintar en rojo/verde si una métrica bajó o subió (ver CrossProjectAdsPanel.jsx).
function previousRangeFor(period, todayStr) {
  if (period === 'today') {
    const yesterday = addDaysToDateStr(todayStr, -1)
    return { startDate: yesterday, endDate: yesterday }
  }
  if (period === 'this_week') {
    const [y, m, d] = todayStr.split('-').map(Number)
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=domingo..6=sábado
    const daysSinceMonday = (dow + 6) % 7
    const endDate   = addDaysToDateStr(todayStr, -7)
    const startDate = addDaysToDateStr(endDate, -daysSinceMonday)
    return { startDate, endDate }
  }
  if (period === 'this_month') {
    const [y, m, d]      = todayStr.split('-').map(Number)
    const prevMonthFirst = new Date(Date.UTC(y, m - 2, 1))
    const prevMonthDays  = new Date(Date.UTC(y, m - 1, 0)).getUTCDate()
    const endDay         = Math.min(d, prevMonthDays)
    return {
      startDate: prevMonthFirst.toISOString().slice(0, 10),
      endDate:   new Date(Date.UTC(prevMonthFirst.getUTCFullYear(), prevMonthFirst.getUTCMonth(), endDay)).toISOString().slice(0, 10),
    }
  }
  return null
}

/**
 * GET /api/marketing/summary/ads
 * Snapshot de Ads más reciente por proyecto y tipo, ordenado por spend desc. Incluye
 * `prev` (el snapshot inmediatamente anterior, mes -2) para que el frontend pueda pintar
 * en rojo/verde las métricas que bajaron/subieron, y `starred` para agrupar destacados.
 * Query: ?type=meta_ads|google_ads
 */
async function getAdsSummary(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { type }    = req.query

    if (!['meta_ads', 'google_ads'].includes(type)) {
      return res.status(400).json({ error: 'Parámetro type requerido: meta_ads | google_ads' })
    }

    const snapshots = await prisma.adsSnapshot.findMany({
      where:   { workspaceId, type, project: { active: true } },
      orderBy: { month: 'desc' },
      include: { project: { select: { id: true, name: true } } },
    })

    // Se guardan hasta 2 por proyecto (ya vienen ordenados desc por mes): el más
    // reciente (lo que se muestra) y el anterior (para la comparación de tendencia).
    const byProject = new Map()
    for (const s of snapshots) {
      if (!byProject.has(s.projectId)) byProject.set(s.projectId, [])
      const arr = byProject.get(s.projectId)
      if (arr.length < 2) arr.push(s)
    }

    let result = [...byProject.values()].map(([cur, prev]) => ({
      projectId:      cur.projectId,
      projectName:    cur.project.name,
      month:          cur.month,
      spend:          cur.spend,
      impressions:    cur.impressions,
      clicks:         cur.clicks,
      ctr:            cur.ctr,
      reach:          cur.reach          ?? null,
      cpm:            cur.cpm            ?? null,
      cpc:            cur.cpc            ?? null,
      conversions:    cur.conversions    ?? null,
      avgCpc:         cur.avgCpc         ?? null,
      campaignsCount: cur.campaignsCount,
      currency:       cur.currency,
      topCampaigns:   safeParseArr(cur.topCampaigns),
      prev: prev ? {
        spend: prev.spend, impressions: prev.impressions, clicks: prev.clicks,
        ctr: prev.ctr, conversions: prev.conversions ?? null,
      } : null,
    }))

    result.sort((a, b) => b.spend - a.spend)
    result = await markStarred(result, req.user.userId)
    res.json(result)
  } catch (err) {
    next(err)
  }
}

// Mapea nuestra clave de período interna al date_preset que espera cada plataforma.
const ADS_LIVE_PERIODS = {
  today:      { meta_ads: 'today',              google_ads: 'today' },
  this_week:  { meta_ads: 'this_week_mon_today', google_ads: 'this_week' },
  this_month: { meta_ads: 'this_month',          google_ads: 'this_month' },
}

async function fetchAdsLiveData(type, ig, datePreset, dateRange = null) {
  if (type === 'meta_ads') {
    const token = await getValidFbToken(ig)
    const data  = await fetchMetaAdsData(ig.propertyId, token, datePreset, dateRange)
    return {
      raw: data,
      row: {
        spend: data.spend, impressions: data.impressions, clicks: data.clicks, ctr: data.ctr,
        reach: data.reach ?? null, cpm: data.cpm ?? null, cpc: data.cpc ?? null,
        conversions: null, avgCpc: null, campaignsCount: (data.campaigns ?? []).length,
      },
    }
  }
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN no configurado')
  const data = await fetchGoogleAdsData(ig, datePreset, dateRange)
  return {
    raw: data,
    row: {
      spend: data.cost, impressions: data.impressions, clicks: data.clicks, ctr: data.ctr,
      reach: null, cpm: null, cpc: data.avgCpc ?? null,
      conversions: data.conversions ?? null, avgCpc: data.avgCpc ?? null, campaignsCount: (data.campaigns ?? []).length,
    },
  }
}

/**
 * GET /api/marketing/summary/ads-live
 * Gasto por proyecto EN VIVO (sin snapshot cacheado), para el período elegido
 * (?period=today|this_week|this_month, default this_month). A diferencia de
 * /summary/ads (que muestra el último snapshot cerrado, guardado por el cron del
 * día 1° — típicamente el mes anterior), este endpoint pega en vivo a la API de
 * Meta/Google Ads en cada carga, igual que ya hace la pestaña de un proyecto
 * individual. En PARALELO (a diferencia del refresh de scraping de RRSS, acá no hay
 * costo por llamada ni cooldown que cuidar — son APIs de lectura de Meta/Google).
 * No persiste nada (el período en curso cambia; guardarlo como AdsSnapshot
 * mezclaría datos parciales con el snapshot final que arma el cron al cierre del mes).
 * Incluye TODOS los proyectos con una integración de este tipo alguna vez conectada
 * (incluidos los que tienen el token vencido, status 'disconnected') — así no se
 * pierden de vista al desconectarse solos; el frontend los muestra con aviso de reconexión.
 *
 * Objetivo de inversión: si el proyecto tiene un MarketingObjective (category:'ads',
 * metric:'inversion', platform:type) configurado, se agrega `objective` con el progreso
 * del período calendario en curso (mes/trimestre/año según periodicidad) — SIEMPRE en
 * base al mes actual, independiente del filtro de arriba (que puede ser "hoy" o "esta
 * semana", datos parciales que no representan bien el objetivo mensual/trimestral/anual).
 * Si el filtro elegido ya es "this_month" se reutiliza esa misma data (sin pegarle 2
 * veces a la API); si no, se hace un fetch aparte best-effort (no rompe la fila si falla).
 *
 * Tendencia: además se trae, en paralelo y best-effort, el mismo tramo de días pero del
 * período INMEDIATO ANTERIOR (`previousRangeFor`) y se expone como `prev` — el frontend
 * lo usa para pintar en rojo/verde las métricas que bajaron/subieron. `starred` marca los
 * proyectos destacados del usuario (mismo criterio que "Mis Proyectos"), para agruparlos
 * aparte del resto.
 *
 * Query: ?type=meta_ads|google_ads&period=today|this_week|this_month
 * Devuelve { month, period, results: [{ projectId, projectName, starred, status: 'ok'|'disconnected'|'error', objective?, prev?, ... }] }
 */
async function getAdsSummaryLive(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const { type }     = req.query
    const tz           = req.workspace.timezone || DEFAULT_TZ
    const period       = ADS_LIVE_PERIODS[req.query.period] ? req.query.period : 'this_month'
    const currentMonth = todayString(tz).slice(0, 7)

    if (!['meta_ads', 'google_ads'].includes(type)) {
      return res.status(400).json({ error: 'Parámetro type requerido: meta_ads | google_ads' })
    }
    const datePreset = ADS_LIVE_PERIODS[period][type]
    const prevRange  = previousRangeFor(period, todayString(tz))

    // Sin `select`: getValidFbToken/fetchGoogleAdsData necesitan el registro completo
    // (accessToken, refreshToken, expiresAt, id) para refrescar el token si hace falta.
    const integrations = await prisma.projectIntegration.findMany({
      where:   { workspaceId, type, project: { active: true } },
      include: { project: { select: { name: true } } },
    })

    // Objetivos de inversión configurados para estos proyectos (a lo sumo uno por proyecto+plataforma).
    const objectiveRows = integrations.length
      ? await prisma.marketingObjective.findMany({
          where: { workspaceId, category: 'ads', metric: 'inversion', platform: type, projectId: { in: integrations.map(i => i.projectId) } },
        })
      : []
    const objectiveByProject = new Map(objectiveRows.map(o => [o.projectId, o]))

    const results = await Promise.all(integrations.map(async (ig) => {
      const base = { projectId: ig.projectId, projectName: ig.project.name }
      const connected = type === 'meta_ads'
        ? (ig.status === 'active' && !!ig.propertyId)
        : (ig.status === 'active' && !!ig.customerId)
      if (!connected) return { ...base, status: 'disconnected' }

      try {
        const [{ raw, row }, prevRow] = await Promise.all([
          fetchAdsLiveData(type, ig, datePreset),
          prevRange
            ? fetchAdsLiveData(type, ig, null, prevRange).then(r => r.row).catch(() => null)
            : Promise.resolve(null),
        ])

        let objective = null
        const obj = objectiveByProject.get(ig.projectId)
        if (obj) {
          let monthRaw = period === 'this_month' ? raw : null
          if (!monthRaw) {
            monthRaw = await fetchAdsLiveData(type, ig, 'this_month').then(r => r.raw).catch(() => null)
          }
          if (monthRaw) {
            const objResults = await computeObjectives({
              projectId: ig.projectId, workspaceId, dataMonth: currentMonth,
              googleAds: type === 'google_ads' ? monthRaw : null,
              metaAds:   type === 'meta_ads'   ? monthRaw : null,
            })
            const o = objResults.find(r => r.id === obj.id)
            if (o && o.actual != null) {
              objective = {
                target:      o.target,
                actual:      o.actual,
                pct:         o.target > 0 ? Math.round(o.actual / o.target * 100) : null,
                periodLabel: o.periodLabel,
                periodicity: o.periodicity,
              }
            }
          }
        }

        const prev = prevRow ? {
          spend: prevRow.spend, impressions: prevRow.impressions, clicks: prevRow.clicks,
          ctr: prevRow.ctr, conversions: prevRow.conversions,
        } : null

        return { ...base, status: 'ok', ...row, objective, prev }
      } catch (err) {
        console.error(`[AdsSummaryLive] ${type} proyecto ${ig.projectId}:`, err.message)
        return { ...base, status: 'error', error: err.message }
      }
    }))

    const starredResults = await markStarred(results, req.user.userId)
    const ok   = starredResults.filter(r => r.status === 'ok').sort((a, b) => b.spend - a.spend)
    const rest = starredResults.filter(r => r.status !== 'ok')

    res.json({ month: currentMonth, period, results: [...ok, ...rest] })
  } catch (err) {
    next(err)
  }
}

module.exports = { getAdsSummary, getAdsSummaryLive, previousRangeFor }
