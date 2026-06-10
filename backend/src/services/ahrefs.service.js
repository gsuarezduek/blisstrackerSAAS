const axios = require('axios')
const prisma = require('../lib/prisma')
const { extractDomain } = require('./serpApi.service')

// Endpoint público y gratuito de Ahrefs — NO requiere API key.
// https://docs.ahrefs.com/en/api/reference/public/get-domain-rating-free
const AHREFS_DR_FREE = 'https://api.ahrefs.com/v3/public/domain-rating-free'

/**
 * Consulta el Domain Rating (0-100) de un dominio en el endpoint free de Ahrefs.
 * Devuelve un Number, o null si no se pudo obtener (URL inválida, error de red,
 * respuesta inesperada). Nunca lanza — pensado para usarse también en crons.
 */
async function fetchDomainRating(websiteUrl) {
  const domain = extractDomain(websiteUrl)
  if (!domain) return null

  try {
    const { data } = await axios.get(AHREFS_DR_FREE, {
      params:  { target: domain, output: 'json' },
      timeout: 15000,
    })
    const dr = data?.domain_rating?.domain_rating
    return typeof dr === 'number' ? dr : null
  } catch (err) {
    const reason = err.response?.status
      ? `HTTP ${err.response.status}`
      : err.message
    console.error(`[ahrefs] fetchDomainRating(${domain}) falló: ${reason}`)
    return null
  }
}

/**
 * Refresca el Domain Rating cacheado de un proyecto (Project.domainRating +
 * domainRatingAt). Devuelve { domainRating, domainRatingAt }. Si el fetch falla
 * devuelve el valor previo sin tocar la fecha.
 */
async function refreshProjectDomainRating(project) {
  const dr = await fetchDomainRating(project.websiteUrl)
  if (dr == null) {
    return { domainRating: project.domainRating ?? null, domainRatingAt: project.domainRatingAt ?? null }
  }
  const updated = await prisma.project.update({
    where: { id: project.id },
    data:  { domainRating: dr, domainRatingAt: new Date() },
    select: { domainRating: true, domainRatingAt: true },
  })
  return updated
}

/**
 * Cron mensual: refresca el Domain Rating cacheado de todos los proyectos
 * activos con websiteUrl del workspace (independiente de tener GSC conectado).
 * Secuencial con un pequeño delay para no abusar del endpoint público.
 */
async function refreshAllDomainRatings() {
  const projects = await prisma.project.findMany({
    where:  { active: true, websiteUrl: { not: null } },
    select: { id: true, websiteUrl: true, domainRating: true, domainRatingAt: true },
  })

  let updated = 0, failed = 0
  for (const project of projects) {
    try {
      const before = project.domainRatingAt
      const { domainRatingAt } = await refreshProjectDomainRating(project)
      domainRatingAt && domainRatingAt !== before ? updated++ : failed++
    } catch (err) {
      console.error(`[ahrefs] refreshAll proyecto ${project.id}:`, err.message)
      failed++
    }
    await new Promise(r => setTimeout(r, 500))
  }
  console.log(`[ahrefs] Domain Rating refrescado: ${updated} ok, ${failed} sin dato. Total: ${projects.length}`)
}

module.exports = { fetchDomainRating, refreshProjectDomainRating, refreshAllDomainRatings }
