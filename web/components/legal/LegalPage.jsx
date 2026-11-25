import Link from 'next/link'

/**
 * Shell oscuro de las páginas legales (/condiciones, /privacidad, /eliminar-datos).
 * Mismo diseño que el LegalPage/DataDeletion de la SPA, con el contenido ya resuelto en
 * el server: en la SPA /condiciones y /privacidad traían el documento por fetch, así
 * que el texto legal nunca estaba en el HTML (y esas dos rutas, además, no declaraban
 * ni title ni canonical propios: heredaban los de la home).
 */
export default function LegalPage({ title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Volver al inicio
          </Link>
          <span className="text-sm font-semibold text-gray-300">BlissTracker</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mb-10">{subtitle}</p>}
        {children}
      </main>
    </div>
  )
}
