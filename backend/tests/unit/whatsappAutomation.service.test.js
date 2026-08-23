const { resolveVariableMapping } = require('../../src/services/whatsappAutomation.service')

describe('resolveVariableMapping', () => {
  it('reemplaza los merge tags reconocidos', () => {
    const out = resolveVariableMapping(
      JSON.stringify(['Hola {{contact_name}}', 'de {{company_name}}']),
      { contactName: 'Juan', companyName: 'Acme', leadTitle: 'Rediseño web', ownerName: 'María' },
    )
    expect(out).toEqual(['Hola Juan', 'de Acme'])
  })

  it('deja texto literal sin tags tal cual', () => {
    const out = resolveVariableMapping(JSON.stringify(['Hola de nuevo']), { contactName: 'Juan' })
    expect(out).toEqual(['Hola de nuevo'])
  })

  it('reemplaza por string vacío cuando falta el dato en el contexto', () => {
    const out = resolveVariableMapping(JSON.stringify(['{{owner_name}}']), { contactName: 'Juan' })
    expect(out).toEqual([''])
  })

  it('soporta varios tags en la misma variable', () => {
    const out = resolveVariableMapping(
      JSON.stringify(['{{contact_name}} de {{company_name}}']),
      { contactName: 'Juan', companyName: 'Acme' },
    )
    expect(out).toEqual(['Juan de Acme'])
  })

  it('devuelve array vacío con mapping null/vacío/inválido', () => {
    expect(resolveVariableMapping(null, {})).toEqual([])
    expect(resolveVariableMapping('', {})).toEqual([])
    expect(resolveVariableMapping('no-json', {})).toEqual([])
  })
})
