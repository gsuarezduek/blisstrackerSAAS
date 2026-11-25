import { notFound } from 'next/navigation'
import { buildMetadata, breadcrumbSchema } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { metaFor } from '@/lib/pageMeta'
import { fetchPostPage, listPath } from '@/lib/blog'
import BlogListing from '@/components/blog/BlogListing'

export const revalidate = 300

/**
 * Páginas 2+ del listado (/blog/pagina/2). La 1 vive en /blog y acá se rechaza, para no
 * tener dos URLs con el mismo contenido: `/blog/pagina/1` devuelve 404.
 *
 * Cada página lleva su propio canonical —el de ella misma, no el de /blog—: son
 * contenidos distintos, y apuntar todas a /blog haría que Google ignore las demás.
 */
function parsePage(raw) {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 2 ? n : null
}

export async function generateMetadata({ params }) {
  const { n } = await params
  const page = parsePage(n)
  if (!page) return {}
  const base = metaFor('/blog')
  return buildMetadata({
    title: `Blog — página ${page} — BlissTracker`,
    description: base.description,
    path: listPath(page),
  })
}

export default async function BlogPaginaPage({ params }) {
  const { n } = await params
  const page = parsePage(n)
  if (!page) notFound()

  const data = await fetchPostPage(page)
  // Una página más allá del final no existe: 404 en vez de un listado vacío que
  // Google indexaría como contenido pobre.
  if (page > data.totalPages) notFound()

  return (
    <>
      <JsonLd schema={breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        { name: 'Blog', path: '/blog' },
        { name: `Página ${page}`, path: listPath(page) },
      ])} />
      <BlogListing posts={data.posts} page={page} totalPages={data.totalPages} />
    </>
  )
}
