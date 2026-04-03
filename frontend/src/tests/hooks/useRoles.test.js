import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Reseteamos los módulos antes de cada test para limpiar el cache de nivel módulo
beforeEach(() => vi.resetModules())

async function setup(apiResponse = []) {
  vi.doMock('../../api/client', () => ({
    default: {
      get: vi.fn().mockResolvedValue({ data: apiResponse }),
    },
  }))
  const { default: useRoles } = await import('../../hooks/useRoles')
  return useRoles
}

describe('useRoles', () => {
  it('inicia con roles vacío', async () => {
    const useRoles = await setup([])
    const { result } = renderHook(() => useRoles())
    expect(result.current.roles).toEqual([])
  })

  it('carga los roles desde la API', async () => {
    const roles = [
      { name: 'ADMIN',    label: 'Administrador' },
      { name: 'DESIGNER', label: 'Diseñador' },
    ]
    const useRoles = await setup(roles)
    const { result } = renderHook(() => useRoles())

    await waitFor(() => expect(result.current.roles).toHaveLength(2))
    expect(result.current.roles[0].name).toBe('ADMIN')
  })

  it('labelFor() devuelve el label correcto', async () => {
    const roles = [{ name: 'ADMIN', label: 'Administrador' }]
    const useRoles = await setup(roles)
    const { result } = renderHook(() => useRoles())

    await waitFor(() => expect(result.current.roles).toHaveLength(1))
    expect(result.current.labelFor('ADMIN')).toBe('Administrador')
  })

  it('labelFor() devuelve el nombre como fallback para roles desconocidos', async () => {
    const useRoles = await setup([{ name: 'ADMIN', label: 'Administrador' }])
    const { result } = renderHook(() => useRoles())

    await waitFor(() => expect(result.current.roles).toHaveLength(1))
    expect(result.current.labelFor('ROL_DESCONOCIDO')).toBe('ROL_DESCONOCIDO')
  })
})
