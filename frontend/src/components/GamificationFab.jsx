import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import useActiveGames from '../hooks/useActiveGames'
import { Trophy, X } from 'lucide-react'
import { Icon } from './ui/Icon'
import { GamePanel } from './gamification/GameCard'
import { actionPending } from './gamification/gameFormat'


/**
 * Panel de Gamification (🏆) — sin botón propio, es FloatingDock (frontend/src/
 * components/FloatingDock.jsx) quien decide cuándo mostrar el trigger y el badge
 * (vía useActiveGames, mismo hook que consume este componente). Se abre disparando
 * el evento `bliss:open-game` (con o sin `detail.gameId`).
 */
export default function GamificationFab() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { games, setGames, load, visible } = useActiveGames()
  const [open, setOpen] = useState(false)
  const [voting, setVoting] = useState(null) // gameId en curso
  const [tab, setTab] = useState(0)          // juego seleccionado cuando hay varios
  const [pendingGameId, setPendingGameId] = useState(null) // abierto desde una notificación

  // Al clickear una notificación de "nuevo juego" (NotificationBell) o el ícono del dock.
  //
  // En DESKTOP navega a la página; el panel queda para mobile, que es donde el botón
  // flotante sigue existiendo (FloatingDock lo oculta desde lg). El breakpoint se
  // evalúa al recibir el evento, no al montar, y así cualquier emisor — la campana, el
  // buscador — sigue funcionando sin tener que saber de esto.
  useEffect(() => {
    function handleOpenGame(e) {
      const gameId = e.detail?.gameId
      if (window.matchMedia('(min-width: 1024px)').matches) {
        navigate(gameId ? `/juegos?game=${gameId}` : '/juegos')
        return
      }
      if (gameId) setPendingGameId(gameId)
      setOpen(true)
      load()
    }
    window.addEventListener('bliss:open-game', handleOpenGame)
    return () => window.removeEventListener('bliss:open-game', handleOpenGame)
  }, [load, navigate])

  useEffect(() => {
    if (pendingGameId == null) return
    const idx = games.findIndex(g => g.id === pendingGameId)
    if (idx !== -1) {
      setTab(idx)
      setPendingGameId(null)
    }
  }, [games, pendingGameId])

  // Con el panel abierto, "ya lo viste": marca leída la notificación GAME_LAUNCHED de cada
  // juego nuevo (así el badge de "nuevo" no vuelve a aparecer) y limpia isNew localmente
  // para que el badge se apague al instante, sin esperar al próximo poll.
  useEffect(() => {
    if (!open || !games.some(g => g.isNew)) return
    api.post('/notifications/read', { types: ['GAME_LAUNCHED'] }).catch(() => {})
    setGames(gs => gs.map(g => (g.isNew ? { ...g, isNew: false } : g)))
  }, [open, games])

  if (!visible) return null

  async function vote(gameId, targetUserId) {
    setVoting(gameId)
    try {
      await api.post(`/gamification/games/${gameId}/vote`, { targetUserId: Number(targetUserId) })
      load()
    } catch (e) {
      window.alert(e.response?.data?.error || 'No se pudo registrar el voto')
    } finally {
      setVoting(null)
    }
  }

  // Con varios juegos mostramos uno a la vez (pestañas); con uno solo, ese.
  const safeTab = Math.min(tab, games.length - 1)
  const shownGames = games.length > 1 ? [games[safeTab]] : games

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end sm:pr-6 sm:pb-6">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-4 sm:mx-0 max-h-[80vh] flex flex-col z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Juegos y desafíos
                {games.length > 1 && <span className="ml-1.5 text-xs font-normal text-gray-400">({games.length} activos)</span>}
              </h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><Icon as={X} size={16} /></button>
            </div>

            {/* Pestañas cuando hay varios juegos, para no perderse los de abajo */}
            {games.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto px-4 py-2 border-b border-gray-100 dark:border-gray-700 shrink-0">
                {games.map((g, i) => {
                  const active = i === safeTab
                  return (
                    <button
                      key={g.id}
                      onClick={() => setTab(i)}
                      className={`flex items-center gap-1 shrink-0 max-w-[42%] px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${active ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                      title={g.title}
                    >
                      {actionPending(g, user.id) && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-white' : 'bg-red-500'}`} />}
                      <span className="truncate">{g.title}</span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="overflow-y-auto px-5 py-4 space-y-5">
              {shownGames.map((g) => (
                <GamePanel key={g.id} game={g} userId={user.id} voting={voting === g.id} onVote={vote} onRefresh={load} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
