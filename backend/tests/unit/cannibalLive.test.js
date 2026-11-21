const {
  annotateConflictsWithLive, splitByLive, urlsToCheck, verifyHreflangIssues,
} = require('../../src/lib/cannibalLive')

const BASE = 'https://mdzrentacar.com'

function conflict(urls, mainUrl) {
  return {
    query: 'alquiler de autos',
    language: 'default',
    urls: urls.map(u => ({ url: u, clicks: 0, impressions: 100 })),
    recommendation: { mainUrl: mainUrl ?? urls[0], steps: [] },
  }
}

function check(url, over = {}) {
  return { url, status: 200, redirectedTo: null, canonical: null, noindex: false, hreflang: [], error: null, ...over }
}

describe('annotateConflictsWithLive', () => {
  it('un 301 de hace meses deja el conflicto como ya resuelto en el sitio', () => {
    // El caso reportado: recomendaba URLs que redirigen desde hace 40 días.
    const c = conflict([`${BASE}/autos`, `${BASE}/flota`])
    const checks = new Map([
      [`${BASE}/autos`,  check(`${BASE}/autos`)],
      [`${BASE}/flota`,  check(`${BASE}/flota`, { status: 301, redirectedTo: `${BASE}/autos` })],
    ])
    const [out] = annotateConflictsWithLive([c], checks)
    expect(out.live.fixed).toBe(true)
    expect(out.live.reason).toMatch(/Search Console mira días anteriores/)
    expect(out.urls.find(u => u.url === `${BASE}/flota`).live.state).toBe('redirect_to_other')
  })

  it('con dos URLs vivas el conflicto sigue abierto', () => {
    const c = conflict([`${BASE}/autos`, `${BASE}/flota`])
    const checks = new Map([
      [`${BASE}/autos`, check(`${BASE}/autos`)],
      [`${BASE}/flota`, check(`${BASE}/flota`)],
    ])
    const [out] = annotateConflictsWithLive([c], checks)
    expect(out.live).toBeUndefined()
    expect(out.urls.every(u => u.live.fixed === false)).toBe(true)
  })

  it('avisa si la URL principal sugerida es justo la que redirige', () => {
    const c = conflict([`${BASE}/autos`, `${BASE}/flota`, `${BASE}/precios`], `${BASE}/autos`)
    const checks = new Map([
      [`${BASE}/autos`,   check(`${BASE}/autos`, { status: 301, redirectedTo: 'https://otro.com/' })],
      [`${BASE}/flota`,   check(`${BASE}/flota`)],
      [`${BASE}/precios`, check(`${BASE}/precios`)],
    ])
    const [out] = annotateConflictsWithLive([c], checks)
    expect(out.live.fixed).toBe(false)
    expect(out.live.warning).toMatch(/ya no responde con contenido propio/)
  })

  it('si no se chequeó ninguna URL, el conflicto queda intacto', () => {
    const c = conflict([`${BASE}/autos`, `${BASE}/flota`])
    const [out] = annotateConflictsWithLive([c], new Map())
    expect(out).toBe(c)
  })

  it('un chequeo con error no da nada por arreglado', () => {
    const c = conflict([`${BASE}/autos`, `${BASE}/flota`])
    const checks = new Map([
      [`${BASE}/autos`, check(`${BASE}/autos`)],
      [`${BASE}/flota`, check(`${BASE}/flota`, { error: 'timeout', status: null })],
    ])
    const [out] = annotateConflictsWithLive([c], checks)
    expect(out.live).toBeUndefined()
  })
})

describe('splitByLive', () => {
  it('separa pendientes de ya resueltos sin perder ninguno', () => {
    const a = { query: 'a' }
    const b = { query: 'b', live: { fixed: true } }
    const { pending, fixedLive } = splitByLive([a, b])
    expect(pending).toEqual([a])
    expect(fixedLive).toEqual([b])
  })
})

describe('urlsToCheck', () => {
  it('no repite URLs y respeta el tope', () => {
    const conflicts = [conflict([`${BASE}/a`, `${BASE}/b`]), conflict([`${BASE}/b`, `${BASE}/c`])]
    expect(urlsToCheck(conflicts)).toEqual([`${BASE}/a`, `${BASE}/b`, `${BASE}/c`])
    expect(urlsToCheck(conflicts, 2)).toHaveLength(2)
  })
})

describe('verifyHreflangIssues', () => {
  const issue = {
    query: 'alquiler de autos',
    urls: [
      { url: `${BASE}/autos`,   language: 'default' },
      { url: `${BASE}/en/cars`, language: 'en' },
    ],
  }

  it('etiquetas bien puestas: el hallazgo desaparece y se cuenta como revisado', () => {
    const { hreflangIssues, hreflangOkCount } = verifyHreflangIssues([issue], new Map(), () => ({ ok: true, checked: true, problems: [] }))
    expect(hreflangIssues).toHaveLength(0)
    expect(hreflangOkCount).toBe(1)
  })

  it('etiquetas mal: el hallazgo queda, con el detalle de qué falta', () => {
    const problems = [{ type: 'no_self', url: `${BASE}/autos`, detail: 'No se autorreferencia' }]
    const { hreflangIssues } = verifyHreflangIssues([issue], new Map(), () => ({ ok: false, checked: true, problems }))
    expect(hreflangIssues).toHaveLength(1)
    expect(hreflangIssues[0].verified).toBe(true)
    expect(hreflangIssues[0].suggestion).toMatch(/No se autorreferencia/)
  })

  it('sin poder leer las páginas, el hallazgo queda marcado como sin verificar', () => {
    const { hreflangIssues } = verifyHreflangIssues([issue], new Map(), () => ({ ok: false, checked: false, problems: [] }))
    expect(hreflangIssues[0].verified).toBe(false)
    expect(hreflangIssues[0].suggestion).toMatch(/No se pudieron leer/)
  })
})
