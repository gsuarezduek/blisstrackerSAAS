import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ChannelSwitcher from '../../components/chat/ChannelSwitcher'

// localStorage propio en vez del de happy-dom: así el test controla qué hay guardado al
// montar y puede hacerlo fallar a propósito (Safari en modo privado tira al leerlo, que
// es el caso que `readView` tiene que sobrevivir). Mismo patrón que projectFilesViewMode.
function fakeStorage(overrides = {}) {
  const map = new Map()
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    ...overrides,
  }
}

const VIEW_KEY = 'bliss_chat_channel_view'

const ch = (id, name, { kind = 'project', lastReadAt = null, lastAt = null, unread = 0, mentions = 0 } = {}) => ({
  id, name, kind, slug: name.toLowerCase(), medium: 'text', projectId: kind === 'project' ? id : null,
  isPrivate: false, starred: false, lastReadAt,
  lastMessage: lastAt ? { id, content: 'hola', createdAt: lastAt } : null,
  unreadCount: unread, mentionCount: mentions,
})

// Zeta es el último canal del alfabeto y el que usé hace un rato; general es el que la
// vista agrupada clava arriba. En "Últimos" ninguna de las dos cosas debería importar.
const channels = [
  ch(1, 'general',  { kind: 'general', lastReadAt: '2026-11-20T10:00:00Z', lastAt: '2026-11-20T09:00:00Z' }),
  ch(2, 'Zeta',     { lastReadAt: '2026-11-25T10:00:00Z', lastAt: '2026-11-25T09:00:00Z' }),
  ch(3, 'Alfa',     { lastReadAt: '2026-11-01T10:00:00Z', lastAt: '2026-11-02T09:00:00Z' }),
  ch(4, 'Nuevo',    { lastAt: '2026-11-24T09:00:00Z' }),  // nunca lo abrí
  ch(5, 'Viejo',    { lastAt: '2026-10-01T09:00:00Z' }),  // nunca lo abrí, y está muerto
]

const names = channels.map(c => c.name)
// Cada fila de canal es un <button> cuyo texto arranca con el '#' (o el candado) del ícono.
const shownOrder = () => screen.getAllByRole('button')
  .map(b => b.textContent.trim().replace(/^#/, ''))
  .filter(t => names.includes(t))

function renderSwitcher(props = {}) {
  return render(<ChannelSwitcher channels={channels} activeChannelId={null} onSelect={() => {}} {...props} />)
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage())
})

// ─── "Últimos": lista plana por recencia de uso propio
describe('vista "Últimos"', () => {
  it('ordena por mi última participación y manda al fondo los que nunca abrí', () => {
    renderSwitcher()
    fireEvent.click(screen.getByText('Últimos'))

    expect(shownOrder()).toEqual(['Zeta', 'general', 'Alfa', 'Nuevo', 'Viejo'])
  })

  it('aplana los grupos: ni general queda clavado arriba ni hay encabezados', () => {
    renderSwitcher()
    expect(shownOrder()[0]).toBe('general')      // vista agrupada: general primero, fijo
    expect(screen.getByText('Proyectos')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Últimos'))

    expect(shownOrder()[0]).toBe('Zeta')
    expect(screen.queryByText('Proyectos')).toBeNull()
    expect(screen.queryByText('Canales')).toBeNull()
  })

  it('sigue ordenando por recencia mientras se busca, y ahí el filtro de no leídos queda sin efecto', () => {
    renderSwitcher()
    fireEvent.click(screen.getByText('Últimos'))
    fireEvent.change(screen.getByPlaceholderText(/Buscar proyecto o canal/), { target: { value: 'e' } })

    // general, Zeta, Nuevo y Viejo matchean "e"; Alfa no.
    expect(shownOrder()).toEqual(['Zeta', 'general', 'Nuevo', 'Viejo'])
    expect(screen.getByText('No leídos').className).toMatch(/pointer-events-none/)
    expect(screen.getByText('Últimos').className).not.toMatch(/pointer-events-none/)
  })
})

// ─── La vista elegida sobrevive a salir y volver
describe('persistencia de la vista', () => {
  it('guarda la elección y la recupera al volver a montar', () => {
    const { unmount } = renderSwitcher()
    fireEvent.click(screen.getByText('Últimos'))
    expect(localStorage.getItem(VIEW_KEY)).toBe('recent')
    unmount()

    renderSwitcher()
    expect(shownOrder()[0]).toBe('Zeta')   // arrancó en "Últimos", sin tocar nada
  })

  it('con "No leídos" recordado y nada sin leer, ofrece la salida a la lista completa', () => {
    localStorage.setItem(VIEW_KEY, 'unread')
    renderSwitcher()

    expect(shownOrder()).toEqual([])
    expect(screen.getByText('No tenés canales sin leer')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Ver todos'))
    expect(shownOrder()).toHaveLength(channels.length)
    expect(localStorage.getItem(VIEW_KEY)).toBe('all')
  })

  it('si el navegador no deja leer el storage, arranca en "Todos" sin romper', () => {
    vi.stubGlobal('localStorage', fakeStorage({ getItem: () => { throw new Error('private mode') } }))
    renderSwitcher()

    expect(shownOrder()[0]).toBe('general')
  })
})
