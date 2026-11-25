import { apiGet, apiAsset } from './api'
import { siteUrl } from './urls'

// Tamaño de página del listado. El backend acepta ?page= y ?pageSize= (tope 30) y
// devuelve { posts, total, page, pageSize }; 9 es su default y es múltiplo de la grilla
// de 2 columnas sin dejar huecos raros.
export const POSTS_PER_PAGE = 9

/** Una página del listado de posts publicados. */
export async function fetchPostPage(page = 1) {
  const data = await apiGet(`/api/public/blog?page=${page}&pageSize=${POSTS_PER_PAGE}`, {
    fallback: { posts: [], total: 0, page, pageSize: POSTS_PER_PAGE },
    tags: ['blog'],
  })
  const total = data.total ?? 0
  return {
    posts: data.posts ?? [],
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / POSTS_PER_PAGE)),
  }
}

/** Un post por slug, o null si no existe / no está publicado. */
export async function fetchPost(slug) {
  return apiGet(`/api/public/blog/${encodeURIComponent(slug)}`, { tags: ['blog', `blog:${slug}`] })
}

/**
 * Todos los posts publicados, para el sitemap, el llms.txt y generateStaticParams.
 * Recorre las páginas del endpoint en vez de pedir un límite enorme: el tope de
 * pageSize del backend es 30 y no se va a cambiar desde acá.
 */
export async function fetchAllPosts({ max = 500 } = {}) {
  const all = []
  for (let page = 1; all.length < max; page += 1) {
    const { posts, totalPages } = await fetchPostPage(page)
    all.push(...posts)
    if (page >= totalPages || posts.length === 0) break
  }
  return all.slice(0, max)
}

/** URL de la portada de un post, o null si no tiene. */
export function coverUrl(post) {
  return post?.hasCoverImage ? apiAsset(`/api/public/blog-cover/${post.id}`) : null
}

/** La ruta de una página del listado: /blog para la 1, /blog/pagina/N para el resto. */
export function listPath(page) {
  return page <= 1 ? '/blog' : `/blog/pagina/${page}`
}

export function listUrl(page) {
  return siteUrl(listPath(page))
}

export function postPath(slug) {
  return `/blog/${slug}`
}

export function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}
