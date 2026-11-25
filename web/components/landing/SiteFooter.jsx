import Link from 'next/link'
import BlissLogo from '@/components/BlissLogo'
import { LOGIN_URL, REGISTER_URL } from '@/lib/urls'

/**
 * Footer completo de la landing (el de las páginas secundarias es el de
 * ModuleLandingLayout, más chico). Markup puro: server component.
 */
export default function SiteFooter() {
  return (
    <footer className="bg-gray-950 border-t border-gray-800 text-gray-400">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          <div className="col-span-2 sm:col-span-1">
            <BlissLogo variant="lockup" dark className="h-8 w-auto mb-3" />
            <p className="text-xs text-gray-500 leading-relaxed">
              El sistema operativo de las agencias de marketing modernas.
              Hecho en Argentina 🇦🇷
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-300 mb-3">Producto</p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
              <li><Link href="/blog"    className="hover:text-white transition-colors">Blog</Link></li>
              <li><a href="#demo"        className="hover:text-white transition-colors">Ver demo</a></li>
              <li><a href="#testimonios" className="hover:text-white transition-colors">Testimonios</a></li>
              <li><a href="#faq"         className="hover:text-white transition-colors">FAQ</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-300 mb-3">Soluciones</p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/soluciones/marketing" className="hover:text-white transition-colors">Marketing</Link></li>
              <li><Link href="/soluciones/eos"       className="hover:text-white transition-colors">EOS / Traction</Link></li>
              <li><Link href="/soluciones/ventas"    className="hover:text-white transition-colors">Ventas (CRM)</Link></li>
              <li><Link href="/contacto"             className="hover:text-white transition-colors">Contacto</Link></li>
              <li><a href="https://blissmkt.ar" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">BlissMKT ↗</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-300 mb-3">Legal</p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/condiciones"    className="hover:text-white transition-colors">Condiciones de uso</Link></li>
              <li><Link href="/privacidad"     className="hover:text-white transition-colors">Política de privacidad</Link></li>
              <li><Link href="/eliminar-datos" className="hover:text-white transition-colors">Eliminar mis datos</Link></li>
              <li><a href={LOGIN_URL}          className="hover:text-white transition-colors">Iniciar sesión</a></li>
              <li><a href={REGISTER_URL}       className="hover:text-white transition-colors">Crear cuenta</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-10 pt-6 flex items-center justify-center text-xs text-gray-500">
          <span>&copy; {new Date().getFullYear()} BlissTracker — Todos los derechos reservados</span>
        </div>
      </div>
    </footer>
  )
}
