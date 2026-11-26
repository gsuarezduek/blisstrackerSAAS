import Link from 'next/link'
import BlissLogo from '@/components/BlissLogo'

/**
 * 404 propio de los artículos: un link a un post que no existe (o que se despublicó)
 * merece volver al blog, no la página de "no existe" genérica del sitio.
 *
 * Al ser un boundary de not-found en el mismo segmento, además es el que resuelve el
 * `notFound()` de page.jsx sin tener que subir hasta la raíz.
 */
export const metadata = {
  title: 'Artículo no encontrado — BlissTracker',
  robots: { index: false, follow: true },
}

export default function BlogPostNotFound() {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased flex flex-col">
      <nav className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center" aria-label="BlissTracker — inicio">
            <BlissLogo variant="lockup" className="h-8 w-auto" />
          </Link>
          <Link href="/blog" className="text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            ← Blog
          </Link>
        </div>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 py-20 w-full">
        <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">Error 404</p>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
          Este artículo no existe.
        </h1>
        <p className="text-lg text-gray-500 mb-10 max-w-xl">
          Puede que el link esté mal escrito, o que el artículo ya no esté publicado.
        </p>
        <Link
          href="/blog"
          className="inline-block bg-primary-500 hover:bg-primary-600 text-white text-base font-semibold px-8 py-4 rounded-xl transition-colors"
        >
          Ver todos los artículos →
        </Link>
      </main>
    </div>
  )
}
