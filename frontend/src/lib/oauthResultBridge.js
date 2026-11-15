/**
 * Puente entre el popup de OAuth y la pantalla que lo abrió.
 *
 * La página /oauth-result (OAuthResult.jsx) escribe el resultado en localStorage
 * y cierra el popup; acá se espera ese resultado. Antes cada flujo tenía su copia
 * de esta espera (useOAuthPopup, useGoogleIntegration, useGoogleCalendarConnection
 * y una copia pegada dentro de WebAnalyticsTab) y las copias divergieron: sólo una
 * miraba `popup.closed` — y es justo la que se rompía.
 *
 * Dos cosas que importan:
 *
 * 1. **El resultado llega por el evento `storage`, no por polling.** El evento se
 *    dispara en esta ventana en cuanto el popup (mismo origen) escribe, así la
 *    conexión aparece sola. El polling queda como red de seguridad: el popup puede
 *    haber escrito antes de que engancháramos el listener.
 *
 * 2. **`popup.closed` miente.** La pantalla de autorización de Google lleva
 *    Cross-Origin-Opener-Policy, que corta la relación opener↔popup (el mismo
 *    motivo por el que OAuthPopup.jsx no usa `window.opener`). Con el handle
 *    repudiado `closed` pasa a dar `true` con la ventana abierta y a la vista, así
 *    que mirarlo abandonaba la espera a los ~600ms de abrir el popup: el backend
 *    guardaba la conexión y la pantalla no se enteraba nunca — había que recargar
 *    a mano. Si `closed` aparece en los primeros segundos NO es que alguien cerró
 *    la ventana (nadie autoriza en 3s): es el handle repudiado, y se descarta para
 *    el resto del intento. Como eso deja al flujo sin forma de saber que el popup
 *    se cerró, quien llama tiene que ofrecer un "Cancelar".
 */

const RESULT_KEY = '__ga_oauth_result'
const POLL_INTERVAL_MS = 600
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
// Un resultado más viejo que esto quedó de otro intento (o de otra pestaña).
const MAX_RESULT_AGE_MS = 60 * 1000
// `closed` dentro de esta ventana es COOP, no un cierre.
const DISOWNED_GRACE_MS = 3000
// Visto un cierre de verdad, un par de ticks más por si el resultado viene en camino.
const CLOSE_SETTLE_MS = 1500

/**
 * Deja el resultado para la ventana que abrió el popup. Lo llama /oauth-result,
 * el único escritor — por eso la clave no sale de este archivo.
 */
export function writeOAuthResult(result) {
  try {
    localStorage.setItem(RESULT_KEY, JSON.stringify({ ...result, ts: Date.now() }))
    return true
  } catch { return false }   // localStorage no disponible
}

/** Borra un resultado anterior. Se llama antes de abrir el popup. */
export function clearOAuthResult() {
  try { localStorage.removeItem(RESULT_KEY) } catch { /* localStorage no disponible */ }
}

function takeOAuthResult() {
  let raw = null
  try { raw = localStorage.getItem(RESULT_KEY) } catch { return null }
  if (!raw) return null
  clearOAuthResult()
  let result = null
  try { result = JSON.parse(raw) } catch { return null }
  if (!result || typeof result !== 'object') return null
  if (typeof result.ts === 'number' && Date.now() - result.ts > MAX_RESULT_AGE_MS) return null
  return result
}

/**
 * Espera el resultado del popup de OAuth.
 *
 * @param {Window|null} popup      handle de window.open (puede quedar repudiado por COOP)
 * @param {number} timeoutMs
 * @returns {{ promise: Promise<{status: 'result'|'closed'|'timeout'|'cancelled', result?: object}>, cancel: () => void }}
 *   `cancel()` corta la espera sin resolver nada accionable — para el desmontaje
 *   del componente y para el botón de cancelar.
 */
export function waitForOAuthResult({ popup = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let cancel = () => {}

  const promise = new Promise(resolve => {
    const openedAt = Date.now()
    let done = false
    let poll = null
    let closedAt = null
    let trustPopup = Boolean(popup)

    function finish(value) {
      if (done) return
      done = true
      window.removeEventListener('storage', onStorage)
      if (poll) { clearInterval(poll); poll = null }
      resolve(value)
    }

    function onStorage(e) {
      // key null = alguien hizo localStorage.clear()
      if (e.key && e.key !== RESULT_KEY) return
      check()
    }

    function check() {
      const result = takeOAuthResult()
      if (result) { finish({ status: 'result', result }); return }

      if (trustPopup) {
        if (!popup.closed) {
          closedAt = null
        } else {
          if (closedAt === null) closedAt = Date.now()
          if (closedAt - openedAt < DISOWNED_GRACE_MS) {
            trustPopup = false; closedAt = null   // COOP: handle repudiado, no cierre
          } else if (Date.now() - closedAt >= CLOSE_SETTLE_MS) {
            finish({ status: 'closed' }); return
          }
        }
      }

      if (Date.now() - openedAt >= timeoutMs) finish({ status: 'timeout' })
    }

    cancel = () => finish({ status: 'cancelled' })
    window.addEventListener('storage', onStorage)
    poll = setInterval(check, POLL_INTERVAL_MS)
    check()   // el popup pudo escribir antes de que engancháramos el listener
  })

  return { promise, cancel }
}
