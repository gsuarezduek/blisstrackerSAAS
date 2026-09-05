const prisma = require('../../lib/prisma')
const { isGameVisible } = require('../../services/gamification.service')
const {
  tzOf, GAME_SELECT, findGame, shapeGame,
  quizRequiresCorrectAnswer, quizParticipationPoints,
} = require('./_shared')

// ─── Cuestionario (quiz) ──────────────────────────────────────────────────────

/** PUT /api/gamification/games/:id/questions (admin) — reemplaza todas las preguntas */
async function putQuestions(req, res, next) {
  try {
    const game = await findGame(req)
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    if (game.scoring !== 'quiz') return res.status(400).json({ error: 'Este juego no es un cuestionario' })
    // Cuestionario "sin puntos" (encuesta de preferencia): no hace falta marcar una
    // respuesta correcta, ni las opciones puntúan.
    const requireCorrect = quizRequiresCorrectAnswer(game)

    const incoming = Array.isArray(req.body.questions) ? req.body.questions : []
    const rows = []
    for (let i = 0; i < incoming.length; i++) {
      const q = incoming[i] || {}
      const text = String(q.text || '').trim()
      if (!text) return res.status(400).json({ error: `La pregunta ${i + 1} no tiene enunciado` })
      // Pregunta abierta: respuesta de texto libre, informativa (no puntúa, sin opciones).
      if (q.kind === 'open') {
        rows.push({ gameId: game.id, order: i, kind: 'open', text, options: [], correctOptionId: null, points: 0 })
        continue
      }
      const options = (Array.isArray(q.options) ? q.options : [])
        .map((o, idx) => ({ id: String(o?.id || `o${idx + 1}`), text: String(o?.text || '').trim() }))
        .filter((o) => o.text)
      if (options.length < 2) return res.status(400).json({ error: `La pregunta ${i + 1} necesita al menos 2 opciones` })
      if (requireCorrect && !options.some((o) => o.id === q.correctOptionId)) return res.status(400).json({ error: `Marcá la opción correcta de la pregunta ${i + 1}` })
      const points = requireCorrect ? (Number(q.points) > 0 ? Number(q.points) : 1) : 0
      rows.push({ gameId: game.id, order: i, kind: 'multiple_choice', text, options, correctOptionId: requireCorrect ? (q.correctOptionId || null) : null, points })
    }

    await prisma.$transaction([
      prisma.gameQuestion.deleteMany({ where: { gameId: game.id } }),
      ...(rows.length ? [prisma.gameQuestion.createMany({ data: rows })] : []),
    ])
    res.json({ ok: true, count: rows.length })
  } catch (err) { next(err) }
}

// Pregunta para el usuario (oculta la respuesta correcta salvo que `reveal`).
function publicQuestion(q, reveal) {
  const kind = q.kind || 'multiple_choice'
  if (kind === 'open') {
    // Abierta: sin opciones ni respuesta correcta, no puntúa.
    return { id: q.id, order: q.order, kind, text: q.text, points: 0, options: [] }
  }
  return {
    id: q.id, order: q.order, kind, text: q.text, points: q.points,
    options: (Array.isArray(q.options) ? q.options : []).map((o) => ({ id: o.id, text: o.text })),
    ...(reveal ? { correctOptionId: q.correctOptionId } : {}),
  }
}

/** GET /api/gamification/games/:id/quiz (cualquier miembro) — preguntas sin la respuesta correcta */
async function getQuiz(req, res, next) {
  try {
    const game = await prisma.game.findFirst({ where: { id: Number(req.params.id), workspaceId: req.workspace.id }, select: GAME_SELECT })
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    if (game.scoring !== 'quiz') return res.status(400).json({ error: 'Este juego no es un cuestionario' })

    const [questions, mine] = await Promise.all([
      prisma.gameQuestion.findMany({ where: { gameId: game.id }, orderBy: { order: 'asc' } }),
      prisma.gameQuizSubmission.findUnique({ where: { gameId_userId: { gameId: game.id, userId: req.user.userId } } }),
    ])
    const reveal = !!mine || game.status === 'finished'
    res.json({
      game: shapeGame(game),
      open: isGameVisible(game, new Date(), tzOf(req)) && game.status === 'active' && !mine,
      submitted: !!mine,
      mySubmission: mine ? { score: mine.score, answers: mine.answers, submittedAt: mine.submittedAt } : null,
      maxScore: questions.reduce((s, q) => s + (q.points || 0), 0) + quizParticipationPoints(game),
      questions: questions.map((q) => publicQuestion(q, reveal)),
    })
  } catch (err) { next(err) }
}

/** POST /api/gamification/games/:id/quiz/submit (cualquier miembro) — body { answers:[{questionId,optionId}] } */
async function submitQuiz(req, res, next) {
  try {
    const game = await prisma.game.findFirst({ where: { id: Number(req.params.id), workspaceId: req.workspace.id }, select: GAME_SELECT })
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' })
    if (game.scoring !== 'quiz') return res.status(400).json({ error: 'Este juego no es un cuestionario' })
    if (!isGameVisible(game, new Date(), tzOf(req))) return res.status(400).json({ error: 'El cuestionario no está abierto en este momento' })

    const existing = await prisma.gameQuizSubmission.findUnique({ where: { gameId_userId: { gameId: game.id, userId: req.user.userId } } })
    if (existing) return res.status(400).json({ error: 'Ya respondiste este cuestionario' })

    const questions = await prisma.gameQuestion.findMany({ where: { gameId: game.id } })
    if (!questions.length) return res.status(400).json({ error: 'El cuestionario no tiene preguntas' })

    const answers = Array.isArray(req.body.answers) ? req.body.answers : []
    const qById = new Map(questions.map((q) => [String(q.id), q]))
    // Índice de respuestas entrantes por pregunta (opción elegida o texto libre).
    const optMap = new Map()  // questionId → optionId (opción múltiple)
    const textMap = new Map() // questionId → text (pregunta abierta)
    for (const a of answers) {
      const qid = String(a.questionId)
      const q = qById.get(qid)
      if (!q) continue
      if ((q.kind || 'multiple_choice') === 'open') textMap.set(qid, String(a.text || '').trim().slice(0, 2000))
      else if (a.optionId != null) optMap.set(qid, String(a.optionId))
    }

    let score = 0
    const savedAnswers = []
    const results = questions.map((q) => {
      const qid = String(q.id)
      if ((q.kind || 'multiple_choice') === 'open') {
        // Abierta: se guarda el texto, no puntúa.
        const text = textMap.get(qid) || ''
        savedAnswers.push({ questionId: qid, text })
        return { questionId: q.id, kind: 'open', text, points: 0 }
      }
      const chosen = optMap.get(qid) || null
      if (chosen != null) savedAnswers.push({ questionId: qid, optionId: chosen })
      const correct = chosen != null && chosen === q.correctOptionId
      if (correct) score += q.points || 0
      return { questionId: q.id, kind: 'multiple_choice', chosenOptionId: chosen, correctOptionId: q.correctOptionId, correct, points: q.points }
    })

    // Puntos extra por participar (independiente de acertar), configurables por el admin.
    const participationPoints = quizParticipationPoints(game)
    score += participationPoints

    await prisma.gameQuizSubmission.create({
      data: { gameId: game.id, userId: req.user.userId, answers: savedAnswers, score },
    })
    res.json({ ok: true, score, maxScore: questions.reduce((s, q) => s + (q.points || 0), 0) + participationPoints, results })
  } catch (err) { next(err) }
}

module.exports = { putQuestions, getQuiz, submitQuiz }
