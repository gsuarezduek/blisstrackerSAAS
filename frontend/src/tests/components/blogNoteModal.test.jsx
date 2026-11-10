/**
 * Ficha SEO de una nota del blog (Marketing → GEO / SEO → Contenido SEO →
 * Inventario del blog). Se abre encima del inventario y edita sólo lo de SEO,
 * contra las rutas de Marketing — no las de Contenido, que ya no aceptan estos
 * datos.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BlogNoteModal from '../../components/marketing/BlogNoteModal'

vi.mock('../../api/client', () => ({ default: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() } }))

const state = vi.hoisted(() => ({ user: null, flag: true }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('../../hooks/useFeatureFlag', () => ({ useFeatureFlag: () => ({ enabled: state.flag, loading: false }) }))

import api from '../../api/client'

const note = (over = {}) => ({
  id: 10, title: 'Alquiler de autos en Mendoza', status: 'publicado', statusLabel: 'Publicado',
  language: 'es', publishedUrl: 'https://mdz.com/blog/a', publishedAt: null, scheduledDate: null,
  seoKeyword: 'alquiler de autos', seoKeywords: [], owner: null, translations: [],
  seo: null, trend: null, ...over,
})

function renderModal(props = {}) {
  return render(
    <MemoryRouter>
      <BlogNoteModal projectId={7} pieceId={10} canEdit onClose={vi.fn()} onChanged={vi.fn()} {...props} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  state.user = { id: 1, isAdmin: true, moduleAccess: { marketing: true, contenido: true } }
  state.flag = true
})

describe('BlogNoteModal', () => {
  test('carga la nota desde Marketing y edita contra Marketing', async () => {
    api.get.mockResolvedValue({ data: note() })
    api.patch.mockResolvedValue({ data: note({ language: 'en' }) })

    renderModal()
    expect(await screen.findByText('Alquiler de autos en Mendoza')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/marketing/projects/7/blog/notes/10')

    fireEvent.change(screen.getByDisplayValue('Español'), { target: { value: 'en' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/marketing/projects/7/blog/notes/10', { language: 'en' }))
  })

  test('avisa al cerrar que algo cambió, así el inventario se recarga', async () => {
    api.get.mockResolvedValue({ data: note() })
    api.patch.mockResolvedValue({ data: note({ language: 'pt' }) })
    const onChanged = vi.fn()
    const onClose = vi.fn()

    renderModal({ onChanged, onClose })
    await screen.findByText('Alquiler de autos en Mendoza')
    fireEvent.change(screen.getByDisplayValue('Español'), { target: { value: 'pt' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalled())

    fireEvent.click(screen.getByTitle('Cerrar'))
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('"Abrir en Contenido" sólo para quien tiene acceso a Contenido', async () => {
    api.get.mockResolvedValue({ data: note() })
    state.user = { id: 2, isAdmin: false, moduleAccess: { marketing: true, contenido: false } }

    renderModal()
    await screen.findByText('Alquiler de autos en Mendoza')
    expect(screen.queryByText('Abrir en Contenido')).not.toBeInTheDocument()
  })

  test('una pieza sin URL avisa que todavía no entra al inventario', async () => {
    api.get.mockResolvedValue({ data: note({ publishedUrl: null }) })

    renderModal()
    expect(await screen.findByText(/todavía no tiene URL publicada/)).toBeInTheDocument()
  })

  test('saltar a una traducción cambia la nota sin cerrar el modal', async () => {
    api.get
      .mockResolvedValueOnce({ data: note({ translations: [{ id: 11, title: 'Car rental in Mendoza', language: 'en', publishedUrl: null, status: 'publicado' }] }) })
      .mockResolvedValueOnce({ data: note({ id: 11, title: 'Car rental in Mendoza', language: 'en' }) })
    const onClose = vi.fn()

    renderModal({ onClose })
    fireEvent.click(await screen.findByText(/EN · Car rental in Mendoza/))
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/marketing/projects/7/blog/notes/11'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
