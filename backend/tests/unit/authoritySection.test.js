// La sección "Autoridad y enlaces" del informe al cliente. Lo que más importa acá no
// es el formato de los números: es la GARANTÍA DE PRIVACIDAD. Competencia,
// oportunidades y pipeline son trabajo interno (a quién le vamos a pedir un enlace,
// cuánto estaríamos dispuestos a pagar, qué descartamos) y no se publican nunca.
const { buildAuthoritySection } = require('../../src/services/monthlyReport/sectionBuilders/authority')

const snap = (over = {}) => ({
  referringDomains: 40, activeLinks: 52, followLinks: 30,
  newLinks: 5, lostLinks: 1, avgDomainRating: 38.2, domainRating: 44, ...over,
})

describe('sección de autoridad — cuándo existe', () => {
  it('sin snapshot del mes no hay sección', () => {
    // Igual que el resto de los builders: la tarjeta no se dibuja con datos inventados.
    expect(buildAuthoritySection(null, null, null)).toBeNull()
    expect(buildAuthoritySection(undefined, snap(), null)).toBeNull()
  })

  it('con snapshot devuelve los contadores del mes', () => {
    expect(buildAuthoritySection(snap(), null, null)).toMatchObject({
      domainRating: 44, referringDomains: 40, activeLinks: 52, followLinks: 30,
      newLinks: 5, lostLinks: 1, avgDomainRating: 38.2,
    })
  })
})

describe('sección de autoridad — qué NO se publica', () => {
  it('no filtra ni un campo de prospectos, pipeline o competencia', () => {
    // El riesgo real no es hoy: es que en seis meses alguien le agregue "contexto
    // competitivo" al informe. Esta afirmación es lo que lo convierte en un test roto
    // en vez de una filtración silenciosa al link público del cliente.
    const out = buildAuthoritySection(snap(), snap({ referringDomains: 32 }), null)
    const prohibido = /prospect|pipeline|competitor|verdict|cost|owner|contact|oportunidad|dueDate|taskId/i
    const walk = (obj, path = '') => {
      for (const [k, v] of Object.entries(obj || {})) {
        expect(`${path}${k}`).not.toMatch(prohibido)
        if (v && typeof v === 'object') walk(v, `${path}${k}.`)
      }
    }
    walk(out)
  })

  it('tampoco publica lo que reportó la herramienta externa', () => {
    // Es un número tipeado a mano que puede tener meses. La brecha contra nuestro
    // inventario es información operativa y vive en la vista de Perfil, para el equipo.
    const out = buildAuthoritySection(snap({ reportedDomains: 412 }), null, null)
    expect(out).not.toHaveProperty('reportedDomains')
    expect(JSON.stringify(out)).not.toContain('412')
  })
})

describe('sección de autoridad — la variación contra el período anterior', () => {
  it('los dominios varían en porcentaje', () => {
    const out = buildAuthoritySection(snap({ referringDomains: 40 }), snap({ referringDomains: 32 }), null)
    expect(out.delta.referringDomains).toBe(25)
  })

  it('el Domain Rating varía en PUNTOS y no en porcentaje', () => {
    // Es una escala 0–100: "subió 3 puntos" se entiende, "+7,3%" no le dice nada a nadie.
    const out = buildAuthoritySection(snap({ domainRating: 44 }), snap({ domainRating: 41 }), null)
    expect(out.delta.domainRating).toBe(3)
  })

  it('sin DR en alguno de los dos meses no se inventa variación', () => {
    const out = buildAuthoritySection(snap({ domainRating: 44 }), snap({ domainRating: null }), null)
    expect(out.delta.domainRating).toBeNull()
  })

  it('sin mes anterior no hay variación', () => {
    expect(buildAuthoritySection(snap(), null, null).delta).toBeNull()
  })
})

describe('sección de autoridad — informe de varios meses', () => {
  const flow = { blk: { newLinks: 13, lostLinks: 4 } }

  it('los enlaces ganados y perdidos se suman a lo largo del período', () => {
    const out = buildAuthoritySection(snap({ newLinks: 5, lostLinks: 1 }), null, flow)
    expect(out.newLinks).toBe(13)
    expect(out.lostLinks).toBe(4)
  })

  it('el stock sigue siendo el del mes ancla: los dominios no se suman', () => {
    // Sumar los dominios de tres meses contaría tres veces el mismo sitio.
    const out = buildAuthoritySection(snap({ referringDomains: 40 }), null, flow)
    expect(out.referringDomains).toBe(40)
  })

  it('en varios meses se omite la variación mes a mes', () => {
    const out = buildAuthoritySection(snap(), snap({ referringDomains: 32 }), flow)
    expect(out.delta).toBeNull()
  })
})
