import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { clearOAuthResult, waitForOAuthResult, writeOAuthResult } from '../../lib/oauthResultBridge'

// Un handle de popup. `closed` se controla a mano porque es justo lo que miente
// cuando Cross-Origin-Opener-Policy corta la relación con el opener.
function fakePopup(closed = false) { return { closed } }

// happy-dom no da un localStorage con la API completa (mismo caso que
// tests/context/projectContext.test.jsx), así que acá va uno en memoria.
function memoryStorage() {
  const map = new Map()
  return {
    getItem:    k => (map.has(k) ? map.get(k) : null),
    setItem:    (k, v) => { map.set(k, String(v)) },
    removeItem: k => { map.delete(k) },
  }
}

describe('puente del popup de OAuth', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('localStorage', memoryStorage()) })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('el resultado llega por el evento storage, sin esperar el polling', async () => {
    const popup = fakePopup()
    const { promise } = waitForOAuthResult({ popup })

    writeOAuthResult({ success: true, integrationType: 'google_youtube' })
    window.dispatchEvent(new StorageEvent('storage', { key: '__ga_oauth_result', newValue: 'x' }))

    await expect(promise).resolves.toEqual({
      status: 'result',
      result: expect.objectContaining({ success: true, integrationType: 'google_youtube' }),
    })
  })

  it('consume el resultado: no queda en localStorage para el próximo intento', async () => {
    writeOAuthResult({ success: true, integrationType: 'tiktok' })
    const { promise } = waitForOAuthResult({ popup: fakePopup() })
    await promise
    expect(localStorage.getItem('__ga_oauth_result')).toBeNull()
  })

  it('un `closed` inmediato es COOP, no un cierre: se sigue esperando y el resultado llega', async () => {
    // Esto es la regresión: antes `closed` cortaba la espera a los 600ms de abrir
    // el popup — el backend guardaba la conexión y la pantalla no se enteraba.
    const popup = fakePopup(true)
    const { promise } = waitForOAuthResult({ popup })

    await vi.advanceTimersByTimeAsync(5000)   // bastante más que la gracia de 3s

    writeOAuthResult({ success: true, integrationType: 'google_youtube' })
    await vi.advanceTimersByTimeAsync(600)

    await expect(promise).resolves.toMatchObject({ status: 'result' })
  })

  it('cerrado de verdad más tarde: se abandona la espera', async () => {
    const popup = fakePopup()
    const { promise } = waitForOAuthResult({ popup })

    await vi.advanceTimersByTimeAsync(10_000)
    popup.closed = true
    await vi.advanceTimersByTimeAsync(3000)   // el cierre + la ventana de margen

    await expect(promise).resolves.toEqual({ status: 'closed' })
  })

  it('un resultado que alcanza a llegar le gana al cierre', async () => {
    const popup = fakePopup()
    const { promise } = waitForOAuthResult({ popup })

    await vi.advanceTimersByTimeAsync(10_000)
    popup.closed = true
    writeOAuthResult({ success: true, integrationType: 'instagram' })
    await vi.advanceTimersByTimeAsync(600)

    await expect(promise).resolves.toMatchObject({ status: 'result' })
  })

  it('un resultado viejo de otro intento se descarta', async () => {
    localStorage.setItem('__ga_oauth_result', JSON.stringify({
      success: true, integrationType: 'google_youtube', ts: Date.now() - 5 * 60 * 1000,
    }))
    const { promise } = waitForOAuthResult({ popup: fakePopup(), timeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(1200)
    await expect(promise).resolves.toEqual({ status: 'timeout' })
  })

  it('sin resultado ni cierre detectable, termina por timeout', async () => {
    const { promise } = waitForOAuthResult({ popup: fakePopup(), timeoutMs: 2000 })
    await vi.advanceTimersByTimeAsync(2400)
    await expect(promise).resolves.toEqual({ status: 'timeout' })
  })

  it('cancel() corta la espera sin tocar nada más', async () => {
    const { promise, cancel } = waitForOAuthResult({ popup: fakePopup() })
    cancel()
    await expect(promise).resolves.toEqual({ status: 'cancelled' })
  })

  it('clearOAuthResult borra lo que haya quedado', () => {
    writeOAuthResult({ success: false, error: 'nope' })
    clearOAuthResult()
    expect(localStorage.getItem('__ga_oauth_result')).toBeNull()
  })
})
