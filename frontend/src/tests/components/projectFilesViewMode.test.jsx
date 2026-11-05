import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ProjectFiles from '../../components/ProjectFiles'
import { itemMenuActions, nextSortForColumn, sortDirFor, loadViewMode } from '../../components/projectFiles/projectFilesHelpers'
import api from '../../api/client'

vi.mock('../../api/client', () => ({ default: { get: vi.fn(), patch: vi.fn() } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { isAdmin: false } }) }))
vi.mock('../../components/projectFilesUpload', () => ({
  useProjectFileUpload: () => ({ queue: [], handleFiles: vi.fn(), cancel: vi.fn() }),
  fmtMb: () => '500 MB',
  MAX_FILE_BYTES: 500,
}))

const pdf = {
  id: 7, name: 'Propuesta.pdf', type: 'file', mimeType: 'application/pdf',
  sizeBytes: 2 * 1024 * 1024, createdAt: '2026-03-12T10:00:00Z',
  uploadedBy: { id: 3, name: 'Ana Pérez' }, previewable: true,
  posterUrl: 'https://r2.example/thumbs/abc.jpg',
}
const folder = { id: 1, name: 'Marca', type: 'folder', createdAt: '2026-01-05T10:00:00Z' }

async function renderFiles({ folders = [], files = [] } = {}) {
  api.get.mockResolvedValue({ data: { folders, files, path: [] } })
  const result = render(<MemoryRouter><ProjectFiles projectId={1} /></MemoryRouter>)
  await screen.findByText((folders[0] || files[0]).name)
  return result
}

const switchTo = mode => fireEvent.click(screen.getByLabelText(mode === 'list' ? 'Ver como lista' : 'Ver como miniaturas'))

// localStorage propio en vez del de happy-dom: así el test controla qué hay
// guardado y puede hacerlo fallar a propósito (Safari en modo privado tira al
// leerlo, que es el caso que loadViewMode tiene que sobrevivir).
function fakeStorage(overrides = {}) {
  const map = new Map()
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', fakeStorage())
})

// ─── La vista de lista muestra la info que la tarjeta no tenía lugar de mostrar
describe('vista de lista', () => {
  it('pone en columnas quién subió el archivo, cuándo y cuánto pesa', async () => {
    await renderFiles({ files: [pdf] })
    switchTo('list')

    expect(screen.getByText('Subido por')).toBeInTheDocument()
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('2.0 MB')).toBeInTheDocument()
    expect(screen.getByText('12 mar')).toBeInTheDocument()
  })

  it('recuerda el modo elegido para la próxima visita', async () => {
    await renderFiles({ files: [pdf] })
    switchTo('list')
    expect(loadViewMode()).toBe('list')

    switchTo('grid')
    expect(loadViewMode()).toBe('grid')
  })

  it('arranca en la vista que quedó guardada', async () => {
    localStorage.setItem('bliss_files_view', 'list')
    await renderFiles({ files: [pdf] })
    // El encabezado de columna solo existe en la lista.
    expect(screen.getByText('Subido por')).toBeInTheDocument()
  })

  it('cae a la grilla si el navegador bloquea localStorage', () => {
    vi.stubGlobal('localStorage', fakeStorage({ getItem: () => { throw new Error('denied') } }))
    expect(loadViewMode()).toBe('grid')
  })

  it('clickear el encabezado de una columna la ordena y alterna el sentido', async () => {
    await renderFiles({ files: [pdf], folders: [folder] })
    switchTo('list')

    // El orden arranca en 'name-asc', así que el primer click sobre Nombre ya
    // invierte: clickear la columna activa es "dar vuelta esta columna".
    const nameHeader = screen.getByRole('button', { name: /Nombre/ })
    fireEvent.click(nameHeader)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('name-desc'))
    fireEvent.click(nameHeader)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('name-asc'))

    // Una columna distinta arranca por su sentido útil, sin heredar el anterior.
    fireEvent.click(screen.getByRole('button', { name: /Tamaño/ }))
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('size-desc'))
  })

  // La miniatura va con alt="" (es decoración: el nombre del archivo está al
  // lado), así que su rol accesible es 'presentation' y no 'img'.
  it('la miniatura del PDF se usa en las dos vistas (es el mismo posterUrl)', async () => {
    const { container } = await renderFiles({ files: [pdf] })

    expect(container.querySelector('img')).toHaveAttribute('src', pdf.posterUrl)
    // En la grilla, además, el rótulo que lo distingue de una imagen suelta.
    expect(screen.getByText('PDF')).toBeInTheDocument()

    switchTo('list')
    expect(container.querySelector('img')).toHaveAttribute('src', pdf.posterUrl)
    // En la fila el rótulo se omite: a 32px no se leería, y la extensión del
    // nombre está al lado.
    expect(screen.queryByText('PDF')).not.toBeInTheDocument()
  })
})

// ─── Orden por columna ───────────────────────────────────────────────────────
describe('nextSortForColumn / sortDirFor', () => {
  it('el primer click en Nombre ordena A-Z y en Fecha/Tamaño de mayor a menor', () => {
    expect(nextSortForColumn('name', 'size-desc')).toBe('name-asc')
    expect(nextSortForColumn('date', 'name-asc')).toBe('date-desc')
    expect(nextSortForColumn('size', 'name-asc')).toBe('size-desc')
  })

  it('vuelve a clickear la columna activa invierte el sentido', () => {
    expect(nextSortForColumn('name', 'name-asc')).toBe('name-desc')
    expect(nextSortForColumn('name', 'name-desc')).toBe('name-asc')
    expect(nextSortForColumn('date', 'date-desc')).toBe('date-asc')
  })

  it('Tamaño no tiene sentido ascendente (nadie busca el archivo más chico)', () => {
    expect(nextSortForColumn('size', 'size-desc')).toBe('size-desc')
  })

  it('la flecha solo se pinta en la columna que está ordenando', () => {
    expect(sortDirFor('name', 'name-desc')).toBe('desc')
    expect(sortDirFor('date', 'name-desc')).toBeNull()
    expect(sortDirFor('size', 'size-desc')).toBe('desc')
  })
})

// ─── Las dos vistas ofrecen las mismas acciones ──────────────────────────────
describe('itemMenuActions', () => {
  const all = { onOpen: vi.fn(), onRename: vi.fn(), onMove: vi.fn(), onDelete: vi.fn(), onDownload: vi.fn(), onCopyLink: vi.fn(), onShare: vi.fn(), onCreateTask: vi.fn(), onLinkToContent: vi.fn() }
  const labels = (item, h = all) => itemMenuActions(item, h).map(a => a.label)

  it('una carpeta no se descarga ni se vincula a una pieza de Contenido', () => {
    expect(labels(folder)).toEqual(['Renombrar', 'Mover', 'Compartir', 'Eliminar'])
  })

  it('un PDF ofrece "Ver": el click en el ítem no alcanza como en una imagen', () => {
    expect(labels(pdf)).toContain('Ver')
    expect(labels({ ...pdf, mimeType: 'image/png' })).not.toContain('Ver')
  })

  it('un handler en null saca su acción (módulo apagado, o donde no aplica)', () => {
    expect(labels(pdf, { ...all, onLinkToContent: null, onCreateTask: null }))
      .not.toContain('Contenido')
    expect(labels(pdf, { ...all, onShare: null })).not.toContain('Compartir')
  })

  it('un ítem ya compartido lo dice en lugar de ofrecer compartirlo', () => {
    expect(labels({ ...pdf, isPublic: true })).toContain('Compartido')
  })

  it('Eliminar va último y marcado como destructivo', () => {
    const actions = itemMenuActions(pdf, all)
    expect(actions.at(-1)).toMatchObject({ label: 'Eliminar', danger: true })
  })
})
