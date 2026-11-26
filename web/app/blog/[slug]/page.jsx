import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { sanitizePostHtml } from '@/lib/sanitize'
import BlissLogo from '@/components/BlissLogo'
import { buildMetadata, breadcrumbSchema, blogPostingSchema, OG_IMAGE } from '@/lib/seo'
import JsonLd from '@/components/JsonLd'
import { clampDescription } from '@/lib/pageMeta'
import { siteUrl } from '@/lib/urls'
import { fetchPost, fetchAllPosts, coverUrl, formatDate, postPath } from '@/lib/blog'

export const revalidate = 300

/**
 * Pre-genera los posts publicados al buildear, así el primer visitante de cada artículo
 * recibe HTML ya armado. Los que se publiquen después se generan en la primera visita
 * (ISR) y, si SuperAdmin pega al webhook de revalidación, al instante.
 */
export async function generateStaticParams() {
  const posts = await fetchAllPosts()
  return posts.map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const post = await fetchPost(slug)
  if (!post) return { title: 'Artículo no encontrado — BlissTracker' }

  const image = coverUrl(post) || OG_IMAGE
  return buildMetadata({
    title: `${post.metaTitle || post.title} — BlissTracker`,
    // El excerpt lo escribe quien publica y puede pasarse de largo: se recorta en
    // palabra entera para que la description no quede cortada al medio en Google.
    description: clampDescription(post.metaDescription || post.excerpt),
    path: postPath(post.slug),
    image,
    type: 'article',
  })
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params
  const post = await fetchPost(slug)
  // Un slug que no existe (o un borrador) devuelve 404 de verdad. En la SPA se
  // mostraba "Artículo no encontrado" con status 200: un soft 404.
  if (!post) notFound()

  const cover = coverUrl(post)
  const url = siteUrl(postPath(post.slug))

  const jsonLd = [
    blogPostingSchema(post, { url, image: cover || OG_IMAGE }),
    breadcrumbSchema([
      { name: 'Inicio', path: '/' },
      { name: 'Blog', path: '/blog' },
      { name: post.title, path: postPath(post.slug) },
    ]),
  ]

  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      <JsonLd schema={jsonLd} />

      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center" aria-label="BlissTracker — inicio">
            <BlissLogo variant="lockup" className="h-8 w-auto" />
          </Link>
          <Link href="/blog" className="text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            ← Blog
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        {cover && (
          <Image
            src={cover}
            alt=""
            width={1200}
            height={630}
            sizes="(max-width: 768px) 100vw, 768px"
            priority
            className="w-full max-h-96 object-cover rounded-2xl mb-8"
          />
        )}
        <p className="text-sm text-gray-400 mb-3">{formatDate(post.publishedAt)} · {post.authorName}</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-8">{post.title}</h1>
        {/* El contenido es HTML de Tiptap escrito en SuperAdmin. Se sanitiza en el
            server (lib/sanitize.js) así el texto del artículo está en el HTML inicial,
            que es justamente lo que tiene que indexar Google. */}
        <div
          className="post-content text-gray-700 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: sanitizePostHtml(post.contentHtml) }}
        />
      </article>
    </div>
  )
}
