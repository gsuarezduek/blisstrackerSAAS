import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from './useFeatureFlag'

// Estado de los juegos/desafíos activos de Gamification, extraído de GamificationFab
// para que FloatingDock pueda leer el mismo badge ("newCount") sin duplicar el polling
// de /gamification/active.
export default function useActiveGames() {
  const { user } = useAuth()
  const { enabled: flagEnabled } = useFeatureFlag('gamification')

  const [games, setGames] = useState([])

  const load = useCallback(() => {
    api.get('/gamification/active')
      .then((r) => setGames(r.data.games || []))
      .catch(() => setGames([]))
  }, [])

  useEffect(() => {
    if (!flagEnabled || !user) return
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [flagEnabled, user, load])

  const newCount = games.filter(g => g.isNew).length
  // Mismo criterio que antes vivía inline en GamificationFab: solo "visible" si el flag
  // está prendido, hay usuario, y hay al menos un juego activo en su ventana de visibilidad.
  const visible = !!flagEnabled && !!user && games.length > 0

  return { games, setGames, load, newCount, visible }
}
