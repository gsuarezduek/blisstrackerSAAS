// Este archivo prueba SOLO el chequeo de un enlace: HTML fijo, sin red y sin base.
// La persistencia y la histéresis aplicada viven en el test de integración.
jest.mock('../../src/lib/prisma', () => ({
  backlink:     { findMany: jest.fn(), update: jest.fn(), count: jest.fn() },
  backlinkCheck: { create: jest.fn() },
  backlinkJob:  { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
  project:      { findUnique: jest.fn(), findMany: jest.fn() },
}))
jest.mock('../../src/lib/safeUrl', () => ({ fetchPublicUrl: jest.fn(), assertPublicUrl: jest.fn() }))

const { fetchPublicUrl } = require('../../src/lib/safeUrl')
const { checkOneBacklink, findLinkToUs, hasNoindex } = require('../../src/services/backlinkVerifier.service')

const page = (body, head = '') => `<html><head>${head}</head><body>${body}</body></html>`

/** Lo que devolvería fetchPublicUrl: status, HTML y la URL del último salto. */
function respond({ status = 200, data = page(''), finalUrl = 'https://diario.com/nota' } = {}) {
  fetchPublicUrl.mockResolvedValueOnce({ status, data, finalUrl, headers: {} })
}

const link = { id: 1, sourceUrl: 'https://diario.com/nota', status: 'activo', checkFailures: 0, lostAt: null }

beforeEach(() => jest.clearAllMocks())

describe('verificador — encontrar el enlace que apunta a nosotros', () => {
  it('lo encuentra y se queda con el anchor y el rel', async () => {
    respond({ data: page('<a href="https://cliente.com/servicios" rel="nofollow">la agencia</a>') })
    const r = await checkOneBacklink(link, 'cliente.com')
    expect(r).toMatchObject({ status: 'activo', found: true, anchor: 'la agencia', linkType: 'nofollow' })
    expect(r.targetUrl).toContain('cliente.com/servicios')
  })

  it('cuenta un enlace a un subdominio nuestro', async () => {
    respond({ data: page('<a href="https://blog.cliente.com/nota">nota</a>') })
    expect((await checkOneBacklink(link, 'cliente.com')).found).toBe(true)
  })

  it('cuenta un enlace protocol-relative y uno con www', async () => {
    respond({ data: page('<a href="//www.cliente.com/x">x</a>') })
    expect((await checkOneBacklink(link, 'cliente.com')).found).toBe(true)
  })

  it('NO cuenta un enlace a un dominio que apenas termina parecido', async () => {
    // El riesgo del endsWith sin punto: nocliente.com no es cliente.com.
    respond({ data: page('<a href="https://nocliente.com/x">x</a>') })
    expect((await checkOneBacklink(link, 'cliente.com')).found).toBe(false)
  })

  it('ignora los enlaces a otros sitios y encuentra el nuestro entre ellos', async () => {
    respond({ data: page('<a href="https://otro.com/a">a</a><a href="https://cliente.com/b">b</a>') })
    expect((await checkOneBacklink(link, 'cliente.com')).anchor).toBe('b')
  })

  it('toma el alt de la imagen como anchor cuando el enlace es un logo', async () => {
    respond({ data: page('<a href="https://cliente.com"><img src="/logo.png" alt="Logo de Cliente"></a>') })
    expect((await checkOneBacklink(link, 'cliente.com')).anchor).toBe('Logo de Cliente')
  })

  it('sin rel el enlace es follow, que es el que transmite autoridad', async () => {
    respond({ data: page('<a href="https://cliente.com/x">x</a>') })
    expect((await checkOneBacklink(link, 'cliente.com')).linkType).toBe('follow')
  })

  it('colapsa los espacios del anchor', async () => {
    respond({ data: page('<a href="https://cliente.com/x">  agencia\n  de  marketing </a>') })
    expect((await checkOneBacklink(link, 'cliente.com')).anchor).toBe('agencia de marketing')
  })

  it('descarta un href que no es http(s)', async () => {
    respond({ data: page('<a href="mailto:hola@cliente.com">mail</a>') })
    expect((await checkOneBacklink(link, 'cliente.com')).found).toBe(false)
  })
})

describe('verificador — lo que NO es una pérdida', () => {
  it('un 403 es bloqueo del sitio, no un enlace caído', async () => {
    // Es la defensa principal contra el falso "se cayó el enlace": muchos medios
    // devuelven 403 a un UA desconocido y el enlace sigue estando.
    respond({ status: 403, data: page('Access denied') })
    expect((await checkOneBacklink(link, 'cliente.com')).status).toBe('bloqueado')
  })

  it('un 429 también es bloqueo', async () => {
    respond({ status: 429, data: '' })
    expect((await checkOneBacklink(link, 'cliente.com')).status).toBe('bloqueado')
  })

  it('un error de red es error, no pérdida', async () => {
    fetchPublicUrl.mockRejectedValueOnce(new Error('ETIMEDOUT'))
    const r = await checkOneBacklink(link, 'cliente.com')
    expect(r).toMatchObject({ status: 'error', found: false, httpStatus: null })
    expect(r.errorMsg).toContain('ETIMEDOUT')
  })

  it('una URL que dejó de ser pública tampoco es pérdida (la corta assertPublicUrl)', async () => {
    fetchPublicUrl.mockRejectedValueOnce(new Error('La URL apunta a una dirección privada'))
    expect((await checkOneBacklink(link, 'cliente.com')).status).toBe('error')
  })

  it('un 403 no se parsea: su HTML es la página de bloqueo, no la nota', async () => {
    respond({ status: 403, data: page('<a href="https://cliente.com/x">x</a>') })
    const r = await checkOneBacklink(link, 'cliente.com')
    expect(r.found).toBe(false)
    expect(r.anchor).toBeUndefined()
  })
})

describe('verificador — la pérdida real y la página rota', () => {
  it('un 200 que carga y ya no tiene el enlace es la pérdida real', async () => {
    respond({ data: page('<a href="https://otro.com/x">x</a>') })
    expect((await checkOneBacklink(link, 'cliente.com')).status).toBe('sin_link')
  })

  it('un 404 es página rota, que no es lo mismo que un enlace quitado', async () => {
    respond({ status: 404, data: '' })
    expect((await checkOneBacklink(link, 'cliente.com')).status).toBe('roto')
  })

  it('un 500 también es roto', async () => {
    respond({ status: 500, data: '' })
    expect((await checkOneBacklink(link, 'cliente.com')).status).toBe('roto')
  })
})

describe('verificador — redirecciones', () => {
  it('una mudanza a otro sitio es redirigido, no perdido', async () => {
    respond({ data: page('sin enlaces'), finalUrl: 'https://otro-medio.com/nota' })
    const r = await checkOneBacklink(link, 'cliente.com')
    expect(r.status).toBe('redirigido')
    expect(r.redirectedTo).toBe('https://otro-medio.com/nota')
  })

  it('un redirect al MISMO host no es una mudanza', async () => {
    // http→https y la barra final redirigen todo el tiempo: marcarlos movería
    // enlaces que están perfectamente bien.
    respond({ data: page('sin enlaces'), finalUrl: 'https://www.diario.com/nota/' })
    expect((await checkOneBacklink(link, 'cliente.com')).status).toBe('sin_link')
  })

  it('si el enlace está, el redirect no importa', async () => {
    respond({ data: page('<a href="https://cliente.com/x">x</a>'), finalUrl: 'https://diario.com/nota-nueva' })
    expect((await checkOneBacklink(link, 'cliente.com')).status).toBe('activo')
  })
})

describe('verificador — noindex de la página que nos enlaza', () => {
  it('lo detecta y lo informa sin cambiar el estado: el enlace está', async () => {
    respond({
      data: page('<a href="https://cliente.com/x">x</a>', '<meta name="robots" content="noindex, follow">'),
    })
    const r = await checkOneBacklink(link, 'cliente.com')
    expect(r).toMatchObject({ status: 'activo', found: true, noindex: true })
  })

  it('también lee el meta de googlebot', () => {
    expect(hasNoindex(page('', '<meta name="googlebot" content="noindex">'))).toBe(true)
  })

  it('una página normal no está en noindex', () => {
    expect(hasNoindex(page('', '<meta name="robots" content="index, follow">'))).toBe(false)
    expect(hasNoindex(page(''))).toBe(false)
  })
})

describe('verificador — el caso de la SPA', () => {
  it('un HTML sin el enlace se reporta como sin_link, y la histéresis evita el falso perdido', async () => {
    // cheerio no ejecuta JS: un sitio que pinta el enlace con React se lee como
    // "no está". La salida es `statusLockedAt` (confirmarlo a mano), más los dos
    // fallos consecutivos que exige nextLinkState antes de sellar la pérdida.
    respond({ data: page('<div id="root"></div>') })
    expect((await checkOneBacklink(link, 'cliente.com')).status).toBe('sin_link')
  })
})

describe('verificador — findLinkToUs aislado', () => {
  it('resuelve un href relativo contra la URL de la página', () => {
    const hit = findLinkToUs(page('<a href="/servicios">x</a>'), 'https://cliente.com/blog/nota', 'cliente.com')
    expect(hit?.targetUrl).toContain('cliente.com/servicios')
  })

  it('sin dominio propio no busca nada (no hay con qué comparar)', () => {
    expect(findLinkToUs(page('<a href="https://cliente.com">x</a>'), 'https://x.com', null)).toBeNull()
  })

  it('con HTML vacío devuelve null en vez de explotar', () => {
    expect(findLinkToUs('', 'https://x.com', 'cliente.com')).toBeNull()
  })
})
