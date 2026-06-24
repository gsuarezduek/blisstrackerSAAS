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
  const hidden = game.leaderboard?.resultsHidden
  const isVote = game.scoring === 'vote'
  const metricMeta = game.leaderboard?.metric || null

  return (
    <div>
      {game.hasImage && (
        <img src={gameImageUrl(game)} alt="" className="w-full aspect-[3/1] object-cover rounded-lg mb-2 border border-gray-100 dark:border-gray-700" />
      )}
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900 dark:text-white leading-snug">{game.title}</h4>
          {game.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{game.description}</p>}
          {game.prize && <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">🎁 {game.prize}</p>}
          {game.endDate && !game.finished && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              📅 {game.startDate ? `${fmtDate(game.startDate)} – ` : ''}{fmtDate(game.endDate)}
              <span className="mx-1">·</span>
              <span className="font-medium text-primary-600 dark:text-primary-400">{countdown(game.endDate)}</span>
            </p>
          )}
        </div>
        {game.finished && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0">Finalizado</span>}
      </div>

      {/* Ganador (juego finalizado) */}
      {game.finished && game.winnerSubject && (
        <div className="mt-2 mb-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 px-3 py-2 text-sm">
          🏆 <span className="font-semibold text-amber-700 dark:text-amber-300">{game.winnerSubject.label}</span>
          <span className="text-amber-600 dark:text-amber-400"> · {isVote ? `${game.winnerSubject.score} votos` : formatScore(game.winnerSubject.score, false, metricMeta)}</span>
        </div>
      )}

      {/* Votación en curso */}
      {isVote && !game.finished ? (
        <div className="mt-2 space-y-1">
          {hidden && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">🔒 Los votos se revelan recién al cierre.</p>}
          {game.myVote
            ? <p className="text-xs text-green-600 dark:text-green-400 mb-1">✓ Ya votaste. Podés cambiar tu voto.</p>
            : <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Elegí a tu candidato:</p>}
          {subjects.map((s) => {
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
                <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                  {isMine ? 'tu voto' : ''}{!hidden ? ` ${s.score} ${s.score === 1 ? 'voto' : 'votos'}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        /* Ranking (competencias, manual, o votación finalizada) */
        <ol className="mt-2 space-y-1">
          {subjects.length === 0 && <li className="text-xs text-gray-400">Todavía sin puntajes.</li>}
          {subjects.map((s, i) => (
            <li key={s.subjectId} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-5 text-center">{MEDAL[i] || `${i + 1}.`}</span>
                <span className="truncate text-gray-800 dark:text-gray-100">{s.label}</span>
              </span>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300 shrink-0">{formatScore(s.score, isVote, metricMeta)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function formatScore(n, isVote, metricMeta) {
  if (n == null) return ''
  if (isVote) return `${n} ${n === 1 ? 'voto' : 'votos'}`
  if (metricMeta) {
    if (metricMeta.growth) return n > 0 ? `+${n}` : String(n) // delta (seguidores)
    if (metricMeta.unit === '%') return `${n}%`
    if (metricMeta.unit === '$') return `$${n}`
  }
  return String(n)
}

const API_URL = import.meta.env.VITE_API_URL || ''
function gameImageUrl(game) {
  return `${API_URL}/api/gamification/games/${game.id}/image?v=${encodeURIComponent(game.updatedAt || '')}`
}

function fmtDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) } catch { return '' }
}

// Cuenta regresiva hasta el cierre. endDate es fecha (medianoche UTC) y se considera
// inclusive hasta el final de ese día — igual que el motor de visibilidad del backend.
function countdown(endDate) {
  const closeMs = new Date(endDate).getTime() + 24 * 60 * 60 * 1000
  const ms = closeMs - Date.now()
  if (ms <= 0) return 'Cierra hoy'
  const days = Math.floor(ms / 86400000)
  if (days >= 1) return `Quedan ${days} día${days === 1 ? '' : 's'}`
  const hours = Math.floor(ms / 3600000)
  if (hours >= 1) return `Quedan ${hours} h`
  const mins = Math.max(1, Math.floor(ms / 60000))
  return `Quedan ${mins} min`
}
