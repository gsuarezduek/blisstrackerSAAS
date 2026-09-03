const {
  MODULE_KEYS, resolveModuleAccess, hasModuleAccess, moduleAccessGuard, getAllModuleAccess,
} = require('../../src/lib/moduleAccess')

function req({ role, teamRole = null, moduleAccess = {} }) {
  return { workspaceMember: { role, teamRole }, workspace: { moduleAccess } }
}

describe('resolveModuleAccess (defaults del catálogo)', () => {
  test('marketing/contenido: default allMembers true sin config guardada', () => {
    expect(resolveModuleAccess({ moduleAccess: {} }, 'marketing')).toEqual({ allMembers: true, roles: [] })
    expect(resolveModuleAccess({ moduleAccess: {} }, 'contenido')).toEqual({ allMembers: true, roles: [] })
  })
  test('ventas: default allMembers false sin config guardada', () => {
    expect(resolveModuleAccess({ moduleAccess: {} }, 'ventas')).toEqual({ allMembers: false, roles: [] })
  })
  test('config guardada pisa el default', () => {
    const ws = { moduleAccess: { marketing: { allMembers: false, roles: ['DESIGNER'] } } }
    expect(resolveModuleAccess(ws, 'marketing')).toEqual({ allMembers: false, roles: ['DESIGNER'] })
  })
  test('workspace sin moduleAccess (undefined) no rompe', () => {
    expect(resolveModuleAccess({}, 'ventas')).toEqual({ allMembers: false, roles: [] })
    expect(resolveModuleAccess(null, 'ventas')).toEqual({ allMembers: false, roles: [] })
  })
  test('rrhh/eos/gamification no son módulos configurables (quedaron admin-only, fuera de este mecanismo)', () => {
    expect(MODULE_KEYS).not.toContain('rrhh')
    expect(MODULE_KEYS).not.toContain('eos')
    expect(MODULE_KEYS).not.toContain('gamification')
  })
})

describe('hasModuleAccess', () => {
  test('admin/owner siempre pasa, sin importar la config', () => {
    expect(hasModuleAccess(req({ role: 'admin' }), 'ventas')).toBe(true)
    expect(hasModuleAccess(req({ role: 'owner' }), 'marketing')).toBe(true)
  })
  test('member sin teamRole: pasa solo si allMembers', () => {
    const noRole = req({ role: 'member', teamRole: null })
    expect(hasModuleAccess(noRole, 'marketing')).toBe(true)  // default allMembers:true
    expect(hasModuleAccess(noRole, 'ventas')).toBe(false)    // default allMembers:false
  })
  test('member con teamRole incluido en la lista configurada: pasa', () => {
    const r = req({ role: 'member', teamRole: 'SALES', moduleAccess: { ventas: { allMembers: false, roles: ['SALES'] } } })
    expect(hasModuleAccess(r, 'ventas')).toBe(true)
  })
  test('member con teamRole NO incluido: no pasa', () => {
    const r = req({ role: 'member', teamRole: 'DESIGNER', moduleAccess: { ventas: { allMembers: false, roles: ['SALES'] } } })
    expect(hasModuleAccess(r, 'ventas')).toBe(false)
  })
  test('sin workspaceMember: no pasa', () => {
    expect(hasModuleAccess({ workspaceMember: null, workspace: {} }, 'marketing')).toBe(false)
  })
  test('admin puede restringir marketing a un rol específico y quedar igual habilitado', () => {
    const r = req({ role: 'member', teamRole: 'DESIGNER', moduleAccess: { marketing: { allMembers: false, roles: [] } } })
    expect(hasModuleAccess(r, 'marketing')).toBe(false) // ya no es "todos"
  })
})

describe('moduleAccessGuard', () => {
  function mockRes() {
    const res = {}
    res.status = jest.fn(() => res)
    res.json = jest.fn(() => res)
    return res
  }
  test('llama next() cuando hay acceso', () => {
    const next = jest.fn()
    moduleAccessGuard('marketing')(req({ role: 'member' }), mockRes(), next)
    expect(next).toHaveBeenCalled()
  })
  test('devuelve 403 cuando no hay acceso', () => {
    const res = mockRes()
    const next = jest.fn()
    moduleAccessGuard('ventas')(req({ role: 'member', teamRole: null }), res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe('getAllModuleAccess', () => {
  test('devuelve un booleano por cada uno de los módulos configurables', () => {
    const result = getAllModuleAccess(req({ role: 'admin' }))
    expect(Object.keys(result).sort()).toEqual([...MODULE_KEYS].sort())
    expect(Object.values(result).every(v => v === true)).toBe(true)
  })
})
