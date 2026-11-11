import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import axios from 'axios'
import { handoffUrl } from '../../utils/authHandoff'

vi.mock('axios')

function setHost(hostname, port = '') {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, hostname, port },
    writable: true,
  })
}

const original = window.location

beforeEach(() => {
  vi.stubEnv('VITE_APP_DOMAIN', 'blisstracker.app')
  axios.post.mockResolvedValue({ data: { code: 'abc' } })
})
afterEach(() => {
  vi.unstubAllEnvs()
  Object.defineProperty(window, 'location', { value: original, writable: true })
})

describe('handoffUrl', () => {
  it('desde el login central va a producción por default', async () => {
    setHost('blisstracker.app')
    expect(await handoffUrl('bliss', 't')).toBe('https://bliss.blisstracker.app/auth?code=abc')
  })

  it('desde el login central con preview vuelve a la dirección de prueba', async () => {
    setHost('blisstracker.app')
    expect(await handoffUrl('bliss', 't', { preview: true }))
      .toBe('https://bliss--preview.blisstracker.app/auth?code=abc')
  })

  it('cambiar de workspace desde la dirección de prueba se queda en prueba', async () => {
    setHost('bliss--preview.blisstracker.app')
    expect(await handoffUrl('norte', 't')).toBe('https://norte--preview.blisstracker.app/auth?code=abc')
  })

  it('en local arma <slug>--preview.localhost', async () => {
    setHost('localhost', '5173')
    expect(await handoffUrl('bliss', 't', { preview: true }))
      .toBe('http://bliss--preview.localhost:5173/auth?code=abc&ws=bliss')
  })
})
