const dns = require('dns').promises
const net = require('net')
const axios = require('axios')

// Rangos de IPv4 privados/reservados/loopback/link-local/metadata de nube/CGNAT.
const PRIVATE_RANGES_V4 = [
  /^0\./,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
]

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase()
    return lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd') || lower === '::'
  }
  return PRIVATE_RANGES_V4.some(re => re.test(ip))
}

/**
 * Valida que `urlString` sea http(s) y resuelva a una IP pública. Lanza si no.
 * Usar ANTES de cualquier fetch/axios sobre una URL provista por un usuario del
 * workspace (Project.websiteUrl, Company.website, etc.) — previene SSRF hacia
 * la red interna (metadata de la nube, servicios privados de la infraestructura).
 */
async function assertPublicUrl(urlString) {
  let parsed
  try { parsed = new URL(urlString) } catch { throw new Error('URL inválida') }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('Solo se permiten URLs http/https')

  const hostname = parsed.hostname
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('No se permite acceder a hosts locales')
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('No se permite acceder a direcciones IP privadas')
    return
  }

  const addresses = await dns.lookup(hostname, { all: true })
  if (addresses.length === 0) throw new Error('No se pudo resolver el dominio')
  for (const { address } of addresses) {
    if (isPrivateIp(address)) throw new Error('El dominio resuelve a una dirección IP privada')
  }
}

const DEFAULT_MAX_REDIRECTS = 5

/**
 * GET seguro sobre una URL provista por un usuario del workspace, siguiendo
 * redirects A MANO: cada salto (incluida la URL inicial) pasa por
 * assertPublicUrl ANTES de pedirse.
 *
 * Usar esto en vez de axios.get(url, { maxRedirects: N }) para cualquier URL
 * de usuario (Project.websiteUrl, Company.website, un competidor del SERP,
 * etc.) — con `maxRedirects` nativo de axios, assertPublicUrl solo valida la
 * URL ORIGINAL: un host público controlado por un atacante puede devolver un
 * 302 hacia la red interna (metadata de la nube, servicios privados de la
 * infraestructura) y axios lo sigue sin volver a chequear nada. Mismo patrón
 * que ya usa controllers/tasks/attachments.controller.js#downloadPublicUrl.
 *
 * @param {string} urlString
 * @param {object} axiosOpts — se pasan a axios.get tal cual, salvo
 *   `maxRedirects` (se ignora: siempre se sigue a mano) y `validateStatus`
 *   (se aplica solo a la respuesta FINAL, no a los redirects intermedios).
 * @returns {Promise<import('axios').AxiosResponse>}
 */
async function fetchPublicUrl(urlString, axiosOpts = {}) {
  const { maxRedirects, validateStatus, ...rest } = axiosOpts
  const limit = maxRedirects ?? DEFAULT_MAX_REDIRECTS
  let url = urlString
  for (let hop = 0; hop <= limit; hop++) {
    await assertPublicUrl(url)
    const res = await axios.get(url, { ...rest, maxRedirects: 0, validateStatus: () => true })
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      url = new URL(res.headers.location, url).toString()
      continue
    }
    if (validateStatus && !validateStatus(res.status)) {
      throw Object.assign(new Error(`Request failed with status code ${res.status}`), { response: res })
    }
    return res
  }
  throw new Error('Demasiados redirects')
}

module.exports = { assertPublicUrl, isPrivateIp, fetchPublicUrl }
