import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { avatarUrl } from '../utils/avatarUrl'

const MEDAL = ['🥇', '🥈', '🥉']

/**
 * Botón flotante de Gamification (🏆). Solo aparece si el feature flag está
 * habilitado Y hay al menos un juego activo dentro de su ventana de visibilidad.
 * Abre un panel con los juegos visibles, sus rankings y la UI de votación.
 * Se monta una sola vez desde Navbar (igual que FeedbackButton).
 */
export default function GamificationFab() {
  const { user } = useAuth()
  const { enabled } = useFeatureFlag('gamification')
  const [games, setGames] = useState([])
  const [open, setOpen] = useState(false)
  const [voting, setVoting] = useState(null) // gameId en curso

  const load = useCallback(() => {
    api.get('/gamification/active')
      .then((r) => setGames(r.data.games || []))
      .catch(() => setGames([]))
  }, [])

  useEffect(() => {
    if (!enabled || !user) return
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [enabled, user, load])

  if (!enabled || !user || games.length === 0) return null

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

  return (
    <>
      {/* Botón flotante — arriba del de feedback para no solaparse */}
      <button
        onClick={() => setOpen(true)}
        title="Juegos y desafíos del equipo"
        className="fixed bottom-24 right-6 z-40 bg-amber-500 hover:bg-amber-600 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-all hover:scale-110"
      >
        <span className="text-xl leading-none">🏆</span>
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none ring-2 ring-white dark:ring-gray-800">
          {games.length}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end sm:pr-6 sm:pb-6">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-4 sm:mx-0 max-h-[80vh] flex flex-col z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">🏆 Juegos y desafíos</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-5">
              {games.map((g) => (
                <GamePanel key={g.id} game={g} userId={user.id} voting={voting === g.id} onVote={vote} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function GamePanel({ game, userId, voting, onVote }) {
  const subjects = game.leaderboard?.subjects || []
  const isVote = game.scoring === 'vote'

  return (
    <div>
      <div className="mb-1">
        <h4 className="font-semibold text-gray-900 dark:text-white leading-snug">{game.title}</h4>
        {game.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{game.description}</p>}
        {game.prize && <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">🎁 {game.prize}</p>}
      </div>

      {isVote ? (
        <div className="mt-2 space-y-1">
          {game.myVote
            ? <p className="text-xs text-green-600 dark:text-green-400 mb-1">✓ Ya votaste. Podés cambiar tu voto.</p>
            : <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Elegí a tu candidato:</p>}
          {subjects.map((s, i) => {
            const isSelf = String(userId) === s.subjectId
            const isMine = game.myVote === s.subjectId
            return (
              <button
                key={s.subjectId}
                disabled={isSelf || voting}
                onClick={() => onVote(game.id, s.subjectId)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-sm transition-colors disabled:opacity-50 ${
                  isMine ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {s.avatar && <img src={avatarUrl(s.avatar)} alt="" className="w-6 h-6 rounded-full object-cover" />}
                  <span className="truncate text-gray-800 dark:text-gray-100">{s.label}{isSelf ? ' (vos)' : ''}</span>
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{s.score} {s.score === 1 ? 'voto' : 'votos'}{isMine ? ' · tu voto' : ''}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <ol className="mt-2 space-y-1">
          {subjects.length === 0 && <li className="text-xs text-gray-400">Todavía sin puntajes.</li>}
          {subjects.map((s, i) => (
            <li key={s.subjectId} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-5 text-center">{MEDAL[i] || `${i + 1}.`}</span>
                <span className="truncate text-gray-800 dark:text-gray-100">{s.label}</span>
              </span>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300 shrink-0">{formatScore(s.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function formatScore(n) {
  if (n > 0) return `+${n}`
  return String(n)
}
