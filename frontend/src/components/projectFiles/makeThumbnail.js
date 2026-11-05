// ─── Miniaturas de la Nube, generadas en el browser ──────────────────────────
// Un archivo de la Nube se muestra en la grilla con una miniatura chica. Antes
// la grilla usaba el ORIGINAL para las imágenes (una foto de 8MB bajada entera
// para pintar 56px) y nada para los videos ni los PDF (ícono genérico: había
// que abrir el archivo para saber de qué era). Esto lo resuelve con un derivado
// liviano que se sube junto al archivo y queda en `ProjectFile.posterKey`.
//
// Todo acá es best-effort: si el navegador no puede decodificar el archivo, se
// devuelve null y el archivo se sube igual, sin miniatura. Nunca rechaza.
//
// Mismo criterio de implementación paralela que `useProjectFileUpload` vs
// `ContentAssetUploader` (ver CLAUDE.md): Contenido genera su poster con su
// propia lógica porque ahí el poster es un ContentAsset más, con su presign y
// su fila; acá es un derivado interno que va por un endpoint propio.
//
// Las tres ramas (imagen, video, PDF) devuelven la MISMA forma —
// `{ width, height, blob }`— porque el que las llama no distingue tipos: sube
// el blob que le den y manda width/height al confirm. El endpoint tampoco
// distingue: recibe un JPEG/PNG/WEBP y lo valida por magic bytes.

// Lado máximo de la miniatura. La grilla la pinta a 56px (112px en retina), así
// que 400 deja margen de sobra para que siga sirviendo si la grilla crece.
const MAX_SIDE = 400
const QUALITY = 0.8
// Si el navegador nunca dispara los eventos del <video>/<img>, no dejamos la
// subida esperando: se sigue sin miniatura.
const TIMEOUT_MS = 8000
// Al PDF se le da más margen: parsear e interpretar una página de vectores es
// bastante más caro que decodificar un JPEG, y un PDF de cientos de páginas
// tarda en abrir aunque después sólo se dibuje la primera.
const PDF_TIMEOUT_MS = 20000
const EMPTY_THUMB = { width: null, height: null, blob: null }

function encode(canvas, mimeType) {
  return new Promise(resolve => {
    try {
      // Un navegador que no soporte el mimeType pedido cae a PNG solo; los tres
      // formatos posibles están aceptados por el endpoint.
      canvas.toBlob(blob => resolve(blob), mimeType, QUALITY)
    } catch { resolve(null) }
  })
}

// Escala para que el lado más largo quede en MAX_SIDE, sin agrandar nunca una
// imagen que ya es más chica que eso (exportada para poder testearla: el resto
// del módulo depende de canvas/<video>, que jsdom no implementa).
export function thumbSize(width, height) {
  const factor = Math.min(1, MAX_SIDE / Math.max(width, height))
  return { w: Math.max(1, Math.round(width * factor)), h: Math.max(1, Math.round(height * factor)) }
}

// Imagen: devuelve las dimensiones NATURALES del original (que es lo que
// guarda `ProjectFile.width/height`) y la miniatura reducida. WEBP y no JPEG
// para no aplastar la transparencia de un PNG contra un fondo negro.
function imageThumbnail(file) {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(result)
    }

    img.onload = async () => {
      const width = img.naturalWidth || null
      const height = img.naturalHeight || null
      if (!width || !height) return finish({ width, height, blob: null })
      try {
        const { w, h } = thumbSize(width, height)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        finish({ width, height, blob: await encode(canvas, 'image/webp') })
      } catch { finish({ width, height, blob: null }) }
    }
    img.onerror = () => finish({ width: null, height: null, blob: null })
    img.src = url
    setTimeout(() => finish({ width: null, height: null, blob: null }), TIMEOUT_MS)
  })
}

// Video: captura un frame a los ~0.1s (no el 0 exacto, que en muchos códecs es
// un cuadro negro) y lo usa de póster. Mismo enfoque que ContentAssetUploader.
function videoThumbnail(file) {
  return new Promise(resolve => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(result)
    }

    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    video.onloadedmetadata = () => {
      const width = video.videoWidth || null
      const height = video.videoHeight || null
      if (!width || !height) return finish({ width, height, blob: null })

      video.onseeked = async () => {
        try {
          const { w, h } = thumbSize(width, height)
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          canvas.getContext('2d').drawImage(video, 0, 0, w, h)
          // Un frame de video nunca tiene alfa — JPEG alcanza y es universal.
          finish({ width, height, blob: await encode(canvas, 'image/jpeg') })
        } catch { finish({ width, height, blob: null }) }
      }
      try { video.currentTime = Math.min(0.1, video.duration || 0.1) }
      catch { finish({ width, height, blob: null }) }
    }
    video.onerror = () => finish({ width: null, height: null, blob: null })
    video.src = url
    setTimeout(() => finish({ width: null, height: null, blob: null }), TIMEOUT_MS)
  })
}

// PDF: rasteriza la PRIMERA PÁGINA y la usa de portada, que es lo que vuelve
// reconocible a un PDF de un vistazo (el ícono genérico obligaba a abrirlo).
//
// pdf.js se carga con `import()` dinámico porque entre librería y worker son
// ~1,7MB sin comprimir: cargarlo de entrada le cobraría ese peso a todo el
// tracker para una función que sólo corre cuando alguien sube un PDF. Mismo
// criterio que el `import()` de `expo-server-sdk` en el backend.
//
// Es la única rama que necesita una dependencia: un <img> y un <video> los
// decodifica el navegador solo, un PDF no. El servidor no es alternativa — su
// Chromium es para HTML→PDF, y el camino inverso pediría poppler/pdfium o
// node-canvas en el mismo proceso que ya compite con los crons.
let pdfjsPromise = null
function loadPdfjs() {
  // Una sola vez por sesión, aunque se suelten 20 PDF juntos.
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist')
      // El worker se sirve desde nuestro propio origen (Vite lo emite como
      // asset con `?url`) y no desde un CDN: un script de terceros que parsea
      // archivos del cliente no es algo que queramos cargar de afuera.
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })().catch(err => { pdfjsPromise = null; throw err })
  }
  return pdfjsPromise
}

// `handle` sale con el loading task adentro para que el timeout de afuera pueda
// abortarlo. El task es lo que `getDocument` devuelve, y es quien tiene
// `destroy()` — el documento en sí (lo que resuelve `task.promise`) solo tiene
// `cleanup()`, así que destruir el task es la única forma de liberar el worker.
async function renderFirstPdfPage(file, handle) {
  try {
    const pdfjs = await loadPdfjs()
    handle.task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      // Un PDF subido por un cliente es contenido no confiable: `isEvalSupported`
      // apaga el eval() que pdf.js usa para acelerar fuentes, y sin `enableXfa`
      // los formularios XFA (con su propio motor de scripting) no se tocan. Para
      // una miniatura no se pierde nada visible.
      isEvalSupported: false,
      enableXfa: false,
    })
    const pdf = await handle.task.promise

    const page = await pdf.getPage(1)
    // El viewport a escala 1 viene en puntos PDF: son las dimensiones de la
    // página, y es lo que tiene sentido guardar como width/height del original
    // (el equivalente a los píxeles naturales de una imagen).
    const base = page.getViewport({ scale: 1 })
    const width = Math.round(base.width) || null
    const height = Math.round(base.height) || null
    if (!width || !height) return EMPTY_THUMB

    const { w, h } = thumbSize(width, height)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    // Blanco primero: una página de PDF no trae fondo propio, así que sin esto
    // el texto negro quedaría sobre el negro con el que JPEG rellena el alfa.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: w / width }) }).promise

    // JPEG y no WEBP: ya hay fondo opaco, no hay alfa que preservar.
    return { width, height, blob: await encode(canvas, 'image/jpeg') }
  } finally {
    // Siempre, incluso si arriba lanzó: libera el worker en vez de dejarlo con
    // el documento abierto. Es idempotente, así que no choca con el destroy
    // que puede haber hecho ya el timeout.
    await handle.task?.destroy().catch(() => {})
  }
}

function pdfThumbnail(file) {
  const handle = {}
  let timer = null
  // Un PDF cifrado, dañado o con la página 1 vacía no es un error de subida, y
  // tampoco lo es uno que tarda demasiado: el archivo sube igual y la grilla
  // cae al ícono por tipo. Mismo contrato que las otras dos ramas — nunca
  // rechaza, nunca deja la cola esperando.
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => {
      // Destruir el task ABORTA el parseo, no solo deja de esperarlo: sin esto
      // el worker seguiría masticando un PDF cuyo resultado ya nadie va a usar,
      // compitiendo con la subida de los archivos que vienen atrás en la cola.
      handle.task?.destroy().catch(() => {})
      resolve(EMPTY_THUMB)
    }, PDF_TIMEOUT_MS)
  })
  return Promise.race([
    renderFirstPdfPage(file, handle).catch(() => EMPTY_THUMB),
    timeout,
  ]).finally(() => clearTimeout(timer))
}

/**
 * Devuelve `{ width, height, blob }` para imágenes, videos y PDF —
 * `width`/`height` son los del ORIGINAL (van al confirm), `blob` es la
 * miniatura (va al endpoint de thumbnail) y puede ser null si el navegador no
 * pudo generarla.
 * Para cualquier otro tipo de archivo devuelve null: no hay nada que derivar,
 * la grilla usa el ícono por tipo.
 *
 * Espejo de `canHaveThumbnail` en projectFiles.controller.js — el endpoint
 * rechaza con 400 un tipo que no esté acá.
 */
export function makeThumbnail(file) {
  if (file.type?.startsWith('image/')) return imageThumbnail(file)
  if (file.type?.startsWith('video/')) return videoThumbnail(file)
  if (file.type === 'application/pdf') return pdfThumbnail(file)
  return Promise.resolve(null)
}
