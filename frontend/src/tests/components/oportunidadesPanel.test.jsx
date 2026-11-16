// El tablero de oportunidades. Lo que se afirma acá es que el pipeline muestra el
// trabajo hecho: la etapa "Conseguido" no desaparece ni queda muda, y una fila ya
// conseguida deja de ofrecer "marcar como conseguido".
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import OportunidadesPanel from '../../components/marketing/enlaces/OportunidadesPanel'

const p = (over = {}) => ({
  id: 1, domain: 'diario.com', competitors: [{ domain: 'rival.com', links: 4 }],
  linksToCompetitors: 4, domainRating: 62, traffic: 12500,
  exampleUrl: null, alreadyLinked: false, verdict: 'conseguible', verdictSource: 'ai',
  verdictLocked: false, verdictReason: null, pipelineStatus: 'sin_empezar',
  pipelineNote: null, cost: null, dueDate: null, owner: null, ownerId: null,
  taskId: null, backlinkId: null, effectiveVerdict: 'conseguible',
  ...over,
})

// El nombre de una etapa aparece dos veces en la pantalla: como encabezado de su
// columna y como opción del selector de cada fila. El encabezado es el `span` del
// chip; las opciones son `option`. Distinguirlos acá evita afirmar sobre el selector
// creyendo que se afirma sobre la columna.
const stageHeader = label => screen.getAllByText(label).filter(el => el.tagName === 'SPAN')

function show(items, counts = {}) {
  return render(
    <OportunidadesPanel items={items} pipelineCounts={counts} members={[]} loading={false}
      onMove={vi.fn()} onPatch={vi.fn()} onTask={vi.fn()} onPromote={vi.fn()} />,
  )
}

describe('oportunidades — las etapas del pipeline', () => {
  it('muestra "Conseguido" incluso vacía, y dice que todavía no hay ninguno', () => {
    // Esconderla haría parecer que la etapa no existe; el pipeline perdería la
    // etapa que muestra el resultado del trabajo.
    show([p()])
    expect(stageHeader('Conseguido')).toHaveLength(1)
    expect(screen.getByText('Todavía no se consiguió ninguno.')).toBeInTheDocument()
  })

  it('muestra "Sin empezar" vacía: ver el cero es la señal de que no quedó nada sin tocar', () => {
    show([p({ pipelineStatus: 'contactado' })])
    expect(stageHeader('Sin empezar')).toHaveLength(1)
    expect(screen.getByText('Nada en esta etapa.')).toBeInTheDocument()
  })

  it('oculta las etapas intermedias que están vacías', () => {
    show([p()])
    expect(stageHeader('Negociando')).toHaveLength(0)
    expect(stageHeader('Descartado')).toHaveLength(0)
  })

  it('cada fila cae en la etapa de su pipelineStatus', () => {
    show([p({ id: 1, domain: 'uno.com', pipelineStatus: 'contactado' }),
      p({ id: 2, domain: 'dos.com', pipelineStatus: 'negociando' })])
    expect(screen.getByText('uno.com')).toBeInTheDocument()
    expect(screen.getByText('dos.com')).toBeInTheDocument()
    expect(stageHeader('Contactado')).toHaveLength(1)
    expect(stageHeader('Negociando')).toHaveLength(1)
  })
})

describe('oportunidades — una fila conseguida', () => {
  it('marca "enlace cargado" cuando el cruce confirmó el dominio', () => {
    // Es la diferencia entre "dijimos que lo conseguimos" y "el enlace está en el
    // inventario": lo segundo lo verifica el cruce contra Nuestros enlaces.
    show([p({ pipelineStatus: 'conseguido', alreadyLinked: true, effectiveVerdict: 'ya_lo_tenemos' })])
    expect(screen.getByText('enlace cargado')).toBeInTheDocument()
  })

  it('no marca nada si quedó conseguida pero el enlace no está en el inventario', () => {
    show([p({ pipelineStatus: 'conseguido', alreadyLinked: false })])
    expect(screen.queryByText('enlace cargado')).not.toBeInTheDocument()
  })

  it('avisa cuando ya hay una tarea creada, para no crear tres veces la misma', () => {
    show([p({ taskId: 42 })])
    expect(screen.getByText(/con tarea/)).toBeInTheDocument()
  })
})

describe('oportunidades — el costo comprometido', () => {
  it('suma sólo lo que sigue abierto', () => {
    // Lo descartado no se va a pagar: sumarlo infla el número que alguien usa para
    // decidir si sigue invirtiendo.
    show([
      p({ id: 1, domain: 'a.com', cost: 100, pipelineStatus: 'contactado' }),
      p({ id: 2, domain: 'b.com', cost: 50,  pipelineStatus: 'negociando' }),
      p({ id: 3, domain: 'c.com', cost: 999, pipelineStatus: 'descartado' }),
    ])
    expect(screen.getByText(/Costo comprometido/)).toBeInTheDocument()
    expect(screen.getByText('$150')).toBeInTheDocument()
  })

  it('sin costos cargados no muestra la línea', () => {
    show([p()])
    expect(screen.queryByText(/Costo comprometido/)).not.toBeInTheDocument()
  })
})

describe('oportunidades — el estado vacío', () => {
  it('explica de dónde salen las oportunidades', () => {
    show([])
    expect(screen.getByText('Todavía no hay oportunidades.')).toBeInTheDocument()
    expect(screen.getByText(/clasificalos/)).toBeInTheDocument()
  })
})

describe('oportunidades — mover de etapa', () => {
  it('cada fila trae el selector con las cinco etapas', () => {
    const { container } = show([p()])
    const select = container.querySelector('select')
    expect(within(select).getAllByRole('option')).toHaveLength(5)
  })
})
