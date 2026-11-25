import Link from 'next/link'
import BlissLogo from '@/components/BlissLogo'
import { LOGIN_URL, REGISTER_URL } from '@/lib/urls'

/**
 * Shell de las sub-landings de módulo (/soluciones/marketing, /eos, /ventas): el nav y
 * el footer minimalistas que comparten las páginas públicas secundarias.
 *
 * Perdió el <Helmet> que tenía en la SPA: el title, la description y el canonical ahora
 * los declara cada página con `export const metadata`, así viajan en el HTML inicial en
 * vez de aparecer recién cuando corre React.
 *
 * "Iniciar sesión" y "Crear cuenta" apuntan a la app (otro dominio), así que van como
 * <a> absolutos y no como <Link>: no hay navegación de cliente posible entre dominios.
 */
export default function ModuleLandingLayout({ children }) {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center">
            <BlissLogo variant="lockup" className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 hidden sm:inline">
              Ver el sistema completo
            </Link>
            <a href={LOGIN_URL} className="text-sm text-gray-600 hover:text-gray-900 hidden sm:inline">
              Iniciar sesión
            </a>
            <a href={REGISTER_URL} className="text-sm bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              Crear cuenta
            </a>
          </div>
        </div>
      </nav>

      {children}

      <footer className="bg-gray-950 text-gray-500 border-t border-gray-800 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <BlissLogo variant="lockup" dark className="h-5 w-auto" />
            <span>© {new Date().getFullYear()} BlissTracker</span>
          </div>
          <div className="flex gap-5">
            <Link href="/condiciones" className="hover:text-gray-300">Condiciones</Link>
            <Link href="/privacidad"  className="hover:text-gray-300">Privacidad</Link>
            <Link href="/"            className="hover:text-gray-300">Inicio</Link>
            <a href={LOGIN_URL}       className="hover:text-gray-300">Login</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
