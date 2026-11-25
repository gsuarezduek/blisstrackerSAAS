import Link from 'next/link'
import BlissLogo from '@/components/BlissLogo'
import { LOGIN_URL } from '@/lib/urls'

/**
 * 404 del sitio público. Next la sirve con status 404 de verdad — en la SPA cualquier
 * ruta desconocida hacía `<Navigate to="/" replace />`, que responde 200 con la landing:
 * un soft 404 que hace que Google indexe URLs que no existen como si fueran la home.
 *
 * `noindex` para que, si alguien linkeó una URL muerta, la página de error no compita
 * con las reales en el índice.
 */
export const metadata = {
  title: 'Página no encontrada — BlissTracker',
  robots: { index: false, follow: true },
}

const LINKS = [
  { href: '/',          title: 'Inicio',    desc: 'Qué es BlissTracker y para qué sirve.' },
  { href: '/pricing',   title: 'Precios',   desc: 'Planes, calculadora y comparativa.' },
  { href: '/blog',      title: 'Blog',      desc: 'Artículos sobre gestión de agencias.' },
  { href: '/contacto',  title: 'Contacto',  desc: 'Escribinos y te respondemos.' },
]

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased flex flex-col">
      <nav className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center h-16">
          <Link href="/" className="flex items-center" aria-label="BlissTracker — inicio">
            <BlissLogo variant="lockup" className="h-8 w-auto" />
          </Link>
        </div>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 py-20 w-full">
        <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">Error 404</p>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
          Esta página no existe.
        </h1>
        <p className="text-lg text-gray-500 mb-10 max-w-xl">
          Puede que el link esté mal escrito o que la página haya cambiado de dirección.
          Estos son los lugares a los que probablemente querías llegar:
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className="block rounded-2xl border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all p-5"
            >
              <p className="font-bold text-gray-900 mb-1">{l.title}</p>
              <p className="text-sm text-gray-500">{l.desc}</p>
            </Link>
          ))}
        </div>

        <p className="text-sm text-gray-400 mt-10">
          ¿Buscabas tu workspace? Entrá por{' '}
          <a href={LOGIN_URL} className="text-primary-600 hover:text-primary-700 font-medium">
            el login de la app
          </a>.
        </p>
      </main>
    </div>
  )
}
