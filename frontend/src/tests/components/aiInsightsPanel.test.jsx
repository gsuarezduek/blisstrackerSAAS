import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AiInsightsPanel from '../../components/marketing/seo/AiInsightsPanel'

// La sección es el bloque más alto de SEO y no es lo primero que se mira:
// arranca cerrada, y un click en el título la abre.
describe('AiInsightsPanel', () => {
  it('arranca colapsada y se abre al clickear el título', () => {
    render(<AiInsightsPanel aiData={null} onGenerate={() => {}} onCreateTask={() => {}} />)

    expect(screen.queryByText(/sugerencias accionables/)).toBeNull()
    expect(screen.getByText(/Sin generar/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Sugerencias IA/ }))
    expect(screen.getByText(/sugerencias accionables/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Sugerencias IA/ }))
    expect(screen.queryByText(/sugerencias accionables/)).toBeNull()
  })

  it('cerrada, resume cuántas sugerencias hay sin mostrarlas', () => {
    const aiData = {
      titulo: 'Subí estas páginas',
      resumen: 'Hay tres páginas cerca de la primera página.',
      oportunidades: [{ impacto: 'alto', pagina: '/a', accion: 'Reescribir el title', razon: 'Posición 11' }],
      quickWins: [{ titulo: 'Meta description', descripcion: 'Está vacía', tarea: 'Escribir la meta' }],
    }
    render(<AiInsightsPanel aiData={aiData} aiGeneratedAt="2026-11-01T12:00:00.000Z" onGenerate={() => {}} onCreateTask={() => {}} />)

    expect(screen.getByText(/1 oportunidades · 1 quick wins/)).toBeInTheDocument()
    expect(screen.queryByText('Subí estas páginas')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Sugerencias IA/ }))
    expect(screen.getByText('Subí estas páginas')).toBeInTheDocument()
    expect(screen.getByText('Reescribir el title')).toBeInTheDocument()
  })
})
