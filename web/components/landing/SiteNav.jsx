'use client'

import { useState } from 'react'
import Link from 'next/link'
import BlissLogo from '@/components/BlissLogo'
import { LOGIN_URL, REGISTER_URL } from '@/lib/urls'

/**
 * Nav de la landing. Client component sólo por el menú hamburguesa de mobile.
 * Los links internos van con next/link; "Iniciar sesión" y "Crear cuenta" apuntan a la
 * app (app.blisstracker.app), que es otro dominio, así que van como <a> absolutos.
 */
const LINKS = [
  { href: '/pricing',  label: 'Pricing' },
  { href: '/blog',     label: 'Blog' },
  { href: '/contacto', label: 'Contacto' },
]

export default function SiteNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center" aria-label="BlissTracker — inicio">
          <BlissLogo variant="lockup" className="h-8 w-auto" />
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors hidden sm:block"
            >
              {l.label}
            </Link>
          ))}
          <a
            href={LOGIN_URL}
            className="text-sm text-gray-600 hover:text-gray-900 font-medium px-2 sm:px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Iniciar sesión
          </a>
          <a
            href={REGISTER_URL}
            className="text-sm bg-primary-500 hover:bg-primary-600 text-white font-semibold px-3 sm:px-4 py-2 rounded-lg transition-colors shadow-sm shadow-primary-200"
          >
            Crear cuenta
          </a>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(v => !v)}
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={mobileMenuOpen}
            className="sm:hidden ml-1 p-2 -mr-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            {mobileMenuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-gray-100 px-4 py-2 bg-white">
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}
