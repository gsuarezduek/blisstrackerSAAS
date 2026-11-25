import Link from 'next/link'
import Image from 'next/image'
import BlissLogo from '@/components/BlissLogo'
import { coverUrl, formatDate, listPath, postPath } from '@/lib/blog'

/**
 * Listado del blog, con paginado. Server component: las tarjetas y el texto van en el
 * HTML inicial (en la SPA el listado se traía con axios en un useEffect, así que
 * Google veía el encabezado y nada más).
 *
 * Las portadas pasan por next/image, que las sirve en WebP y en el tamaño que
 * corresponde al viewport: vienen de la DB como PNG/JPEG subido a mano desde
 * SuperAdmin, sin ninguna optimización.
 */
export default function BlogListing({ posts, page, totalPages }) {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center" aria-label="BlissTracker — inicio">
            <BlissLogo variant="lockup" className="h-8 w-auto" />
          </Link>
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            Volver al inicio
          </Link>
        </div>
      </nav>

      <header className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-10 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-4">Blog</h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto">
          Ideas y aprendizajes sobre gestión de agencias, marketing y productividad de equipos.
        </p>
        {page > 1 && <p className="text-sm text-gray-400 mt-4">Página {page} de {totalPages}</p>}
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-24">
        {posts.length === 0 ? (
          <p className="text-center text-gray-400 py-20">Todavía no hay artículos publicados.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-8">
            {posts.map((post, i) => {
              const cover = coverUrl(post)
              return (
                <Link
                  key={post.id}
                  href={postPath(post.slug)}
                  className="group block rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all overflow-hidden"
                >
                  {cover ? (
                    <Image
                      src={cover}
                      alt=""
                      width={640}
                      height={384}
                      sizes="(max-width: 640px) 100vw, 50vw"
                      // Las dos primeras tarjetas son lo que se ve sin scrollear: ésas
                      // se cargan con prioridad y el resto en diferido.
                      priority={i < 2}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-primary-50 to-orange-100" />
                  )}
                  <div className="p-5">
                    <p className="text-xs text-gray-400 mb-2">
                      {formatDate(post.publishedAt)} · {post.authorName}
                    </p>
                    <h2 className="text-lg font-bold text-gray-900 group-hover:text-primary-600 transition-colors mb-1.5">
                      {post.title}
                    </h2>
                    <p className="text-sm text-gray-500 line-clamp-2">{post.excerpt}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <nav className="flex items-center justify-center gap-2 mt-14" aria-label="Paginado del blog">
            {page > 1 && (
              <Link
                href={listPath(page - 1)}
                rel="prev"
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                ← Anteriores
              </Link>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <Link
                key={n}
                href={listPath(n)}
                aria-current={n === page ? 'page' : undefined}
                className={n === page
                  ? 'px-3.5 py-2 text-sm font-semibold bg-primary-500 text-white rounded-lg'
                  : 'px-3.5 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors'}
              >
                {n}
              </Link>
            ))}
            {page < totalPages && (
              <Link
                href={listPath(page + 1)}
                rel="next"
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                Siguientes →
              </Link>
            )}
          </nav>
        )}
      </main>
    </div>
  )
}
