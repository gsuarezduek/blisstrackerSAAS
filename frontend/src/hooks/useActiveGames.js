import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from './useFeatureFlag'

// Estado de los juegos/desafíos activos de Gamification. Lo leen la barra lateral (para
// el badge "N nuevos"), el panel flotante de mobile y la página /juegos.
//
// Caché a nivel de módulo + UN SOLO intervalo compartido (mismo patrón que
// `useStarredProjects`/`useNavCounts`): con la barra y la página montadas a la vez
// serían dos pollings de `/gamification/active`, y ese endpoint corre
// `computeLeaderboard` por juego — para los de métrica de marketing eso pega contra los
// snapshots. El contador de suscriptores apaga el intervalo cuando no queda nadie.
//
// `notifyActiveGamesChanged()` invalida después de votar o enviar un quiz, para no
// esperar el próximo tick.

const TTL_MS  = 45 * 1000
const POLL_MS = 60 * 1000
const EVENT   = 'bliss:active-games-changed'

let cache = null        // { userId, at, games }
let inflight = null
let timer = null
let subscribers = 0

function fetchGames(userId) {
  if (inflight) return inflight
  inflight = api.get('/gamification/active')
    .then(r => {
      cache = { userId, at: Date.now(), games: r.data.games || [] }
      window.dispatchEvent(new CustomEvent(EVENT))
      return cache.games
    })
    .catch(() => {
      cache = { userId, at: Date.now(), games: [] }
      return cache.games
    })
    .finally(() => { inflight = null })
  return inflight
}

/** Invalida la caché y vuelve a pedir (después de votar, de enviar un quiz…). */
export function notifyActiveGamesChanged() {
  if (cache) fetchGames(cache.userId).catch(() => {})
}

/**
 * Patch local de los juegos en caché, para apagar el badge "nuevo" al instante sin
 * esperar la respuesta del servidor. Lo usan el panel y la página al abrirse.
 */
export function patchActiveGames(fn) {
  if (!cache) return
  cache = { ...cache, games: fn(cache.games) }
  window.dispatchEvent(new CustomEvent(EVENT))
}

export default function useActiveGames() {
  const { user } = useAuth()
  const { enabled: flagEnabled } = useFeatureFlag('gamification')
  const userId = user?.id
  const fresh = cache && cache.userId === userId
  const [games, setGames] = useState(fresh ? cache.games : [])

  const load = useCallback(() => {
    if (!userId) return
    fetchGames(userId).catch(() => {})
  }, [userId])

  useEffect(() => {
    if (!flagEnabled || !userId) return
    let alive = true

    const stale = !fresh || Date.now() - cache.at > TTL_MS
    if (stale) fetchGames(userId).then(g => { if (alive) setGames(g) }).catch(() => {})
    else setGames(cache.games)

    const onChange = () => { if (cache) setGames(cache.games) }
    window.addEventListener(EVENT, onChange)

    subscribers += 1
    if (!timer) timer = setInterval(() => { if (cache) fetchGames(cache.userId).catch(() => {}) }, POLL_MS)

    return () => {
      alive = false
      window.removeEventListener(EVENT, onChange)
      subscribers -= 1
      if (subscribers <= 0 && timer) { clearInterval(timer); timer = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flagEnabled, userId])

  const newCount = games.filter(g => g.isNew).length
  // Solo "visible" si el flag está prendido, hay usuario y hay al menos un juego en su
  // ventana de visibilidad.
  const visible = !!flagEnabled && !!user && games.length > 0

  return { games, setGames: patchActiveGames, load, newCount, visible }
}
