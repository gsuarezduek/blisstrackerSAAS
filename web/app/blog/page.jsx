import { buildMetadata, breadcrumbSchema } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { metaFor } from '@/lib/pageMeta'
import { fetchPostPage, listUrl } from '@/lib/blog'
import BlogListing from '@/components/blog/BlogListing'

export const revalidate = 300

export async function generateMetadata() {
  const { totalPages } = await fetchPostPage(1)
  return {
    ...buildMetadata({ ...metaFor('/blog'), path: '/blog' }),
    // rel=next hacia la página 2 cuando hay más de una: le dice a Google que el
    // listado es una secuencia y no páginas sueltas con contenido parecido.
    ...(totalPages > 1 ? { alternates: { canonical: listUrl(1), types: {} }, other: { next: listUrl(2) } } : {}),
  }
}

export default async function BlogIndexPage() {
  const { posts, page, totalPages } = await fetchPostPage(1)
  return (
    <>
      <JsonLd schema={breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        { name: 'Blog', path: '/blog' },
      ])} />
      <BlogListing posts={posts} page={page} totalPages={totalPages} />
    </>
  )
}
