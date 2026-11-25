import { SITE_URL } from '@/lib/urls'
import { PAGE_META } from '@/lib/pageMeta'
import { fetchAllPosts, fetchPostPage, listPath, postPath, POSTS_PER_PAGE } from '@/lib/blog'

export const revalidate = 3600

// Prioridad y frecuencia por ruta. Son los mismos valores del sitemap.xml que estaba a
// mano en frontend/public/, menos /login y /register: esas dos se fueron a la app y
// ahora llevan noindex, así que no corresponde listarlas.
const STATIC_PAGES = {
  '/':                      { changeFrequency: 'weekly',  priority: 1.0 },
  '/pricing':               { changeFrequency: 'monthly', priority: 0.9 },
  '/soluciones/marketing':  { changeFrequency: 'monthly', priority: 0.8 },
  '/soluciones/eos':        { changeFrequency: 'monthly', priority: 0.8 },
  '/soluciones/ventas':     { changeFrequency: 'monthly', priority: 0.8 },
  '/blog':                  { changeFrequency: 'weekly',  priority: 0.6 },
  '/contacto':              { changeFrequency: 'yearly',  priority: 0.5 },
  '/condiciones':           { changeFrequency: 'yearly',  priority: 0.3 },
  '/privacidad':            { changeFrequency: 'yearly',  priority: 0.3 },
  '/eliminar-datos':        { changeFrequency: 'yearly',  priority: 0.3 },
}

/**
 * sitemap.xml generado: las páginas fijas, las páginas del listado del blog y cada
 * artículo publicado. Antes era un archivo estático con 7 URLs escritas a mano que
 * nadie actualizaba al publicar un post.
 */
export default async function sitemap() {
  const now = new Date()

  const pages = Object.entries(STATIC_PAGES).map(([path, meta]) => ({
    url: `${SITE_URL}${path === '/' ? '/' : path}`,
    lastModified: now,
    ...meta,
  }))

  const posts = await fetchAllPosts()

  // Páginas 2..N del listado. La 1 ya está arriba como /blog.
  const totalPages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE))
  const listPages = Array.from({ length: totalPages - 1 }, (_, i) => ({
    url: `${SITE_URL}${listPath(i + 2)}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.4,
  }))

  const postPages = posts.map(p => ({
    url: `${SITE_URL}${postPath(p.slug)}`,
    lastModified: p.publishedAt ? new Date(p.publishedAt) : now,
    changeFrequency: 'yearly',
    priority: 0.7,
  }))

  return [...pages, ...listPages, ...postPages]
}

// Chequeo de coherencia: toda página del sitemap tiene que tener title/description
// propios en el catálogo, y viceversa. Si alguien agrega una ruta en un solo lado, el
// test de tests/sitemap.test.js lo marca.
export const SITEMAP_STATIC_PATHS = Object.keys(STATIC_PAGES)
export const META_PATHS = Object.keys(PAGE_META)
