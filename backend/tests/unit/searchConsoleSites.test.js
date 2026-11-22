const { rankSites, siteHost } = require('../../src/services/googleSearchConsole.service')

// Contexto: Search Console trata `sc-domain:ejemplo.com` y `https://ejemplo.com/` como
// DOS propiedades distintas, y pedir la que no existe devuelve 403 "User does not have
// sufficient permission for site". El orden de esta lista es lo que hace que la
// propiedad correcta quede primera en la UI en vez de obligar a adivinar la variante.

describe('googleSearchConsole.service — siteHost', () => {
  test('saca el host de una propiedad de Dominio', () => {
    expect(siteHost('sc-domain:ejemplo.com')).toBe('ejemplo.com')
  })
  test('saca el host de un prefijo de URL', () => {
    expect(siteHost('https://ejemplo.com/')).toBe('ejemplo.com')
  })
  test('ignora el www — para el humano es el mismo sitio', () => {
    expect(siteHost('https://www.ejemplo.com/')).toBe('ejemplo.com')
    expect(siteHost('sc-domain:www.ejemplo.com')).toBe('ejemplo.com')
  })
  test('tolera basura y vacío', () => {
    expect(siteHost('no-es-una-url')).toBeNull()
    expect(siteHost(null)).toBeNull()
  })
})

describe('googleSearchConsole.service — rankSites', () => {
  test('marca la propiedad de Dominio y la que coincide con el sitio del proyecto', () => {
    const [first] = rankSites(
      [{ siteUrl: 'sc-domain:ejemplo.com', permissionLevel: 'siteOwner' }],
      'https://ejemplo.com',
    )
    expect(first).toMatchObject({
      siteUrl: 'sc-domain:ejemplo.com',
      isDomainProperty: true,
      matchesProject: true,
      verified: true,
    })
  })

  test('pone primera la del proyecto, y entre esas la de Dominio', () => {
    const sites = rankSites([
      { siteUrl: 'https://otrocliente.com/',  permissionLevel: 'siteOwner' },
      { siteUrl: 'https://ejemplo.com/',      permissionLevel: 'siteOwner' },
      { siteUrl: 'sc-domain:ejemplo.com',     permissionLevel: 'siteOwner' },
    ], 'https://ejemplo.com')

    expect(sites.map(s => s.siteUrl)).toEqual([
      'sc-domain:ejemplo.com',
      'https://ejemplo.com/',
      'https://otrocliente.com/',
    ])
  })

  test('una propiedad sin verificar no se ofrece primera aunque coincida', () => {
    // Google la lista igual, pero devolvería el MISMO 403 al consultarla.
    const sites = rankSites([
      { siteUrl: 'sc-domain:ejemplo.com', permissionLevel: 'siteUnverifiedUser' },
      { siteUrl: 'https://ejemplo.com/',  permissionLevel: 'siteRestrictedUser' },
    ], 'https://ejemplo.com')

    expect(sites[0].siteUrl).toBe('https://ejemplo.com/')
    expect(sites[0].verified).toBe(true)
    expect(sites[1].verified).toBe(false)
  })

  test('sin sitio en el proyecto nadie coincide, y ordena alfabético', () => {
    const sites = rankSites([
      { siteUrl: 'https://b.com/', permissionLevel: 'siteOwner' },
      { siteUrl: 'https://a.com/', permissionLevel: 'siteOwner' },
    ], null)

    expect(sites.map(s => s.siteUrl)).toEqual(['https://a.com/', 'https://b.com/'])
    expect(sites.every(s => s.matchesProject === false)).toBe(true)
  })
})
