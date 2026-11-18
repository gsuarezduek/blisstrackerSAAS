// Importación desde Ventas: qué contactos del CRM entran según el filtro.
const { crmContactWhere, cleanFilter, splitName } = require('../../src/controllers/mailing/crm.controller')

describe('cleanFilter', () => {
  it('descarta estados y orígenes que no existen en el catálogo', () => {
    expect(cleanFilter({ statuses: ['ganado', 'inventado', 'ganado'], origins: ['referido', 'x'], onlyPrimary: 'yes' }))
      .toEqual({ statuses: ['ganado'], origins: ['referido'], onlyPrimary: false, includeArchived: false })
  })
})

describe('crmContactWhere', () => {
  it('sin filtro: todos los contactos con email del workspace', () => {
    expect(crmContactWhere(1, cleanFilter({}))).toEqual({ workspaceId: 1, email: { not: null } })
  })
  it('por defecto: cualquier contacto de una empresa con un lead que cumpla (sin archivados)', () => {
    expect(crmContactWhere(1, cleanFilter({ statuses: ['ganado'] })).company).toEqual({ leads: { some: { archived: false, status: { in: ['ganado'] } } } })
  })
  it('solo el contacto principal del lead', () => {
    const w = crmContactWhere(1, cleanFilter({ origins: ['evento'], onlyPrimary: true, includeArchived: true }))
    expect(w.primaryForLeads).toEqual({ some: { origin: { in: ['evento'] } } })
    expect(w.company).toBeUndefined()
  })
})

describe('splitName', () => {
  it('primer nombre y el resto como apellido', () => {
    expect(splitName('Ana María García')).toEqual({ firstName: 'Ana', lastName: 'María García' })
    expect(splitName('  ')).toEqual({ firstName: null, lastName: null })
  })
})
