// Qué dice la fila de un acceso sobre de quién es el dato. El caso que importa
// es el acceso cargado ANTES de que esto existiera: no tiene autor y no se lo
// puede adivinar, así que la fila muestra sólo la parte que sabe.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const get = vi.fn()
vi.mock('../../api/client', () => ({
  default: {
    get:    (...a) => get(...a),
    post:   vi.fn(),
    patch:  vi.fn(),
    delete: vi.fn(),
  },
}))

import ProjectAccesos from '../../components/ProjectAccesos'

const ANA  = { id: 3, name: 'Ana',  avatar: '2bee.png' }
const JUAN = { id: 4, name: 'Juan', avatar: '2bee.png' }

// Hoy, y "un rato después" — wasEdited pide más de 1s de diferencia contra el alta.
const NOW   = new Date()
const LATER = new Date(NOW.getTime() + 60_000)

function access(over = {}) {
  return {
    id: 1, account: 'Instagram', username: 'cliente', extra: null,
    hasPassword: true, hasTwofa: false,
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    createdBy: ANA, updatedBy: null,
    ...over,
  }
}

function mount(rows) {
  get.mockResolvedValue({ data: rows })
  return render(<ProjectAccesos projectId="1" />)
}

beforeEach(() => {
  get.mockReset()
  // El historial está plegado al montar, así que no pide nada todavía.
})

describe('ProjectAccesos — de quién es la credencial', () => {
  it('sin editar, muestra sólo quién la cargó', async () => {
    mount([access()])
    expect(await screen.findByText('Cargado por Ana')).toBeInTheDocument()
  })

  it('editada por otra persona, muestra las dos', async () => {
    mount([access({ updatedAt: LATER.toISOString(), updatedBy: JUAN })])
    expect(await screen.findByText('Cargado por Ana · editado por Juan hoy')).toBeInTheDocument()
  })

  it('un acceso viejo sin autor: no inventa quién lo cargó', async () => {
    mount([access({ createdBy: null, updatedAt: LATER.toISOString(), updatedBy: null })])
    expect(await screen.findByText('Editado hoy')).toBeInTheDocument()
    expect(screen.queryByText(/Cargado por/)).not.toBeInTheDocument()
  })

  it('sin autor y sin editar, no hay línea de atribución', async () => {
    mount([access({ createdBy: null })])
    await screen.findByText('Instagram')
    expect(screen.queryByText(/Cargado por|Editado/)).not.toBeInTheDocument()
  })

  it('el historial no se pide hasta que se lo abre', async () => {
    mount([access()])
    await screen.findByText('Cargado por Ana')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(get.mock.calls.every(([url]) => !url.includes('/logs'))).toBe(true)
  })
})
