import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../components/portal/ClientPieceCard', () => ({
  default: ({ piece }) => <div data-testid="piece-card">{piece.title}</div>,
}))

import ClientContentCalendar from '../../components/portal/ClientContentCalendar'
import { currentMonthStr } from '../../components/calendar/MonthGrid'

const month = currentMonthStr()
const day = n => `${month}-${String(n).padStart(2, '0')}`

const pieces = [
  { id: 1, title: 'Post del jueves', status: 'aprobacion', scheduledDate: day(10), scheduledAt: `${day(10)}T15:00:00Z`, canDecide: true },
  { id: 2, title: 'Reel de lanzamiento', status: 'idea', scheduledDate: day(10), scheduledAt: `${day(10)}T18:00:00Z`, canDecide: false },
  { id: 3, title: 'Sin fecha aún', status: 'idea', scheduledDate: null, scheduledAt: null, canDecide: false },
]

describe('ClientContentCalendar', () => {
  it('muestra las piezas en su día, avisa de las sin fecha y abre la tarjeta al tocar', () => {
    render(<ClientContentCalendar pieces={pieces} slug="x" token="t" requireReauth={() => {}} onChanged={() => {}} />)
    expect(screen.getByText('Post del jueves')).toBeTruthy()
    expect(screen.getByText('Reel de lanzamiento')).toBeTruthy()
    expect(screen.queryByText('Sin fecha aún')).toBeNull()
    expect(screen.getByText(/todavía no tiene fecha/)).toBeTruthy()

    fireEvent.click(screen.getByText('Post del jueves'))
    expect(screen.getByTestId('piece-card').textContent).toBe('Post del jueves')
    fireEvent.click(screen.getByLabelText('Cerrar'))
    expect(screen.queryByTestId('piece-card')).toBeNull()
  })
})
