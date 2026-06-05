// Función serverless de Vercel para informes públicos (/report/:token).
// WhatsApp y otros scrapers NO ejecutan JS, así que el SPA estático siempre
// mostraría los Open Graph del index.html (landing). Esta función intercepta
// /report/:token, trae la metadata liviana del backend y devuelve el index.html
// con los OG reescritos (título/descr./url/imagen). El SPA igual bootea normal.
//
// Requiere la env var VITE_API_URL (o BACKEND_URL) en el proyecto de Vercel
// apuntando al backend (ej: https://blisstrackersaas-production.up.railway.app).

const BACKEND = process.env.VITE_API_URL || process.env.BACKEND_URL || ''

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function setTitle(html, value) {
  return html.replace(/<title>[^<]*<\/title>/, () => `<title>${value}</title>`)
}
function setMetaProp(html, prop, value) {
  const re = new RegExp(`(<meta property="${prop}" content=")[^"]*(")`)
  return html.replace(re, (m, p1, p2) => p1 + value + p2)
}
function setMetaName(html, name, value) {
  const re = new RegExp(`(<meta name="${name}" content=")[^"]*(")`)
  return html.replace(re, (m, p1, p2) => p1 + value + p2)
}

module.exports = async (req, res) => {
  const token = req.query.token || ''
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0]
  const host  = req.headers.host
  const origin = `${proto}://${host}`

  // 1) HTML base (SPA): se sirve estático en /index.html (no pasa por esta función)
  let html = ''
  try {
    const r = await fetch(`${origin}/index.html`)
    html = await r.text()
  } catch { /* sin html base no podemos hacer mucho */ }

  // 2) Metadata del informe (best-effort)
  let meta = null
  if (BACKEND && token) {
    try {
      const r = await fetch(`${BACKEND}/api/public/report/${encodeURIComponent(token)}/meta`)
      if (r.ok) meta = await r.json()
    } catch { /* ignore */ }
  }

  // 3) Inyectar OG si tenemos ambas cosas
  if (html && meta) {
    const title = escapeAttr(`Informe ${meta.projectName} · ${meta.monthLabel} · BlissTracker`)
    const desc  = escapeAttr(`Informe mensual de marketing${meta.workspaceName ? ` de ${meta.workspaceName}` : ''}.`)
    const url   = escapeAttr(`${origin}/report/${token}`)
    const image = meta.hasBanner
      ? escapeAttr(`${BACKEND}/api/public/report-banner/${encodeURIComponent(token)}`)
      : escapeAttr(`${origin}/og-image.png`)

    html = setTitle(html, title)
    html = setMetaName(html, 'description', desc)
    html = setMetaProp(html, 'og:title', title)
    html = setMetaProp(html, 'og:description', desc)
    html = setMetaProp(html, 'og:url', url)
    html = setMetaProp(html, 'og:image', image)
    html = setMetaName(html, 'twitter:title', title)
    html = setMetaName(html, 'twitter:description', desc)
    html = setMetaName(html, 'twitter:image', image)
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // Cache en el edge para no pegarle al backend en cada scrape, pero permitir refresco
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  res.status(200).send(html || '<!doctype html><meta http-equiv="refresh" content="0;url=/index.html">')
}
