import { NextResponse } from 'next/server'
import { isAppRoute } from '@/lib/appRoutes'

// Las dos salen de la env tal cual, CON su protocolo: reconstruirlas a mano forzando
// https rompe la prueba en local, donde el sitio corre en http.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://blisstracker.app').replace(/\/$/, '')
const APP_URL  = (process.env.NEXT_PUBLIC_APP_URL  || 'https://app.blisstracker.app').replace(/\/$/, '')

/**
 * Las dos redirecciones del sitio público, las dos con 301.
 *
 *  1. Las rutas de la app → `app.blisstracker.app` (la lista está en lib/appRoutes.js).
 *     Todo lo que no está en esa lista sigue su curso y, si no hay página, termina en
 *     el 404 real de app/not-found.jsx. Es una lista explícita justamente para no
 *     convertir cualquier URL inexistente en un redirect.
 *
 *  2. `www.blisstracker.app` → el apex, que es el dominio canónico. Hoy esto va al
 *     revés y con 307 (temporal), que para Google no consolida nada: las dos variantes
 *     compiten como si fueran sitios distintos.
 *
 * El orden importa: una ruta de la app pedida en www sale derecho a la app, en un solo
 * salto. Si primero se normalizara el host, `www/login` haría dos redirects encadenados
 * y cada salto se paga en latencia (los ~750 ms perdidos hoy en la cadena del apex).
 *
 * Se usa NextResponse.redirect(url, 301) y no `redirects()` de next.config ni la config
 * de dominios de Vercel porque esas dos emiten 308. Para Google 308 es igual de
 * permanente que 301, pero el pedido pide 301 y acá no cuesta nada darlo.
 */
export function proxy(request) {
  const url = request.nextUrl
  const host = request.headers.get('host') || ''

  if (isAppRoute(url.pathname)) {
    return NextResponse.redirect(new URL(url.pathname + url.search, APP_URL), 301)
  }

  if (host.startsWith('www.')) {
    return NextResponse.redirect(new URL(url.pathname + url.search, SITE_URL), 301)
  }

  return NextResponse.next()
}

export const config = {
  // Se excluyen los assets del build y las imágenes del public: no hay nada que
  // redirigir ahí y hacerlos pasar por acá sólo agrega latencia.
  //
  // robots.txt, sitemap.xml y llms.txt NO se excluyen, aunque sean archivos: si
  // alguien los pide por www tienen que redirigir al apex igual que cualquier página
  // — un sitemap servido desde el host no canónico es una invitación a indexar el
  // sitio dos veces.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf)$).*)',
  ],
}
