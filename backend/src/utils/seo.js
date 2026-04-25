/**
 * Normaliza una URL de sitio para Google Search Console.
 * Las propiedades URL-prefix deben ser https:// y terminar con "/".
 * Las propiedades sc-domain: se dejan tal cual.
 */
function normalizeSiteUrl(url) {
  if (!url || url.startsWith('sc-domain:')) return url
  let u = url
  if (!u.match(/^https?:\/\//i)) {
    u = 'https://' + u          // sin protocolo → agregar https
  } else {
    u = u.replace(/^http:\/\//i, 'https://')  // http → https
  }
  return u.endsWith('/') ? u : u + '/'
}

module.exports = { normalizeSiteUrl }
