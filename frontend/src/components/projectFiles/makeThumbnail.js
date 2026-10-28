// ─── Miniaturas de la Nube, generadas en el browser ──────────────────────────
// Un archivo de la Nube se muestra en la grilla con una miniatura chica. Antes
// la grilla usaba el ORIGINAL para las imágenes (una foto de 8MB bajada entera
// para pintar 56px) y nada para los videos (ícono genérico: había que abrir el
// video para saber de qué era). Esto resuelve las dos cosas con un derivado
// liviano que se sube junto al archivo y queda en `ProjectFile.posterKey`.
//
// Todo acá es best-effort: si el navegador no puede decodificar el archivo, se
// devuelve null y el archivo se sube igual, sin miniatura. Nunca rechaza.
//
// Mismo criterio de implementación paralela que `useProjectFileUpload` vs
// `ContentAssetUploader` (ver CLAUDE.md): Contenido genera su poster con su
// propia lógica porque ahí el poster es un ContentAsset más, con su presign y
// su fila; acá es un derivado interno que va por un endpoint propio.

// Lado máximo de la miniatura. La grilla la pinta a 56px (112px en retina), así
// que 400 deja margen de sobra para que siga sirviendo si la grilla crece.
const MAX_SIDE = 400
const QUALITY = 0.8
// Si el navegador nunca dispara los eventos del <video>/<img>, no dejamos la
// subida esperando: se sigue sin miniatura.
const TIMEOUT_MS = 8000

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

/**
 * Devuelve `{ width, height, blob }` para imágenes y videos — `width`/`height`
 * son los del ORIGINAL (van al confirm), `blob` es la miniatura (va al endpoint
 * de thumbnail) y puede ser null si el navegador no pudo generarla.
 * Para cualquier otro tipo de archivo devuelve null: no hay nada que derivar,
 * la grilla usa el ícono por tipo.
 */
export function makeThumbnail(file) {
  if (file.type?.startsWith('image/')) return imageThumbnail(file)
  if (file.type?.startsWith('video/')) return videoThumbnail(file)
  return Promise.resolve(null)
}
