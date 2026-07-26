/**
 * Shell compartido para las sub-landings de módulo (/soluciones/marketing, /eos, /ventas).
 * Mismo nav/footer minimalista que ya usa Pricing.jsx para páginas públicas secundarias
 * (distinto del nav completo de Landing.jsx, que lleva más links). Cada página de módulo
 * solo aporta el contenido entre nav y footer.
 */
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import BlissLogo from '../BlissLogo'

export default function ModuleLandingLayout({ metaTitle, metaDescription, canonicalPath, children }) {
  const url = `https://blisstracker.app${canonicalPath}`

  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={url} />
        <meta property="og:url" content={url} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
      </Helmet>

      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center">
            <BlissLogo variant="lockup" dark={false} className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 hidden sm:inline">
              Ver el sistema completo
            </Link>
            <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900 hidden sm:inline">
              Iniciar sesión
            </Link>
            <Link to="/register" className="text-sm bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              Crear cuenta
            </Link>
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
            <Link to="/condiciones" className="hover:text-gray-300">Condiciones</Link>
            <Link to="/privacidad"  className="hover:text-gray-300">Privacidad</Link>
            <Link to="/"            className="hover:text-gray-300">Inicio</Link>
            <Link to="/login"       className="hover:text-gray-300">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
