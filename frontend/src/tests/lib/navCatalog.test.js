import { describe, it, expect } from 'vitest'
import { buildNavBlocks } from '../../lib/navCatalog'

// El catálogo es la fuente única de qué secciones existen y quién las ve: lo consumen
// la barra lateral (Navbar.jsx) y el buscador Cmd+K (useNavDestinations.js). Antes el
// criterio estaba duplicado en los dos y nada avisaba cuando se desincronizaban.

const ALL_FLAGS = {
  marketing: true, eos: true, gamification: true, ventas: true,
  contenido: true, rrhh: true, calendario: true, finanzas: true, whatsapp: true,
}

const member = (moduleAccess = {}, extra = {}) => ({
  id: 1, isAdmin: false, moduleAccess, ...extra,
})
const admin = (extra = {}) => ({
  id: 2,
  isAdmin: true,
  // El backend ya resuelve moduleAccess con todo en true para un admin.
  moduleAccess: { marketing: true, contenido: true, rrhh: true, calendario: true, finanzas: true, ventas: true },
  ...extra,
})

const keys = items => items.map(i => i.key)
const build = (user, flags = ALL_FLAGS, rest = {}) => buildNavBlocks({ user, flags, ...rest })

describe('buildNavBlocks — acceso a módulos', () => {
  it('un módulo apagado por feature flag no aparece, aunque la persona tenga acceso por rol', () => {
    const user = member({ marketing: true, contenido: true })
    const conFlag = build(user, { ...ALL_FLAGS })
    const sinFlag = build(user, { ...ALL_FLAGS, marketing: false })

    expect(keys(conFlag.modules)).toContain('marketing')
    expect(keys(sinFlag.modules)).not.toContain('marketing')
    expect(sinFlag.allowed.marketing).toBe(false)
    // Apagar un flag no debe arrastrar a los demás.
    expect(keys(sinFlag.modules)).toContain('contenido')
  })

  it('un módulo prendido en el workspace no aparece sin acceso por rol', () => {
    const { modules, allowed } = build(member({ marketing: true }))
    expect(keys(modules)).toContain('marketing')
    expect(keys(modules)).not.toContain('rrhh')
    expect(allowed.rrhh).toBe(false)
  })

  it('el orden de los módulos es fijo: no se reacomodan según cuáles estén prendidos', () => {
    const todos = build(admin())
    expect(keys(todos.modules)).toEqual(['ventas', 'marketing', 'contenido', 'rrhh', 'finanzas'])

    // Con Marketing y RRHH apagados, los que quedan conservan su posición relativa.
    const algunos = build(admin(), { ...ALL_FLAGS, marketing: false, rrhh: false })
    expect(keys(algunos.modules)).toEqual(['ventas', 'contenido', 'finanzas'])
  })
})

describe('buildNavBlocks — Administración', () => {
  it('un no-admin no ve el bloque de Administración ni con todos los flags prendidos', () => {
    const { admin: adminItems } = build(member({ marketing: true, rrhh: true }))
    expect(adminItems).toEqual([])
  })

  it('EOS y Gamification son estrictamente admin: no hay acceso configurable por rol', () => {
    // Aunque se le inventara un moduleAccess, un no-admin no los ve.
    const { allowed } = build(member({ eos: true, gamification: true }))
    expect(allowed.eos).toBe(false)
    expect(allowed.gamification).toBe(false)

    expect(keys(build(admin()).admin)).toEqual(['reports', 'eos', 'gamification', 'panel'])
  })

  it('un flag apagado saca su ítem del bloque, y Horas por proyecto y Panel quedan siempre', () => {
    const { admin: adminItems } = build(admin(), { ...ALL_FLAGS, eos: false, gamification: false })
    expect(keys(adminItems)).toEqual(['reports', 'panel'])
  })
})

describe('buildNavBlocks — Ventas', () => {
  it('un no-admin del equipo comercial entra por /ventas; un admin por /admin/ventas', () => {
    const comercial = build(member({}, { isSales: true }))
    expect(comercial.ventasBase).toBe('/ventas')
    expect(comercial.modules.find(m => m.key === 'ventas').to).toBe('/ventas')

    const jefe = build(admin())
    expect(jefe.ventasBase).toBe('/admin/ventas')
    expect(jefe.modules.find(m => m.key === 'ventas').to).toBe('/admin/ventas')
  })

  it('sin isSales y sin ser admin, Ventas no aparece', () => {
    expect(keys(build(member()).modules)).not.toContain('ventas')
  })
})

describe('buildNavBlocks — bloque principal', () => {
  it('"Reportes" (el propio) lo ve todo el mundo, admin incluido', () => {
    // Antes era `!isAdmin`: el admin veía "Reportes" en Administración (el del equipo)
    // y no tenía forma de llegar al suyo.
    for (const user of [member(), admin()]) {
      const item = build(user).primary.find(i => i.key === 'reportes')
      expect(item?.to).toBe('/reportes')
    }
  })

  it('los dos Reportes ya no se llaman igual', () => {
    const { primary, admin: adminItems } = build(admin())
    const propio = primary.find(i => i.key === 'reportes')
    const equipo = adminItems.find(i => i.key === 'reports')
    expect(propio.label).toBe('Reportes')
    expect(equipo.label).toBe('Horas por proyecto')
    expect(propio.label).not.toBe(equipo.label)
  })

  it('Calendario vive en el bloque principal, no en Módulos', () => {
    const { primary, modules } = build(admin())
    expect(keys(primary)).toContain('calendar')
    expect(keys(modules)).not.toContain('calendar')
  })

  it('Juegos aparece solo cuando hay alguno activo', () => {
    expect(keys(build(admin()).primary)).not.toContain('games')
    expect(keys(build(admin(), ALL_FLAGS, { gamesVisible: true }).primary)).toContain('games')
  })

  it('Chat y Juegos no tienen ruta todavía: el buscador los saltea', () => {
    const { primary } = build(admin(), ALL_FLAGS, { gamesVisible: true })
    expect(primary.find(i => i.key === 'chat').to).toBeUndefined()
    expect(primary.find(i => i.key === 'games').to).toBeUndefined()
    // Y todo lo demás sí navega.
    const navegables = primary.filter(i => i.to)
    expect(navegables.length).toBe(primary.length - 2)
  })

  it('cada ítem navegable tiene key y label, y no hay keys repetidas', () => {
    const { primary, modules, admin: adminItems } = build(admin(), ALL_FLAGS, { gamesVisible: true })
    const todos = [...primary, ...modules, ...adminItems]
    for (const item of todos) {
      expect(item.key).toBeTruthy()
      expect(item.label).toBeTruthy()
    }
    expect(new Set(keys(todos)).size).toBe(todos.length)
  })
})

describe('buildNavBlocks — Productividad', () => {
  it('se considera prendida salvo que el workspace la apague explícitamente', () => {
    expect(buildNavBlocks({ user: admin(), flags: ALL_FLAGS }).allowed.productivity).toBe(true)
    expect(buildNavBlocks({ user: admin(), flags: ALL_FLAGS, workspace: {} }).allowed.productivity).toBe(true)
    expect(
      buildNavBlocks({ user: admin(), flags: ALL_FLAGS, workspace: { productivityEnabled: false } }).allowed.productivity,
    ).toBe(false)
  })
})
