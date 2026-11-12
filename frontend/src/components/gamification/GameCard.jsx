import { useState, useEffect } from 'react'
import DOMPurify from 'dompurify'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'
import { Icon } from '../ui/Icon'
import { Trophy } from 'lucide-react'
import { looksLikeHtml, gameImageUrl, formatScore, fmtDate, countdown } from './gameFormat'
import '../situation-editor.css'

// Las piezas de UN juego, compartidas por el panel flotante (GamificationFab.jsx, que
// es el único camino en mobile) y la página /juegos (pages/Juegos.jsx).
//
// `GamePanel` es la versión COMPACTA (la del panel de 400px): ranking recortado en un
// <ol>. La página no lo usa para el ranking — tiene su propia tabla holgada — pero sí
// reusa `QuizTaker` y `QuizRanking` tal cual.
//
// OJO: `pages/Gamification.jsx` (el CRUD de admin) tiene su propio `GameCard`, que es
// otra cosa — crear/editar/reordenar/activar. No intentar unificarlos.

export function GamePanel({ game, userId, voting, onVote, onRefresh }) {
  const subjects = game.leaderboard?.subjects || []
  const hidden = game.leaderboard?.resultsHidden
  const isVote = game.scoring === 'vote'
  const isQuiz = game.scoring === 'quiz'
  const quizWithPoints = isQuiz ? game.config?.withPoints !== false : true
  const quizParticipationPoints = isQuiz ? Number(game.config?.participationPoints) || 0 : 0
  // Hay puntaje que mostrar si el quiz puntúa por acierto, o si igual reparte puntos por participar.
  const quizHasScore = quizWithPoints || quizParticipationPoints > 0
  const metricMeta = game.leaderboard?.metric || null
  // En competencias de marketing solo listamos proyectos con puntaje > 0.
  const rankSubjects = metricMeta ? subjects.filter((s) => s.score > 0) : subjects

  return (
    <div>
      {game.hasImage && (
        <img src={gameImageUrl(game)} alt="" className="w-full aspect-[3/1] object-cover rounded-lg mb-2 border border-gray-100 dark:border-gray-700" />
      )}
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900 dark:text-white leading-snug">{game.title}</h4>
          {game.description && (
            looksLikeHtml(game.description)
              ? <div className="situation-content text-xs text-gray-500 dark:text-gray-400 mt-0.5" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(game.description) }} />
              : <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 whitespace-pre-line">{game.description}</p>
          )}
          {game.prize && <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{game.prize}</p>}
          {game.endDate && !game.finished && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {game.startDate ? `${fmtDate(game.startDate)} – ` : ''}{fmtDate(game.endDate)}
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
          <Icon as={Trophy} size={13} className="inline-block text-amber-500 mr-1" /><span className="font-semibold text-amber-700 dark:text-amber-300">{game.winnerSubject.label}</span>
          <span className="text-amber-600 dark:text-amber-400"> · {isVote ? `${game.winnerSubject.score} votos` : formatScore(game.winnerSubject.score, false, metricMeta)}</span>
        </div>
      )}

      {/* Votación en curso */}
      {isVote && !game.finished ? (
        <div className="mt-2 space-y-1">
          {hidden && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Los votos se revelan recién al cierre.</p>}
          {game.myVote
            ? <p className="text-xs text-green-600 dark:text-green-400 mb-1">Ya votaste. Podés cambiar tu voto.</p>
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
      ) : isQuiz && !game.finished ? (
        <div className="mt-2">
          {game.mySubmission
            ? <p className="text-sm text-green-600 dark:text-green-400 mb-2">Ya respondiste{quizHasScore ? <> · tu puntaje: <strong>{game.mySubmission.score}</strong></> : '.'}</p>
            : <QuizTaker gameId={game.id} questionCount={game.questionCount} onDone={onRefresh} withPoints={quizWithPoints} hasScore={quizHasScore} />}
          {quizHasScore && (game.mySubmission || subjects.length > 0) && <QuizRanking subjects={subjects} />}
        </div>
      ) : (
        /* Ranking (competencias, manual, o votación/quiz finalizado) */
        <ol className="mt-2 space-y-1">
          {rankSubjects.length === 0 && <li className="text-xs text-gray-400">{metricMeta ? 'Todavía sin movimientos en esta métrica.' : 'Todavía sin puntajes.'}</li>}
          {rankSubjects.map((s, i) => (
            <li key={s.subjectId} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-5 text-center">{`${i + 1}.`}</span>
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

export function QuizRanking({ subjects }) {
  if (!subjects.length) return null
  return (
    <ol className="mt-1 space-y-1">
      {subjects.map((s, i) => (
        <li key={s.subjectId} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-sm">
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-5 text-center">{`${i + 1}.`}</span>
            {s.avatar && <img src={avatarUrl(s.avatar)} alt="" className="w-6 h-6 rounded-full object-cover" />}
            <span className="truncate text-gray-800 dark:text-gray-100">{s.label}</span>
          </span>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 shrink-0">{s.score} pts</span>
        </li>
      ))}
    </ol>
  )
}

// Cuestionario: el usuario abre, responde y envía. Una sola entrega.

export function QuizTaker({ gameId, questionCount, onDone, withPoints, hasScore }) {
  const [quiz, setQuiz] = useState(null)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  function open() {
    api.get(`/gamification/games/${gameId}/quiz`)
      .then((r) => setQuiz(r.data))
      .catch(() => window.alert('No se pudo cargar el cuestionario'))
  }

  async function submit() {
    setBusy(true)
    try {
      // El shape de cada respuesta depende del tipo de pregunta: opción elegida o texto libre.
      const byId = new Map((quiz?.questions || []).map((q) => [String(q.id), q]))
      const payload = {
        answers: Object.entries(answers).map(([questionId, value]) =>
          byId.get(String(questionId))?.kind === 'open'
            ? { questionId, text: value }
            : { questionId, optionId: value }),
      }
      const { data } = await api.post(`/gamification/games/${gameId}/quiz/submit`, payload)
      setResult(data)
    } catch (e) {
      window.alert(e.response?.data?.error || 'No se pudo enviar el cuestionario')
    } finally { setBusy(false) }
  }

  if (result) {
    const graded = result.results.filter((r) => r.kind !== 'open') // solo las de opción múltiple puntúan
    return (
      <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/40 px-3 py-2 text-sm">
        {hasScore ? (
          <>
            <p className="font-semibold text-green-700 dark:text-green-300">¡Listo! Tu puntaje: {result.score} / {result.maxScore}</p>
            {withPoints && graded.length > 0 && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                {graded.filter((r) => r.correct).length} de {graded.length} correctas.
              </p>
            )}
            <button onClick={onDone} className="mt-2 text-xs font-medium text-primary-600 dark:text-primary-400">Ver ranking</button>
          </>
        ) : (
          <p className="font-semibold text-green-700 dark:text-green-300">¡Listo! Gracias por responder.</p>
        )}
      </div>
    )
  }

  if (!quiz) {
    return (
      <button onClick={open} className="w-full text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg py-2 transition-colors">
        Responder cuestionario{questionCount ? ` (${questionCount} preguntas)` : ''}
      </button>
    )
  }

  const allAnswered = quiz.questions.length > 0 && quiz.questions.every((q) => String(answers[q.id] ?? '').trim() !== '')
  return (
    <div className="space-y-3">
      {quiz.questions.map((q, i) => (
        <div key={q.id}>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">{i + 1}. {q.text} {q.kind === 'open' || !withPoints ? null : <span className="text-xs text-gray-400">({q.points} pts)</span>}</p>
          {q.kind === 'open' ? (
            <textarea
              rows={3}
              value={answers[q.id] || ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              placeholder="Escribí tu respuesta…"
              className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:border-primary-400 focus:outline-none resize-y"
            />
          ) : (
            <div className="space-y-1">
              {q.options.map((o) => (
                <label key={o.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${answers[q.id] === o.id ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === o.id} onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))} />
                  <span className="text-gray-800 dark:text-gray-100">{o.text}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      <button disabled={!allAnswered || busy} onClick={submit} className="w-full text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg py-2 transition-colors disabled:opacity-50">
        {busy ? 'Enviando…' : 'Enviar respuestas'}
      </button>
      {!allAnswered && <p className="text-xs text-gray-400 text-center">Respondé todas las preguntas para enviar.</p>}
    </div>
  )
}
