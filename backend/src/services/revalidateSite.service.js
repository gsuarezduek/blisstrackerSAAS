/**
 * Avisa al sitio público que algo que muestra cambió, para que vuelva a renderizar la
 * página sin esperar su ventana de ISR.
 *
 * El sitio público (carpeta `web/`) pre-renderiza la landing, los precios, los legales y
 * el blog leyendo esta API, y los cachea entre 5 minutos y 1 hora. Sin este aviso, un
 * cambio hecho en SuperAdmin tarda ese rato en verse — que para quien acaba de apretar
 * "Guardar" parece que no se guardó.
 *
 * Es best-effort a propósito: si el sitio no contesta, el guardado YA pasó y no se toca.
 * El ISR sigue puesto del otro lado, así que el cambio se va a ver igual, más tarde.
 * Por eso nunca lanza ni se espera: se dispara y se sigue.
 */
const { siteBase } = require('../lib/publicUrls')

const TIMEOUT_MS = 4000

/**
 * @param {object}   opts
 * @param {string[]} opts.tags  etiquetas de fetch a invalidar ('landing', 'pricing', 'legal', 'blog')
 * @param {string[]} opts.paths rutas del sitio a re-renderizar ('/', '/pricing', '/blog')
 */
function revalidateSite({ tags = [], paths = [] } = {}) {
  const secret = process.env.REVALIDATE_SECRET
  // Sin secreto configurado no es un error: es un entorno donde el sitio público no
  // está desplegado (local, o antes de setear la variable en Railway).
  if (!secret) return
  if (tags.length === 0 && paths.length === 0) return

  const url = `${siteBase()}/api/revalidate`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, tags, paths }),
    signal: controller.signal,
  })
    .then(res => {
      if (!res.ok) console.warn(`[revalidateSite] ${res.status} al revalidar ${tags.join(',')}`)
    })
    .catch(err => {
      if (err.name !== 'AbortError') console.warn('[revalidateSite] falló:', err.message)
      else console.warn('[revalidateSite] timeout')
    })
    .finally(() => clearTimeout(timer))
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Middleware: revalida el sitio público después de una escritura exitosa.
 *
 * Se monta sobre los grupos de rutas de SuperAdmin que editan contenido público, en vez
 * de llamar a revalidateSite() dentro de cada controlador: son ~20 endpoints (contenido
 * de la landing, logos de clientes, testimonios, posts, legales, precios) y uno nuevo se
 * olvidaría de avisar. Acá alcanza con que la ruta cuelgue del grupo.
 *
 * Escucha `finish` del response para no pisar res.json ni adelantarse al status: si el
 * controlador terminó en 4xx/5xx, no hay nada que revalidar.
 */
function revalidateAfter({ tags = [], paths = [] } = {}) {
  return (req, res, next) => {
    if (!WRITE_METHODS.has(req.method)) return next()
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) revalidateSite({ tags, paths })
    })
    next()
  }
}

module.exports = { revalidateSite, revalidateAfter }
