const axios = require('axios')
const prisma = require('../lib/prisma')
const { MARKETING_PROJECT_WHERE } = require('../lib/projectModules')
const { extractDomain } = require('./serpApi.service')

// Endpoint "free" de Ahrefs: las consultas no se cobran, pero **sí exigen una API
// key de APIv3** (`Authorization: Bearer`). Una cuenta gratuita de Ahrefs alcanza
// para generarla (Account settings → API keys). Sin el header, Ahrefs responde
// 403 `["Error","Forbidden"]` — era el motivo por el que "Actualizar DR" no hacía
// nada: el fallo se tragaba en silencio si el proyecto ya tenía un DR cacheado.
// https://docs.ahrefs.com/en/api/reference/public/get-domain-rating-free
const AHREFS_DR_FREE = 'https://api.ahrefs.com/v3/public/domain-rating-free'

// La card muestra las últimas lecturas como las pastillas de Web → Performance
// (ahí el frontend pide limit=6). El resto queda en la tabla.
const DR_HISTORY_LIMIT = 6

/** ¿Hay API key de Ahrefs en este servidor? Mismo criterio que SERP_API_KEY. */
function isAhrefsConfigured() {
  return !!process.env.AHREFS_API_KEY
}

/**
 * Consulta el Domain Rating (0-100) de un dominio y devuelve
 * `{ domainRating, error }` — `error` es un código propio (`NOT_CONFIGURED`,
 * `INVALID_URL`, `UNAUTHORIZED`, `RATE_LIMITED`, `UPSTREAM`) para que quien llama
 * pueda decir QUÉ falló. Nunca lanza — pensado para usarse también en crons.
 */
async function fetchDomainRatingResult(websiteUrl) {
  const domain = extractDomain(websiteUrl)
  if (!domain) return { domainRating: null, error: 'INVALID_URL' }

  const apiKey = process.env.AHREFS_API_KEY
  if (!apiKey) return { domainRating: null, error: 'NOT_CONFIGURED', domain }

  try {
    const { data } = await axios.get(AHREFS_DR_FREE, {
      params:  { target: domain, output: 'json' },
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      timeout: 15000,
    })
    const dr = data?.domain_rating?.domain_rating
    if (typeof dr !== 'number') return { domainRating: null, error: 'UPSTREAM', domain }
    return { domainRating: dr, error: null, domain }
  } catch (err) {
    const status = err.response?.status
    const error  = status === 401 || status === 403 ? 'UNAUTHORIZED'
      : status === 429 ? 'RATE_LIMITED'
      : 'UPSTREAM'
    console.error(`[ahrefs] fetchDomainRating(${domain}) falló: ${status ? `HTTP ${status}` : err.message} (${error})`)
    return { domainRating: null, error, domain }
  }
}

/**
 * Azúcar para quien sólo necesita el número (GEO audit, gamification):
 * devuelve un Number o null.
 */
async function fetchDomainRating(websiteUrl) {
  const { domainRating } = await fetchDomainRatingResult(websiteUrl)
  return domainRating
}

/** Últimas lecturas, la más nueva primero — el mismo orden que el historial de PageSpeed. */
function listDomainRatingHistory(projectId) {
  return prisma.domainRatingReading.findMany({
    where:   { projectId },
    orderBy: { createdAt: 'desc' },
    take:    DR_HISTORY_LIMIT,
    select:  { id: true, domainRating: true, createdAt: true },
  })
}

/**
 * Refresca el Domain Rating cacheado de un proyecto (Project.domainRating +
 * domainRatingAt) y agrega la lectura al historial. Devuelve
 * `{ domainRating, domainRatingAt, history, error }`. Si el fetch falla
 * devuelve el valor previo sin tocar la fecha **ni el historial**, y el motivo:
 * el valor cacheado no puede hacer pasar un fallo por éxito.
 */
async function refreshProjectDomainRating(project) {
  const { domainRating: dr, error } = await fetchDomainRatingResult(project.websiteUrl)
  if (dr == null) {
    return {
      domainRating:   project.domainRating ?? null,
      domainRatingAt: project.domainRatingAt ?? null,
      error:          error ?? 'UPSTREAM',
    }
  }
  const updated = await prisma.project.update({
    where: { id: project.id },
    data:  { domainRating: dr, domainRatingAt: new Date() },
    select: { domainRating: true, domainRatingAt: true },
  })
  let history = []
  if (project.workspaceId) {
    await prisma.domainRatingReading.create({
      data: { projectId: project.id, workspaceId: project.workspaceId, domainRating: dr },
    })
    history = await listDomainRatingHistory(project.id)
  }
  return { ...updated, history, error: null }
}

/**
 * Cron mensual: refresca el Domain Rating cacheado de todos los proyectos
 * activos con websiteUrl del workspace (independiente de tener GSC conectado).
 * Secuencial con un pequeño delay para no abusar del endpoint.
 */
async function refreshAllDomainRatings() {
  if (!isAhrefsConfigured()) {
    console.log('[ahrefs] AHREFS_API_KEY no configurada, saltando refresco de Domain Rating.')
    return
  }

  const projects = await prisma.project.findMany({
    where:  { active: true, websiteUrl: { not: null }, ...MARKETING_PROJECT_WHERE },
    select: { id: true, workspaceId: true, websiteUrl: true, domainRating: true, domainRatingAt: true },
  })

  let updated = 0, failed = 0
  for (const project of projects) {
    try {
      const before = project.domainRatingAt
      const { domainRatingAt, error } = await refreshProjectDomainRating(project)
      domainRatingAt && domainRatingAt !== before ? updated++ : failed++
      // Una key inválida falla igual en los 100 proyectos siguientes: cortar.
      if (error === 'UNAUTHORIZED') {
        console.error('[ahrefs] Ahrefs rechazó la API key — se corta el refresco masivo.')
        break
      }
    } catch (err) {
      console.error(`[ahrefs] refreshAll proyecto ${project.id}:`, err.message)
      failed++
    }
    await new Promise(r => setTimeout(r, 500))
  }
  console.log(`[ahrefs] Domain Rating refrescado: ${updated} ok, ${failed} sin dato. Total: ${projects.length}`)
}

module.exports = {
  isAhrefsConfigured,
  fetchDomainRating,
  fetchDomainRatingResult,
  listDomainRatingHistory,
  refreshProjectDomainRating,
  refreshAllDomainRatings,
}
