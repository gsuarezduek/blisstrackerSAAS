const {
  normalizeLinkUrl, isOwnDomain, linkTypeFromRel, checkVerdict, nextLinkState,
  profileFromLinks, monthCounts, effectiveVerdict, MAX_URL_LENGTH,
} = require('../../src/lib/backlinks')

// Un enlace del inventario, con los defaults de uno sano.
const link = (over = {}) => ({
  sourceDomain: 'diario.com', status: 'activo', linkType: 'follow',
  domainRating: null, firstSeenAt: null, lostAt: null, ...over,
})

describe('backlinks — identidad de la URL que nos enlaza', () => {
  it('iguala la misma URL escrita distinto (www, mayúsculas, barra final, fragmento)', () => {
    const a = normalizeLinkUrl('HTTPS://WWW.Diario.com/nota/#seccion').url
    const b = normalizeLinkUrl('https://diario.com/nota').url
    expect(a).toBe(b)
  })

  it('NO iguala dos páginas distintas que comparten prefijo', () => {
    expect(normalizeLinkUrl('https://x.com/nota').url).not.toBe(normalizeLinkUrl('https://x.com/nota-2').url)
  })

  it('descarta los parámetros de rastreo y conserva los que identifican el recurso', () => {
    // Si utm_* no se fuera, el mismo enlace compartido dos veces entraría dos
    // veces y rompería la idempotencia del import.
    expect(normalizeLinkUrl('https://x.com/n?utm_source=nl&gclid=1&id=7').url).toBe('https://x.com/n?id=7')
  })

  it('acepta una URL sin protocolo (es como se pega desde una planilla)', () => {
    expect(normalizeLinkUrl('diario.com/nota').url).toBe('https://diario.com/nota')
  })

  it('rechaza lo que no es una URL http(s)', () => {
    expect(normalizeLinkUrl('javascript:alert(1)').url).toBeNull()
    expect(normalizeLinkUrl('   ').url).toBeNull()
  })

  it('trunca y lo avisa: sourceUrl es parte de un UNIQUE y el índice btree de Postgres tiene tope', () => {
    const largo = normalizeLinkUrl(`https://x.com/${'a'.repeat(1200)}`)
    expect(largo.url.length).toBe(MAX_URL_LENGTH)
    expect(largo.truncated).toBe(true)
  })
})

describe('backlinks — ¿el enlace apunta a nuestro sitio?', () => {
  it('un subdominio nuestro cuenta', () => {
    expect(isOwnDomain('blog.cliente.com', 'cliente.com')).toBe(true)
    expect(isOwnDomain('www.cliente.com', 'cliente.com')).toBe(true)
  })

  it('un dominio que apenas termina parecido NO cuenta', () => {
    // Sin el punto separador, un endsWith los confundiría y contaríamos como
    // nuestro un enlace a la competencia.
    expect(isOwnDomain('nocliente.com', 'cliente.com')).toBe(false)
  })
})

describe('backlinks — qué dice el rel', () => {
  it('sin rel es follow', () => {
    expect(linkTypeFromRel('')).toBe('follow')
    expect(linkTypeFromRel(null)).toBe('follow')
  })

  it('un enlace pago es pago aunque además diga nofollow', () => {
    expect(linkTypeFromRel('sponsored nofollow')).toBe('sponsored')
  })

  it('ugc gana sobre nofollow', () => {
    expect(linkTypeFromRel('nofollow ugc')).toBe('ugc')
  })

  it('lee el nofollow entre otros valores y tolera mayúsculas', () => {
    expect(linkTypeFromRel('noopener NOFOLLOW noreferrer')).toBe('nofollow')
  })
})

describe('backlinks — veredicto de un chequeo', () => {
  it('un 403 o 429 es bloqueo nuestro, no un enlace perdido', () => {
    expect(checkVerdict({ found: false, httpStatus: 403 })).toBe('bloqueado')
    expect(checkVerdict({ found: false, httpStatus: 429 })).toBe('bloqueado')
  })

  it('la pérdida real es un 200 que carga y ya no tiene el enlace', () => {
    expect(checkVerdict({ found: false, httpStatus: 200 })).toBe('sin_link')
  })

  it('un 404 es roto, no perdido', () => {
    expect(checkVerdict({ found: false, httpStatus: 404 })).toBe('roto')
  })

  it('encontrar el enlace gana sobre cualquier otra señal', () => {
    expect(checkVerdict({ found: true, httpStatus: 200 })).toBe('activo')
  })

  it('redirigido solo si el destino es otro sitio, no por un http→https', () => {
    expect(checkVerdict({ found: false, httpStatus: 200, redirectedToHost: 'otro.com', ownDomain: 'cliente.com' })).toBe('redirigido')
    expect(checkVerdict({ found: false, httpStatus: 200, redirectedToHost: 'www.cliente.com', ownDomain: 'cliente.com' })).toBe('sin_link')
  })

  it('un error de red es error, que tampoco es una pérdida', () => {
    expect(checkVerdict({ found: false, error: 'ETIMEDOUT' })).toBe('error')
  })
})

describe('backlinks — histéresis: un fallo no da el enlace por perdido', () => {
  it('el primer fallo solo cuenta, no cambia el estado ni sella la fecha', () => {
    const next = nextLinkState({ status: 'activo', checkFailures: 0 }, { status: 'sin_link' })
    expect(next).toEqual({ status: 'activo', checkFailures: 1, lostAt: null })
  })

  it('el segundo fallo consecutivo sí lo pierde y sella lostAt', () => {
    const next = nextLinkState({ status: 'activo', checkFailures: 1 }, { status: 'sin_link' })
    expect(next.status).toBe('perdido')
    expect(next.lostAt).toBeInstanceOf(Date)
  })

  it('un 404 repetido queda roto, no perdido (la página murió, no el enlace)', () => {
    expect(nextLinkState({ status: 'activo', checkFailures: 1 }, { status: 'roto' }).status).toBe('roto')
  })

  it('un chequeo exitoso resetea el contador y lo revive', () => {
    const next = nextLinkState({ status: 'perdido', checkFailures: 2, lostAt: new Date() }, { status: 'activo' })
    expect(next).toEqual({ status: 'activo', checkFailures: 0, lostAt: null })
  })

  it('un bloqueo NO acerca el enlace a darse por perdido', () => {
    // Un medio que siempre nos devuelve 403 no puede terminar reportado como
    // enlace perdido al cliente.
    const next = nextLinkState({ status: 'activo', checkFailures: 0 }, { status: 'bloqueado' })
    expect(next).toEqual({ status: 'activo', checkFailures: 0, lostAt: null })
  })
})

describe('backlinks — contadores del perfil', () => {
  it('solo los activos cuentan, y los dominios se cuentan una vez', () => {
    const p = profileFromLinks([
      link({ sourceDomain: 'a.com' }),
      link({ sourceDomain: 'a.com', linkType: 'nofollow' }),
      link({ sourceDomain: 'b.com' }),
      link({ sourceDomain: 'c.com', status: 'perdido' }),
    ])
    expect(p).toMatchObject({ activeLinks: 3, referringDomains: 2, followLinks: 2, lostLinks: 1 })
  })

  it('el DR promedio ignora los enlaces de los que no sabemos el DR', () => {
    const p = profileFromLinks([link({ domainRating: 40 }), link({ domainRating: 60 }), link()])
    expect(p.avgDomainRating).toBe(50)
  })

  it('sin ningún DR cargado es null y no 0 (no saber no es tener autoridad cero)', () => {
    expect(profileFromLinks([link()]).avgDomainRating).toBeNull()
  })
})

describe('backlinks — ganados y perdidos del mes', () => {
  it('cuenta por la fecha en que el enlace apareció y en que se perdió', () => {
    const counts = monthCounts([
      link({ firstSeenAt: new Date('2026-10-15T00:00:00Z') }),
      link({ firstSeenAt: new Date('2026-09-30T00:00:00Z') }),
      link({ status: 'perdido', lostAt: new Date('2026-10-02T00:00:00Z') }),
    ], '2026-10')
    expect(counts).toEqual({ newLinks: 1, lostLinks: 1 })
  })

  it('un enlace sin firstSeenAt no cuenta como nuevo', () => {
    // No sabemos desde cuándo existe; asumir que nació el día que se cargó
    // inflaría el mes de la importación con enlaces viejos.
    expect(monthCounts([link()], '2026-10').newLinks).toBe(0)
  })
})

describe('backlinks — el estado único que ve el usuario en un prospecto', () => {
  it('"ya lo tenemos" es un hecho y gana sobre el veredicto de la IA', () => {
    expect(effectiveVerdict({ alreadyLinked: true, verdict: 'conseguible' })).toBe('ya_lo_tenemos')
  })

  it('sin el hecho, manda la opinión', () => {
    expect(effectiveVerdict({ alreadyLinked: false, verdict: 'no_vale_la_pena' })).toBe('no_vale_la_pena')
  })

  it('una fila recién cargada está sin evaluar', () => {
    expect(effectiveVerdict({})).toBe('sin_evaluar')
  })
})
