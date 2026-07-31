const dns = require('dns').promises
const net = require('net')

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

module.exports = { assertPublicUrl, isPrivateIp }
