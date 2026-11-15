// Qué dice la tabla de competencia sobre un dominio. Lo que se afirma acá es el
// contrato que sostiene todo el modelo: "Ya lo tenemos" es un HECHO del cruce
// automático y gana sobre el veredicto, que es una opinión — pero no lo borra, así
// que al perder el enlace la fila vuelve a ser una oportunidad YA evaluada.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProspectsTable from '../../components/marketing/enlaces/ProspectsTable'

const prospect = (over = {}) => ({
  id: 1, domain: 'diario.com', competitors: [{ domain: 'compA.com', links: 4 }],
  linksToCompetitors: 4, domainRating: 62, traffic: 12500,
  exampleUrl: 'https://diario.com/nota', exampleAnchor: null,
  alreadyLinked: false, verdict: 'sin_evaluar', verdictSource: 'none',
  verdictReason: null, verdictLocked: false, pipelineStatus: 'sin_empezar',
  effectiveVerdict: 'sin_evaluar',
  ...over,
})

const COUNTS = { sin_evaluar: 1, conseguible: 0, no_conseguible: 0, no_vale_la_pena: 0, ya_lo_tenemos: 0 }

function show(items, counts = COUNTS) {
  return render(
    <ProspectsTable items={items} counts={counts} filter="" onFilter={vi.fn()}
      onVerdict={vi.fn()} onDelete={vi.fn()} />,
  )
}

describe('competencia — el estado único de un dominio', () => {
  it('"Ya lo tenemos" gana sobre el veredicto que había', () => {
    // El backend manda el veredicto viejo intacto Y el effectiveVerdict resuelto:
    // la tabla muestra el resuelto, no el crudo.
    show([prospect({ alreadyLinked: true, verdict: 'conseguible', effectiveVerdict: 'ya_lo_tenemos' })])
    expect(screen.getByText('Ya lo tenemos')).toBeInTheDocument()
    expect(screen.queryByText('Conseguible')).not.toBeInTheDocument()
  })

  it('sin el hecho, manda la opinión', () => {
    show([prospect({ verdict: 'no_vale_la_pena', effectiveVerdict: 'no_vale_la_pena' })])
    expect(screen.getByText('No vale la pena')).toBeInTheDocument()
  })

  it('marca con candado el veredicto corregido a mano', () => {
    // Es la diferencia entre "lo propuso la IA" y "lo decidimos nosotros", y lo
    // segundo la IA no lo vuelve a pisar.
    const { container } = show([prospect({ verdict: 'conseguible', effectiveVerdict: 'conseguible', verdictSource: 'manual', verdictLocked: true })])
    expect(container.querySelector('[title*="corregido a mano"]')).toBeTruthy()
  })

  it('no pone candado en el veredicto que propuso la IA', () => {
    const { container } = show([prospect({ verdict: 'conseguible', effectiveVerdict: 'conseguible', verdictSource: 'ai', verdictLocked: false })])
    expect(container.querySelector('[title*="corregido a mano"]')).toBeFalsy()
  })

  it('muestra la razón del veredicto: sin ella nadie sabe si confiar', () => {
    show([prospect({ verdict: 'no_conseguible', effectiveVerdict: 'no_conseguible', verdictReason: 'Es un directorio de pago sin tráfico real.' })])
    expect(screen.getByText(/directorio de pago/)).toBeInTheDocument()
  })
})

describe('competencia — la evidencia de por qué el dominio importa', () => {
  it('nombra a los competidores que enlaza, con cuántas páginas cada uno', () => {
    show([prospect({ competitors: [{ domain: 'compA.com', links: 4 }, { domain: 'compB.com', links: 1 }], linksToCompetitors: 5 })])
    // El (4) aclara que no es una mención suelta; compB sin número porque es una sola.
    expect(screen.getByText(/compA\.com \(4\), compB\.com/)).toBeInTheDocument()
  })

  it('un dominio cargado a mano dice que no tiene competidor atribuido', () => {
    show([prospect({ competitors: [], linksToCompetitors: 0 })])
    expect(screen.getByText('Sin competidor atribuido')).toBeInTheDocument()
  })
})

describe('competencia — los chips de filtro', () => {
  it('oculta los estados vacíos y deja siempre "Todos"', () => {
    show([prospect()], { ...COUNTS, sin_evaluar: 3, conseguible: 2 })
    // Por rol: el label del chip coincide con el de la pastilla de la fila, y lo
    // que se afirma acá es qué filtros se ofrecen.
    expect(screen.getByRole('button', { name: /Sin evaluar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Conseguibles/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Todos/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /No conseguibles/ })).not.toBeInTheDocument()
  })

  it('"Ya lo tenemos" es un chip propio y no un veredicto más', () => {
    // Viene del booleano, no de la columna `verdict`: son conteos disjuntos.
    show([prospect()], { ...COUNTS, ya_lo_tenemos: 7 })
    expect(screen.getByRole('button', { name: /Ya lo tenemos 7/ })).toBeInTheDocument()
  })

  it('sin dominios cargados explica que las filas se agrupan por sitio', () => {
    show([], { ...COUNTS, sin_evaluar: 0 })
    expect(screen.getByText(/se agrupan\s+por sitio/)).toBeInTheDocument()
  })
})
