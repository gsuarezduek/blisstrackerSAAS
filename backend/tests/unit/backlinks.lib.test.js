const {
  normalizeLinkUrl, isOwnDomain, linkTypeFromRel, checkVerdict, nextLinkState,
  profileFromLinks, monthCounts, effectiveVerdict, followLostInWindow, MAX_URL_LENGTH,
  prospectDomain, aggregateProspects, mergeCompetitorEvidence, parseCompetitors,
  competitorLinkTotal,
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

describe('backlinks — el dominio como identidad de un prospecto', () => {
  it('acepta lo que una persona escribe de verdad', () => {
    // Los tres son el mismo sitio, y el UNIQUE es por dominio: si no coincidieran,
    // el mismo medio entraría tres veces con tres veredictos.
    for (const input of ['diario.com', 'www.Diario.com', 'https://www.diario.com/seccion/nota?utm_source=x']) {
      expect(prospectDomain(input)).toBe('diario.com')
    }
  })

  it('un subdominio es OTRO prospecto', () => {
    // Conseguir un enlace de blog.diario.com no es lo mismo que conseguirlo del
    // diario: puede ser otra redacción y otro contacto.
    expect(prospectDomain('blog.diario.com')).toBe('blog.diario.com')
  })

  it('devuelve null con basura, en vez de inventar un dominio', () => {
    expect(prospectDomain('')).toBeNull()
    expect(prospectDomain('no es una url')).toBeNull()
  })
})

describe('backlinks — agrupar un export de competencia por dominio', () => {
  const row = (over = {}) => ({ sourceDomain: 'diario.com', sourceUrl: 'https://diario.com/nota', anchor: null, domainRating: null, traffic: null, language: null, ...over })

  it('tres páginas del mismo sitio son UN prospecto con tres enlaces', () => {
    // Es la razón de ser del modelo: la decisión se toma una vez por sitio.
    const out = aggregateProspects([
      row({ sourceUrl: 'https://diario.com/a' }),
      row({ sourceUrl: 'https://diario.com/b' }),
      row({ sourceUrl: 'https://diario.com/c' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ domain: 'diario.com', links: 3 })
  })

  it('ordena por cantidad de páginas: la señal de prioridad primero', () => {
    const out = aggregateProspects([
      row({ sourceDomain: 'poco.com', sourceUrl: 'https://poco.com/a' }),
      row({ sourceDomain: 'mucho.com', sourceUrl: 'https://mucho.com/a' }),
      row({ sourceDomain: 'mucho.com', sourceUrl: 'https://mucho.com/b' }),
    ])
    expect(out.map(p => p.domain)).toEqual(['mucho.com', 'poco.com'])
  })

  it('toma el DR y el tráfico MÁS ALTOS vistos, no los de la primera fila', () => {
    // Son atributos del dominio, no de la página, y un export puede traerlos
    // incompletos en algunas filas.
    const out = aggregateProspects([
      row({ domainRating: null, traffic: 100 }),
      row({ sourceUrl: 'https://diario.com/b', domainRating: 71, traffic: null }),
      row({ sourceUrl: 'https://diario.com/c', domainRating: 40, traffic: 900 }),
    ])
    expect(out[0]).toMatchObject({ domainRating: 71, traffic: 900 })
  })

  it('prefiere una página concreta como ejemplo antes que la home', () => {
    // Una fila de Search Console trae `https://dominio` sintético, que como
    // ejemplo no dice nada que no diga ya el dominio.
    const out = aggregateProspects([
      row({ sourceUrl: 'https://diario.com' }),
      row({ sourceUrl: 'https://diario.com/nota-real' }),
    ])
    expect(out[0].exampleUrl).toBe('https://diario.com/nota-real')
  })

  it('se queda con el primer anchor que exista', () => {
    const out = aggregateProspects([row({ anchor: null }), row({ sourceUrl: 'https://diario.com/b', anchor: 'la agencia' })])
    expect(out[0].exampleAnchor).toBe('la agencia')
  })

  it('ignora las filas sin dominio en vez de romper', () => {
    expect(aggregateProspects([row({ sourceDomain: null }), row()])).toHaveLength(1)
    expect(aggregateProspects(null)).toEqual([])
  })
})

describe('backlinks — la evidencia de a qué competidores enlaza un dominio', () => {
  it('suma un competidor nuevo sin perder el anterior', () => {
    // Es el caso valioso: un medio que enlaza a DOS competidores y a nosotros no.
    const out = mergeCompetitorEvidence('[{"domain":"comp1.com","links":2}]', { domain: 'comp2.com', links: 5 })
    expect(out).toEqual([{ domain: 'comp2.com', links: 5 }, { domain: 'comp1.com', links: 2 }])
  })

  it('REEMPLAZA la entrada de un competidor en vez de sumarla: re-importar el mismo archivo no duplica la señal', () => {
    // Con un contador plano, importar dos veces el export de un competidor
    // duplicaba `linksToCompetitors` y lo subía al tope de la lista por nada.
    const once  = mergeCompetitorEvidence('[]', { domain: 'comp1.com', links: 4 })
    const twice = mergeCompetitorEvidence(JSON.stringify(once), { domain: 'comp1.com', links: 4 })
    expect(competitorLinkTotal(twice)).toBe(4)
  })

  it('links en 0 borra la atribución a ese competidor y deja el resto', () => {
    const out = mergeCompetitorEvidence('[{"domain":"a.com","links":1},{"domain":"b.com","links":2}]', { domain: 'a.com', links: 0 })
    expect(out).toEqual([{ domain: 'b.com', links: 2 }])
  })

  it('sin competidor devuelve la evidencia intacta', () => {
    // Un prospecto cargado a mano ("este sitio me lo recomendaron") no tiene a
    // quién atribuirle nada, y no por eso se le borra lo que ya sabía.
    const out = mergeCompetitorEvidence('[{"domain":"a.com","links":3}]', {})
    expect(out).toEqual([{ domain: 'a.com', links: 3 }])
  })

  it('un JSON roto se lee como lista vacía, no explota la fila', () => {
    expect(parseCompetitors('{no json')).toEqual([])
    expect(parseCompetitors(null)).toEqual([])
    expect(competitorLinkTotal('{no json')).toBe(0)
  })

  it('tolera la forma vieja, una lista de dominios sueltos', () => {
    expect(parseCompetitors('["a.com","b.com"]')).toEqual([{ domain: 'a.com', links: 0 }, { domain: 'b.com', links: 0 }])
  })
})

describe('backlinks — el enlace que sigue puesto y dejó de transferir autoridad', () => {
  const FROM = new Date('2026-10-01T00:00:00Z')
  const TO   = new Date('2026-11-01T00:00:00Z')
  const chk = (backlinkId, linkType, createdAt, found = true) => ({ backlinkId, linkType, found, createdAt })

  it('cuenta el que pasó de follow a nofollow dentro de la ventana', () => {
    expect(followLostInWindow([
      chk(1, 'follow', '2026-09-25'),
      chk(1, 'nofollow', '2026-10-06'),
    ], FROM, TO)).toBe(1)
  })

  it('no cuenta el que siguió siendo follow', () => {
    expect(followLostInWindow([
      chk(1, 'follow', '2026-09-25'),
      chk(1, 'follow', '2026-10-06'),
    ], FROM, TO)).toBe(0)
  })

  it('cuenta también sponsored y ugc: tampoco transfieren autoridad', () => {
    expect(followLostInWindow([
      chk(1, 'follow', '2026-10-02'), chk(1, 'sponsored', '2026-10-20'),
      chk(2, 'follow', '2026-10-02'), chk(2, 'ugc', '2026-10-20'),
    ], FROM, TO)).toBe(2)
  })

  it('ignora los chequeos que no encontraron el enlace', () => {
    // Un 403 o un timeout no dice NADA sobre el rel. Tratarlo como pérdida sería la
    // misma falsa alarma que la histéresis evita del otro lado.
    expect(followLostInWindow([
      chk(1, 'follow', '2026-09-25'),
      chk(1, 'nofollow', '2026-10-06', false),
    ], FROM, TO)).toBe(0)
  })

  it('un enlace cuenta una sola vez, aunque oscile entre follow y nofollow', () => {
    expect(followLostInWindow([
      chk(1, 'follow', '2026-10-02'), chk(1, 'nofollow', '2026-10-09'),
      chk(1, 'follow', '2026-10-16'), chk(1, 'nofollow', '2026-10-23'),
    ], FROM, TO)).toBe(1)
  })

  it('el cambio tiene que caer DENTRO de la ventana', () => {
    expect(followLostInWindow([
      chk(1, 'follow', '2026-09-05'),
      chk(1, 'nofollow', '2026-09-19'),
    ], FROM, TO)).toBe(0)
  })

  it('no le importa el orden en que vengan los chequeos', () => {
    expect(followLostInWindow([
      chk(1, 'nofollow', '2026-10-06'),
      chk(1, 'follow', '2026-09-25'),
    ], FROM, TO)).toBe(1)
  })

  it('un enlace con un solo chequeo no es una pérdida: no hay contra qué comparar', () => {
    expect(followLostInWindow([chk(1, 'nofollow', '2026-10-06')], FROM, TO)).toBe(0)
  })

  it('tolera una lista vacía o basura', () => {
    expect(followLostInWindow([], FROM, TO)).toBe(0)
    expect(followLostInWindow(null, FROM, TO)).toBe(0)
  })
})
