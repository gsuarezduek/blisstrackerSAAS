import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ProjectFiles from '../../components/ProjectFiles'
import api from '../../api/client'

const { handleFiles } = vi.hoisted(() => ({ handleFiles: vi.fn() }))

vi.mock('../../api/client', () => ({ default: { get: vi.fn(), patch: vi.fn() } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { isAdmin: false } }) }))
vi.mock('../../components/projectFilesUpload', () => ({
  useProjectFileUpload: () => ({ queue: [], handleFiles, cancel: vi.fn() }),
  fmtMb: () => '500 MB',
  MAX_FILE_BYTES: 500,
}))

const folder = (id, name) => ({ id, name, type: 'folder', createdAt: '2026-11-01T00:00:00Z' })
const file = (id, name) => ({ id, name, type: 'file', mimeType: 'text/plain', sizeBytes: 10, createdAt: '2026-11-01T00:00:00Z' })

function dataTransfer(files = []) {
  return { setData: vi.fn(), effectAllowed: '', dropEffect: '', files }
}

// El div draggable que envuelve a la tarjeta (el nombre vive dentro del área clickeable).
const card = name => screen.getByText(name).closest('[draggable]')

function drag(source, target) {
  const dt = dataTransfer()
  fireEvent.dragStart(source, { dataTransfer: dt })
  fireEvent.dragOver(target, { dataTransfer: dt })
  fireEvent.drop(target, { dataTransfer: dt })
}

async function renderFiles({ folders = [], files = [], path = [] } = {}) {
  api.get.mockResolvedValue({ data: { folders, files, path } })
  render(<MemoryRouter><ProjectFiles projectId={1} /></MemoryRouter>)
  await screen.findByText((folders[0] || files[0]).name)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: {} })
})

describe('Nube: arrastrar para mover', () => {
  it('soltar un archivo sobre una carpeta lo mueve ahí y lo saca de la grilla', async () => {
    await renderFiles({ folders: [folder(10, 'Fotos')], files: [file(1, 'a.txt')] })

    drag(card('a.txt'), card('Fotos'))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/projects/1/files/1', { parentId: 10 }))
    await waitFor(() => expect(screen.queryByText('a.txt')).toBeNull())
    expect(handleFiles).not.toHaveBeenCalled()
  })

  it('arrastrar un elemento seleccionado se lleva toda la selección', async () => {
    await renderFiles({ folders: [folder(10, 'Fotos')], files: [file(1, 'a.txt'), file(2, 'b.txt'), file(3, 'c.txt')] })
    fireEvent.click(card('a.txt').querySelector('button[title="Seleccionar"]'))
    fireEvent.click(card('b.txt').querySelector('button[title="Seleccionar"]'))

    drag(card('a.txt'), card('Fotos'))

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2))
    expect(api.patch).toHaveBeenCalledWith('/projects/1/files/1', { parentId: 10 })
    expect(api.patch).toHaveBeenCalledWith('/projects/1/files/2', { parentId: 10 })
    await waitFor(() => expect(screen.queryByText('b.txt')).toBeNull())
    expect(screen.getByText('c.txt')).toBeTruthy()
  })

  it('arrastrar uno que no está seleccionado no arrastra la selección', async () => {
    await renderFiles({ folders: [folder(10, 'Fotos')], files: [file(1, 'a.txt'), file(2, 'b.txt')] })
    fireEvent.click(card('a.txt').querySelector('button[title="Seleccionar"]'))

    drag(card('b.txt'), card('Fotos'))

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1))
    expect(api.patch).toHaveBeenCalledWith('/projects/1/files/2', { parentId: 10 })
  })

  it('soltar sobre la carpeta en la que ya está no hace nada', async () => {
    await renderFiles({ files: [file(1, 'a.txt')] })

    drag(card('a.txt'), screen.getByRole('button', { name: 'Raíz' }))

    expect(api.patch).not.toHaveBeenCalled()
  })

  it('soltar sobre un ancestro de la ruta lo mueve a ese ancestro', async () => {
    api.get.mockResolvedValue({ data: { folders: [folder(20, 'Sub')], files: [file(1, 'a.txt')], path: [] } })
    render(<MemoryRouter><ProjectFiles projectId={1} /></MemoryRouter>)
    await screen.findByText('Sub')
    api.get.mockResolvedValue({ data: { folders: [], files: [file(1, 'a.txt')], path: [{ id: 10, name: 'Padre' }, { id: 20, name: 'Sub' }] } })
    fireEvent.click(screen.getByText('Sub'))
    await screen.findByRole('button', { name: 'Padre' })

    drag(card('a.txt'), screen.getByRole('button', { name: 'Padre' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/projects/1/files/1', { parentId: 10 }))
    await waitFor(() => expect(screen.queryByText('a.txt')).toBeNull())
  })

  it('la raíz como destino manda parentId null', async () => {
    api.get.mockResolvedValue({ data: { folders: [folder(20, 'Sub')], files: [], path: [] } })
    render(<MemoryRouter><ProjectFiles projectId={1} /></MemoryRouter>)
    await screen.findByText('Sub')
    api.get.mockResolvedValue({ data: { folders: [], files: [file(1, 'a.txt')], path: [{ id: 20, name: 'Sub' }] } })
    fireEvent.click(screen.getByText('Sub'))
    await screen.findByText('a.txt')

    drag(card('a.txt'), screen.getByRole('button', { name: 'Raíz' }))

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/projects/1/files/1', { parentId: null }))
  })

  it('una carpeta no se puede soltar sobre sí misma', async () => {
    await renderFiles({ folders: [folder(10, 'Fotos')] })

    drag(card('Fotos'), card('Fotos'))

    expect(api.patch).not.toHaveBeenCalled()
  })

  it('una carpeta seleccionada no recibe el resto de la selección', async () => {
    await renderFiles({ folders: [folder(10, 'Fotos')], files: [file(1, 'a.txt')] })
    fireEvent.click(card('Fotos').querySelector('button[title="Seleccionar"]'))
    fireEvent.click(card('a.txt').querySelector('button[title="Seleccionar"]'))

    drag(card('a.txt'), card('Fotos'))

    expect(api.patch).not.toHaveBeenCalled()
  })

  it('si el backend rechaza, el elemento sigue en la grilla y se muestra el error', async () => {
    await renderFiles({ folders: [folder(10, 'Fotos')], files: [file(1, 'a.txt')] })
    api.patch.mockRejectedValue(new Error('boom'))

    drag(card('a.txt'), card('Fotos'))

    await screen.findByText('No se pudo mover')
    expect(screen.getByText('a.txt')).toBeTruthy()
  })

  it('si falla solo una parte, se saca lo que se movió y queda lo que falló', async () => {
    await renderFiles({ folders: [folder(10, 'Fotos')], files: [file(1, 'a.txt'), file(2, 'b.txt')] })
    fireEvent.click(card('a.txt').querySelector('button[title="Seleccionar"]'))
    fireEvent.click(card('b.txt').querySelector('button[title="Seleccionar"]'))
    api.patch.mockImplementation(url => url.endsWith('/2') ? Promise.reject(new Error('boom')) : Promise.resolve({ data: {} }))

    drag(card('a.txt'), card('Fotos'))

    await screen.findByText('1 de 2 no se pudieron mover')
    expect(screen.queryByText('a.txt')).toBeNull()
    expect(screen.getByText('b.txt')).toBeTruthy()
  })

  it('soltar un elemento de la grilla fuera de una carpeta no lo sube como archivo', async () => {
    await renderFiles({ files: [file(1, 'a.txt')] })
    const dt = dataTransfer([new File(['x'], 'a.txt')])

    fireEvent.dragStart(card('a.txt'), { dataTransfer: dt })
    fireEvent.drop(screen.getByText(/Para mover algo/), { dataTransfer: dt })

    expect(handleFiles).not.toHaveBeenCalled()
    expect(api.patch).not.toHaveBeenCalled()
  })

  it('un archivo del sistema soltado sobre una carpeta sigue subiendo a la carpeta actual', async () => {
    await renderFiles({ folders: [folder(10, 'Fotos')] })
    const files = [new File(['x'], 'nuevo.txt')]

    fireEvent.drop(card('Fotos'), { dataTransfer: dataTransfer(files) })

    expect(handleFiles).toHaveBeenCalledWith(files, null)
    expect(api.patch).not.toHaveBeenCalled()
  })
})
