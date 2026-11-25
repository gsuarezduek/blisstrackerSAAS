import { describe, it, expect } from 'vitest'
import { isAppRoute, APP_ROUTE_PREFIXES } from '../lib/appRoutes.js'
import { PAGE_META } from '../lib/pageMeta.js'

describe('isAppRoute', () => {
  it('reconoce las rutas de autenticación y alta', () => {
    for (const p of ['/login', '/register', '/join', '/forgot-password', '/reset-password']) {
      expect(isAppRoute(p), p).toBe(true)
    }
  })

  it('reconoce las rutas públicas con token que el backend arma sobre el apex', () => {
    // Un link de baja de mailing viaja en cada campaña enviada: si deja de redirigir,
    // se rompe el "darse de baja" de correos que ya están en las casillas.
    expect(isAppRoute('/baja/abc123')).toBe(true)
    expect(isAppRoute('/suscripcion')).toBe(true)
    expect(isAppRoute('/confirmar-suscripcion/tok')).toBe(true)
  })

  it('reconoce las rutas privadas y sus sub-rutas', () => {
    expect(isAppRoute('/admin')).toBe(true)
    expect(isAppRoute('/admin/rrhh')).toBe(true)
    expect(isAppRoute('/superadmin')).toBe(true)
    expect(isAppRoute('/proyectos/42')).toBe(true)
  })

  it('NO toma como ruta de app una página pública', () => {
    for (const p of Object.keys(PAGE_META)) {
      expect(isAppRoute(p), `${p} no debería redirigir a la app`).toBe(false)
    }
    expect(isAppRoute('/blog/mi-articulo')).toBe(false)
    expect(isAppRoute('/blog/pagina/2')).toBe(false)
  })

  it('NO matchea por prefijo de palabra incompleta', () => {
    // `/administracion` empieza con `/admin` pero es otra ruta: si matcheara, una
    // página pública futura se iría redirigida sin que nadie se dé cuenta.
    expect(isAppRoute('/administracion')).toBe(false)
    expect(isAppRoute('/reportes-publicos')).toBe(false)
    expect(isAppRoute('/docs-publicos')).toBe(false)
  })

  it('una ruta inventada no es ruta de app (tiene que terminar en 404)', () => {
    expect(isAppRoute('/esto-no-existe')).toBe(false)
    expect(isAppRoute('/ruta/que/no/existe')).toBe(false)
  })

  it('ninguna página pública está listada como ruta de app', () => {
    const choques = APP_ROUTE_PREFIXES.filter(p => Object.keys(PAGE_META).includes(p))
    expect(choques).toEqual([])
  })
})
