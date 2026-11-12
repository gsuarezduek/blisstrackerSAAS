import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import DOMPurify from 'dompurify'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import useActiveGames, { notifyActiveGamesChanged } from '../hooks/useActiveGames'
import { QuizTaker, QuizRanking } from '../components/gamification/GameCard'
import { looksLikeHtml, gameImageUrl, formatScore, fmtDate, countdown } from '../components/gamification/gameFormat'
import { avatarUrl } from '../utils/avatarUrl'
import { Icon } from '../components/ui/Icon'
import { Trophy, Lock, History, Medal } from 'lucide-react'
import '../components/situation-editor.css'

// Página de Juegos — para cualquier miembro del workspace. El CRUD de admin sigue en
// /admin/gamification (pages/Gamification.jsx), que es otra cosa.
//
// No es "el panel flotante más grande": lo que el panel de 400px no podía dar es
// (a) el ranking completo con la posición propia destacada en vez de un <ol> recortado,
// (b) el quiz y la votación con espacio real — las preguntas abiertas en un textarea de
// panel chico son el peor caso de hoy — y (c) el HISTÓRICO: `GET /active` solo muestra
// los finalizados de los últimos 7 días, después desaparecen y con ellos quién ganó.
//
// El panel flotante sobrevive para mobile (FloatingDock lo oculta desde lg).

const PODIUM_TONES = [
  'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/40',
  'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-600',
  'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-900/40',
]

/** El sujeto que soy yo, si el juego puntúa personas o equipos. */
function myRow(game, subjects, userId) {
  if (!userId) return null
  if (game.subjectType === 'person') {
    return subjects.find(s => String(s.subjectId) === String(userId)) || null
  }
  if (game.subjectType === 'team') {
    const team = (game.teams || []).find(t => (t.memberIds || []).includes(userId))
    return team ? subjects.find(s => String(s.subjectId) === String(team.id)) || null : null
  }
  // En competencias por proyecto no hay "mi posición".
  return null
}

function Leaderboard({ game, subjects, userId, isVote, metricMeta }) {
  // En competencias de marketing solo se listan proyectos con puntaje > 0.
  const rows = metricMeta ? subjects.filter(s => s.score > 0) : subjects
  const mine = myRow(game, rows, userId)

  if (rows.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-6 text-center">
        {metricMeta ? 'Todavía sin movimientos en esta métrica.' : 'Todavía sin puntajes.'}
      </p>
    )
  }

  const podium = rows.slice(0, 3)
  const rest = rows.slice(3)

  return (
    <div>
      {/* Podio: en el panel chico los tres primeros eran tres filas más de una lista. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {podium.map((s, i) => (
          <div key={s.subjectId} className={`rounded-xl border px-4 py-3 ${PODIUM_TONES[i]}`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon as={Medal} size={15} className={i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : 'text-orange-400'} />
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{i + 1}°</span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              {s.avatar && <img src={avatarUrl(s.avatar)} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />}
              <p className="font-semibold text-gray-900 dark:text-white truncate">{s.label}</p>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{formatScore(s.score, isVote, metricMeta)}</p>
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <ol className="space-y-1">
          {rest.map((s, i) => {
            const isMine = mine && s.subjectId === mine.subjectId
            return (
              <li
                key={s.subjectId}
                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm ${isMine
                  ? 'bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-200 dark:ring-primary-900/50'
                  : 'bg-gray-50 dark:bg-gray-700/40'}`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="w-6 text-center text-xs text-gray-400">{i + 4}.</span>
                  {s.avatar && <img src={avatarUrl(s.avatar)} alt="" className="w-6 h-6 rounded-full object-cover" />}
                  <span className="truncate text-gray-800 dark:text-gray-100">
                    {s.label}{isMine ? ' · vos' : ''}
                  </span>
                </span>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300 flex-shrink-0">
                  {formatScore(s.score, isVote, metricMeta)}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {/* Si estoy fuera del podio y de la lista visible, igual se dice dónde estoy. */}
      {mine && (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Tu posición: <strong className="text-gray-700 dark:text-gray-200">{rows.findIndex(s => s.subjectId === mine.subjectId) + 1}°</strong>
          {' · '}{formatScore(mine.score, isVote, metricMeta)}
        </p>
      )}
    </div>
  )
}

function VoteBoard({ game, subjects, userId, voting, onVote }) {
  const hidden = game.leaderboard?.resultsHidden
  return (
    <div>
      {hidden && <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Los votos se revelan recién al cierre.</p>}
      <p className="text-sm mb-3">
        {game.myVote
          ? <span className="text-green-600 dark:text-green-400">Ya votaste. Podés cambiar tu voto.</span>
          : <span className="text-gray-500 dark:text-gray-400">Elegí a tu candidato:</span>}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {subjects.map(s => {
          const isSelf = String(userId) === s.subjectId
          const isMine = game.myVote === s.subjectId
          return (
            <button
              key={s.subjectId}
              type="button"
              disabled={isSelf || voting}
              onClick={() => onVote(game.id, s.subjectId)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm text-left transition-colors disabled:opacity-50 ${isMine
                ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              {s.avatar && <img src={avatarUrl(s.avatar)} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-gray-800 dark:text-gray-100">{s.label}{isSelf ? ' (vos)' : ''}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  {isMine ? 'tu voto' : ''}
                  {!hidden ? `${isMine ? ' · ' : ''}${s.score} ${s.score === 1 ? 'voto' : 'votos'}` : ''}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function GameView({ game, userId, voting, onVote, onRefresh }) {
  const subjects = game.leaderboard?.subjects || []
  const isVote = game.scoring === 'vote'
  const isQuiz = game.scoring === 'quiz'
  const metricMeta = game.leaderboard?.metric || null
  const quizWithPoints = isQuiz ? game.config?.withPoints !== false : true
  const quizParticipation = isQuiz ? Number(game.config?.participationPoints) || 0 : 0
  const quizHasScore = quizWithPoints || quizParticipation > 0

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {game.hasImage && (
        <img src={gameImageUrl(game)} alt="" className="w-full aspect-[4/1] object-cover" />
      )}
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{game.title}</h2>
            {game.endDate && !game.finished && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {game.startDate ? `${fmtDate(game.startDate)} – ` : ''}{fmtDate(game.endDate)}
                <span className="mx-1.5">·</span>
                <span className="font-medium text-primary-600 dark:text-primary-400">{countdown(game.endDate)}</span>
              </p>
            )}
          </div>
          {game.finished && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 flex-shrink-0">
              Finalizado
            </span>
          )}
        </div>

        {/* Reglas y premio completos: `description` es HTML rico y en 400px se leía apretado. */}
        {game.description && (
          looksLikeHtml(game.description)
            ? <div className="situation-content text-sm text-gray-600 dark:text-gray-300 mb-3" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(game.description) }} />
            : <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 whitespace-pre-line">{game.description}</p>
        )}
        {game.prize && (
          <p className="text-sm mb-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 text-amber-700 dark:text-amber-300">
            <Icon as={Trophy} size={14} /> {game.prize}
          </p>
        )}

        {game.finished && game.winnerSubject && (
          <div className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-0.5">Ganador</p>
            <p className="text-base font-bold text-amber-800 dark:text-amber-200">
              {game.winnerSubject.label}
              <span className="font-normal text-amber-600 dark:text-amber-400 text-sm">
                {' · '}{isVote ? `${game.winnerSubject.score} votos` : formatScore(game.winnerSubject.score, false, metricMeta)}
              </span>
            </p>
          </div>
        )}

        {isVote && !game.finished ? (
          <VoteBoard game={game} subjects={subjects} userId={userId} voting={voting} onVote={onVote} />
        ) : isQuiz && !game.finished ? (
          <div>
            {game.mySubmission ? (
              <p className="text-sm text-green-600 dark:text-green-400 mb-3">
                Ya respondiste{quizHasScore ? <> · tu puntaje: <strong>{game.mySubmission.score}</strong></> : '.'}
              </p>
            ) : (
              <QuizTaker
                gameId={game.id}
                questionCount={game.questionCount}
                onDone={onRefresh}
                withPoints={quizWithPoints}
                hasScore={quizHasScore}
              />
            )}
            {quizHasScore && (game.mySubmission || subjects.length > 0) && <QuizRanking subjects={subjects} />}
          </div>
        ) : (
          <Leaderboard game={game} subjects={subjects} userId={userId} isVote={isVote} metricMeta={metricMeta} />
        )}
      </div>
    </div>
  )
}

/** Muro de ganadores: los juegos que ya terminaron. */
function HistorySection({ userId }) {
  const [state, setState] = useState({ loading: true, games: [], total: 0 })

  useEffect(() => {
    api.get('/gamification/history', { params: { take: 20 } })
      .then(({ data }) => setState({ loading: false, games: data.games || [], total: data.total || 0 }))
      .catch(() => setState({ loading: false, games: [], total: 0 }))
  }, [])

  // "Gané N" se deriva de acá, sin endpoint propio. Un ledger real de puntos por
  // persona sería un modelo nuevo — fuera de alcance.
  const myWins = useMemo(
    () => state.games.filter(g => String(g.winnerSubject?.subjectId) === String(userId)).length,
    [state.games, userId],
  )

  if (state.loading) return <LoadingSpinner className="py-8" />
  if (state.games.length === 0) {
    return <p className="text-sm text-gray-400 py-6 text-center">Todavía no terminó ningún juego.</p>
  }

  return (
    <div>
      {myWins > 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          Ganaste <strong>{myWins}</strong> de los últimos {state.games.length}.
        </p>
      )}
      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {state.games.map(g => {
          const iWon = String(g.winnerSubject?.subjectId) === String(userId)
          return (
            <li key={g.id} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{g.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {g.typeName}{g.finishedAt ? ` · terminó el ${fmtDate(g.finishedAt)}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                {g.winnerSubject ? (
                  <p className={`text-sm font-medium inline-flex items-center gap-1.5 ${iWon ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-300'}`}>
                    <Icon as={Trophy} size={13} className="text-amber-500" />
                    {g.winnerSubject.label}{iWon ? ' · vos' : ''}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400">Sin ganador</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {state.total > state.games.length && (
        <p className="mt-3 text-xs text-gray-400">Mostrando los {state.games.length} más recientes de {state.total}.</p>
      )}
    </div>
  )
}

export default function Juegos() {
  const { user } = useAuth()
  const { enabled, loading: flagLoading } = useFeatureFlag('gamification')
  const { games, setGames, load } = useActiveGames()
  const [searchParams, setSearchParams] = useSearchParams()
  const [voting, setVoting] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  const gameParam = searchParams.get('game')
  const selectedId = gameParam && games.some(g => String(g.id) === gameParam)
    ? gameParam
    : (games[0] ? String(games[0].id) : null)
  const selected = games.find(g => String(g.id) === selectedId) || null

  // Entrar acá cuenta como "ya lo vi": apaga el badge de nuevo, igual que el panel
  // flotante. Sin esto, abrir /juegos nunca lo apagaría.
  useEffect(() => {
    if (!games.some(g => g.isNew)) return
    api.post('/notifications/read', { types: ['GAME_LAUNCHED'] }).catch(() => {})
    setGames(gs => gs.map(g => (g.isNew ? { ...g, isNew: false } : g)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games])

  async function vote(gameId, targetUserId) {
    setVoting(gameId)
    try {
      await api.post(`/gamification/games/${gameId}/vote`, { targetUserId: Number(targetUserId) })
      notifyActiveGamesChanged()
    } catch (e) {
      window.alert(e.response?.data?.error || 'No se pudo registrar el voto')
    } finally {
      setVoting(null)
    }
  }

  function selectGame(id) {
    setSearchParams(prev => {
      const p = Object.fromEntries(prev.entries())
      p.game = String(id)
      return p
    }, { replace: true })
  }

  if (!flagLoading && !enabled) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
            <div className="mb-4"><Icon as={Lock} size={32} className="inline-block text-gray-300 dark:text-gray-600" /></div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Sección no disponible</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
              Esta sección está siendo activada gradualmente. Si querés acceso anticipado, contactá al equipo de BlissTracker.
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Juegos y desafíos</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {games.length > 0
              ? `${games.length} ${games.length === 1 ? 'juego activo' : 'juegos activos'}`
              : 'No hay juegos activos ahora mismo'}
          </p>
        </div>

        {/* Selector cuando hay varios: un juego a la vez, pero sin esconder los otros. */}
        {games.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {games.map(g => {
              const active = String(g.id) === selectedId
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => selectGame(g.id)}
                  className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-colors max-w-full truncate ${active
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                  title={g.title}
                >
                  {g.title}
                </button>
              )
            })}
          </div>
        )}

        {selected ? (
          <GameView game={selected} userId={user?.id} voting={voting === selected.id} onVote={vote} onRefresh={load} />
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
            <div className="mb-3"><Icon as={Trophy} size={32} strokeWidth={1.5} className="inline-block text-gray-300 dark:text-gray-600" /></div>
            <p className="font-medium text-gray-600 dark:text-gray-300">No hay juegos activos</p>
            <p className="text-sm text-gray-400 mt-1">Cuando el equipo lance uno, aparece acá.</p>
          </div>
        )}

        {/* El histórico se pide recién al abrirlo. */}
        <section className="mt-10 border-t border-gray-200 dark:border-gray-700 pt-5">
          <button
            type="button"
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            aria-expanded={showHistory}
          >
            <Icon as={History} size={15} />
            Terminados
          </button>
          {showHistory && <div className="mt-4"><HistorySection userId={user?.id} /></div>}
        </section>
      </main>
    </div>
  )
}
