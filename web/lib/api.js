// Lectura del backend desde los server components del sitio público.
//
// Todo lo que muestra este sitio (copy de la landing, precios, legales, posts) vive en
// la DB y se edita desde SuperAdmin. Se trae acá, en el server, y se cachea con ISR:
// el visitante recibe HTML ya armado y el fetch no se repite en cada visita.
//
// `revalidate` por defecto: 10 minutos. Además SuperAdmin pega a /api/revalidate al
// guardar, así un cambio se ve al instante sin esperar la ventana de ISR.
const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '')

export const DEFAULT_REVALIDATE = 600

/**
 * GET contra el backend. Devuelve `fallback` si falla — el sitio público nunca
 * tiene que caerse porque el backend no contestó (mismo criterio que el
 * usePublicPricing de la SPA, que tiene valores de respaldo hardcodeados).
 */
export async function apiGet(path, { fallback = null, revalidate = DEFAULT_REVALIDATE, tags = [] } = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      next: { revalidate, ...(tags.length ? { tags } : {}) },
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return fallback
    return await res.json()
  } catch {
    return fallback
  }
}

/** Base del backend, para armar URLs de imágenes servidas por la API. */
export function apiAsset(path) {
  return `${API}${path.startsWith('/') ? path : `/${path}`}`
}

export { API }
