import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import DomainRatingCard from '../../components/marketing/seo/DomainRatingCard'

vi.mock('../../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))

import api from '../../api/client'

// Mismo patrón que Web → Performance: pastillas, la más nueva con aro.
describe('DomainRatingCard', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({
      data: {
        domainRating: 8,
        domainRatingAt: '2026-11-08T12:00:00.000Z',
        hasUrl: true,
        configured: true,
        history: [
          { id: 2, domainRating: 8, createdAt: '2026-11-08T12:00:00.000Z' },
          { id: 1, domainRating: 7, createdAt: '2026-10-01T12:00:00.000Z' },
        ],
      },
    })
  })

  it('muestra el DR actual y el historial, con la lectura más nueva marcada', async () => {
    const { container } = render(<DomainRatingCard projectId={4} />)
    expect(await screen.findByText('Historial:')).toBeInTheDocument()
    const latest = screen.getAllByText('8').map(el => el.closest('span.rounded-full')).find(Boolean)
    const older = screen.getByText('7').closest('span.rounded-full')
    expect(latest.className).toMatch(/ring-2/)
    expect(older.className).toMatch(/opacity-60/)
    expect(container.textContent).toMatch(/Domain Rating/)
  })
})
