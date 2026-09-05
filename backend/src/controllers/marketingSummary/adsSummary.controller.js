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

/**
 * GET /api/marketing/summary/ads
 * Snapshot de Ads más reciente por proyecto y tipo, ordenado por spend desc.
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

    const seen = new Set()
    const result = []
    for (const s of snapshots) {
      if (seen.has(s.projectId)) continue
      seen.add(s.projectId)
      result.push({
        projectId:      s.projectId,
        projectName:    s.project.name,
        month:          s.month,
        spend:          s.spend,
        impressions:    s.impressions,
        clicks:         s.clicks,
        ctr:            s.ctr,
        reach:          s.reach          ?? null,
        cpm:            s.cpm            ?? null,
        cpc:            s.cpc            ?? null,
        conversions:    s.conversions    ?? null,
        avgCpc:         s.avgCpc         ?? null,
        campaignsCount: s.campaignsCount,
        currency:       s.currency,
        topCampaigns:   safeParseArr(s.topCampaigns),
      })
    }

    result.sort((a, b) => b.spend - a.spend)
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

async function fetchAdsLiveData(type, ig, datePreset) {
  if (type === 'meta_ads') {
    const token = await getValidFbToken(ig)
    const data  = await fetchMetaAdsData(ig.propertyId, token, datePreset)
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
  const data = await fetchGoogleAdsData(ig, datePreset)
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
 * Query: ?type=meta_ads|google_ads&period=today|this_week|this_month
 * Devuelve { month, period, results: [{ projectId, projectName, status: 'ok'|'disconnected'|'error', objective?, ... }] }
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
        const { raw, row } = await fetchAdsLiveData(type, ig, datePreset)

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

        return { ...base, status: 'ok', ...row, objective }
      } catch (err) {
        console.error(`[AdsSummaryLive] ${type} proyecto ${ig.projectId}:`, err.message)
        return { ...base, status: 'error', error: err.message }
      }
    }))

    const ok   = results.filter(r => r.status === 'ok').sort((a, b) => b.spend - a.spend)
    const rest = results.filter(r => r.status !== 'ok')

    res.json({ month: currentMonth, period, results: [...ok, ...rest] })
  } catch (err) {
    next(err)
  }
}

module.exports = { getAdsSummary, getAdsSummaryLive }
