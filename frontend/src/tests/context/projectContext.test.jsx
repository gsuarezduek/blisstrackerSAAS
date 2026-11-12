import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// El proyecto fijado viaja entre secciones. Lo que se testea acá es justamente lo que
// evita el bug que esta feature podría causar: ver Marketing filtrado por un proyecto
// elegido hace días sin darse cuenta.

const SLUG = 'bliss'
let currentSlug = SLUG

vi.mock('../../context/WorkspaceContext', () => ({
  useWorkspace: () => ({ slug: currentSlug }),
}))

async function load() {
  const mod = await import('../../context/ProjectContext')
  return mod
}

function setup(mod) {
  const { ProjectProvider, useActiveProject } = mod
  return renderHook(() => useActiveProject(), { wrapper: ProjectProvider })
}

const project = (over = {}) => ({ id: 7, name: 'Acme', marketingEnabled: true, contenidoEnabled: true, ...over })

// happy-dom no da un localStorage con la API completa, y acá hace falta comprobar que
// el contexto NUNCA le escribe: un doble con spies alcanza y es más explícito.
const localStorageSpy = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() }

beforeEach(() => {
  vi.resetModules()
  currentSlug = SLUG
  sessionStorage.clear()
  localStorageSpy.setItem.mockClear()
  vi.stubGlobal('localStorage', localStorageSpy)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('ProjectContext — fijar y soltar', () => {
  it('arranca sin nada fijado', async () => {
    const { result } = setup(await load())
    expect(result.current.activeProject).toBeNull()
  })

  it('fija un proyecto y lo suelta', async () => {
    const { result } = setup(await load())

    act(() => result.current.setActiveProject(project()))
    expect(result.current.activeProject).toMatchObject({ id: 7, name: 'Acme' })

    act(() => result.current.clearActiveProject())
    expect(result.current.activeProject).toBeNull()
  })

  it('guarda solo lo necesario para decidir si aplica a una sección', async () => {
    const { result } = setup(await load())
    act(() => result.current.setActiveProject(project({
      // Campos que GET /projects trae y que acá no tienen por qué viajar.
      connections: '{}', members: [{ user: { id: 1 } }], websiteUrl: 'https://acme.com',
    })))

    expect(Object.keys(result.current.activeProject).sort())
      .toEqual(['contenidoEnabled', 'id', 'marketingEnabled', 'name'])
  })

  it('un módulo apagado en el proyecto se conserva como false, para que la sección no lo adopte', async () => {
    const { result } = setup(await load())
    act(() => result.current.setActiveProject(project({ marketingEnabled: false })))

    expect(result.current.activeProject.marketingEnabled).toBe(false)
    expect(result.current.activeProject.contenidoEnabled).toBe(true)
  })

  it('un campo ausente cuenta como prendido (el default del modelo es true)', async () => {
    const { result } = setup(await load())
    act(() => result.current.setActiveProject({ id: 9, name: 'Sin flags' }))

    expect(result.current.activeProject.marketingEnabled).toBe(true)
    expect(result.current.activeProject.contenidoEnabled).toBe(true)
  })

  it('ignora algo que no es un proyecto', async () => {
    const { result } = setup(await load())
    act(() => result.current.setActiveProject(null))
    act(() => result.current.setActiveProject({ name: 'sin id' }))
    expect(result.current.activeProject).toBeNull()
  })
})

describe('ProjectContext — persistencia', () => {
  it('sobrevive a recargar la misma pestaña', async () => {
    const mod = await load()
    const first = setup(mod)
    act(() => first.result.current.setActiveProject(project()))
    first.unmount()

    // Misma pestaña = mismo sessionStorage: un provider nuevo lo encuentra.
    const second = setup(mod)
    expect(second.result.current.activeProject).toMatchObject({ id: 7 })
  })

  it('vive en sessionStorage, no en localStorage: una pestaña nueva arranca limpia', async () => {
    const { result } = setup(await load())
    act(() => result.current.setActiveProject(project()))

    expect(sessionStorage.getItem(`bliss_active_project_${SLUG}`)).toBeTruthy()
    // Esto es la defensa contra "volví el lunes y Marketing estaba filtrado".
    expect(localStorageSpy.setItem).not.toHaveBeenCalled()
  })

  it('se olvida después de 8 horas, para la pestaña que queda abierta días', async () => {
    const mod = await load()
    const first = setup(mod)
    act(() => first.result.current.setActiveProject(project()))
    first.unmount()

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 9 * 60 * 60 * 1000)

    const second = setup(mod)
    expect(second.result.current.activeProject).toBeNull()
  })

  it('cada workspace tiene su propio proyecto fijado', async () => {
    const mod = await load()
    const first = setup(mod)
    act(() => first.result.current.setActiveProject(project()))
    first.unmount()

    currentSlug = 'otro'
    const second = setup(mod)
    expect(second.result.current.activeProject).toBeNull()
  })

  it('un valor corrupto en storage no rompe nada', async () => {
    sessionStorage.setItem(`bliss_active_project_${SLUG}`, 'no es json')
    const { result } = setup(await load())
    expect(result.current.activeProject).toBeNull()
  })

  it('clearAllActiveProjects borra el de todos los workspaces (logout)', async () => {
    const mod = await load()
    const first = setup(mod)
    act(() => first.result.current.setActiveProject(project()))
    first.unmount()

    currentSlug = 'otro'
    const second = setup(mod)
    act(() => second.result.current.setActiveProject(project({ id: 8, name: 'Otro' })))
    second.unmount()

    mod.clearAllActiveProjects()

    expect(sessionStorage.getItem(`bliss_active_project_${SLUG}`)).toBeNull()
    expect(sessionStorage.getItem('bliss_active_project_otro')).toBeNull()
  })
})
