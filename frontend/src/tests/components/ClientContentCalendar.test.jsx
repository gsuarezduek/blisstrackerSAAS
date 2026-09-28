import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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
  it('muestra las piezas en su día, avisa de las sin fecha y avisa al padre al tocar una', () => {
    const onOpen = vi.fn()
    render(<ClientContentCalendar pieces={pieces} onOpen={onOpen} />)
    expect(screen.getByText('Post del jueves')).toBeTruthy()
    expect(screen.getByText('Reel de lanzamiento')).toBeTruthy()
    expect(screen.queryByText('Sin fecha aún')).toBeNull()
    expect(screen.getByText(/todavía no tiene fecha/)).toBeTruthy()

    // El tooltip usa el estado en lenguaje del cliente, no el interno ("Idea").
    expect(screen.getByTitle('Reel de lanzamiento — En preparación')).toBeTruthy()

    fireEvent.click(screen.getByText('Post del jueves'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })
})
