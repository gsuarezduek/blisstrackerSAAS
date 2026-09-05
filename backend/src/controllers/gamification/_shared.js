const prisma = require('../../lib/prisma')
const { gameTypeDef } = require('../../lib/gameCatalog')
const { DEFAULT_TZ } = require('../../utils/dates')

function tzOf(req) { return req.workspace.timezone || DEFAULT_TZ }

// Campos de Game que devolvemos al cliente: TODOS menos los bytes de la imagen
// (imageData). Se usa `select` explícito en vez de `omit` para no depender de un
// preview feature de Prisma. Si agregás un campo a Game, sumalo acá.
const GAME_FIELDS = {
  id: true, workspaceId: true, type: true, title: true, description: true, prize: true,
  subjectType: true, scoring: true, config: true, visibilityRule: true,
  startDate: true, endDate: true, status: true, sortOrder: true, finishedAt: true, winnerSubject: true,
  imageMimeType: true, createdById: true, createdAt: true, updatedAt: true,
}
const GAME_SELECT = GAME_FIELDS
const GAME_SELECT_TEAMS = { ...GAME_FIELDS, teams: true }

async function findGame(req) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return null
  return prisma.game.findFirst({ where: { id, workspaceId: req.workspace.id }, select: GAME_SELECT })
}

// Da forma a un juego para la respuesta (sin leaderboard).
function shapeGame(g, { teams } = {}) {
  return {
    id: g.id,
    type: g.type,
    typeName: gameTypeDef(g.type)?.name || g.type,
    title: g.title,
    description: g.description,
    prize: g.prize,
    subjectType: g.subjectType,
    scoring: g.scoring,
    config: g.config || {},
    visibilityRule: g.visibilityRule || {},
    startDate: g.startDate,
    endDate: g.endDate,
    status: g.status,
    sortOrder: g.sortOrder ?? 0,
    finishedAt: g.finishedAt || null,
    winnerSubject: g.winnerSubject || null,
    hasImage: !!g.imageMimeType,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    ...(teams ? { teams: teams.map(shapeTeam) } : {}),
  }
}

function shapeTeam(t) {
  return {
    id: t.id,
    name: t.name,
    memberIds: Array.isArray(t.memberIds) ? t.memberIds : [],
    projectIds: Array.isArray(t.projectIds) ? t.projectIds : [],
  }
}

// Helper compartido: ¿este juego de tipo quiz exige marcar una respuesta correcta?
// No, si el admin optó explícitamente por "sin puntos" (encuestas de preferencia).
function quizRequiresCorrectAnswer(game) { return game.config?.withPoints !== false }
function quizParticipationPoints(game) {
  const pp = Number(game.config?.participationPoints)
  return Number.isFinite(pp) && pp > 0 ? pp : 0
}

// Cada vez que se guardan las preguntas de un cuestionario (putQuestions) las filas de
// GameQuestion se recrean con id nuevo — así que las entregas anteriores a ese guardado
// quedan con answers[].questionId apuntando a filas que ya no existen ("huérfanas").
// Reconciliamos automáticamente en dos pasos, sin migrar nada en la base:
//   1) Opción múltiple: el id de la OPCIÓN elegida sí es estable entre recreaciones (se
//      preserva al reeditar), así que buscamos a qué pregunta actual pertenece esa opción.
//   2) Preguntas abiertas (sin optionId, sin ancla estable): si al menos una respuesta de
//      la MISMA entrega se resolvió por (1) y su posición dentro del array coincide con la
//      posición de esa pregunta en el cuestionario actual, asumimos que el array completo
//      respeta ese mismo orden y completamos el resto por posición. Si no hay ninguna
//      respuesta anclada, no se adivina nada: queda como "sin respuesta".
function reconcileOrphanAnswers(rawAnswers, questionsSorted, questionIds, optionToQuestionId) {
  const resolved = rawAnswers.map((a) => {
    const qid = String(a.questionId)
    if (questionIds.has(qid)) return { a, questionId: qid, anchored: false }
    if (a.optionId != null && optionToQuestionId.has(String(a.optionId))) {
      return { a, questionId: optionToQuestionId.get(String(a.optionId)), anchored: true }
    }
    return { a, questionId: qid, anchored: false }
  })

  const anchors = resolved.filter((r) => r.anchored).length
  const positionsMatch = anchors > 0 && resolved.length === questionsSorted.length &&
    resolved.every((r, i) => !r.anchored || questionsSorted[i].id === r.questionId)

  return resolved.map((r, i) => ({
    questionId: questionIds.has(r.questionId) ? r.questionId : (positionsMatch ? String(questionsSorted[i].id) : r.questionId),
    optionId: r.a.optionId != null ? String(r.a.optionId) : null,
    text: r.a.text != null ? String(r.a.text) : null,
  }))
}

module.exports = {
  tzOf,
  GAME_SELECT, GAME_SELECT_TEAMS,
  findGame, shapeGame, shapeTeam,
  quizRequiresCorrectAnswer, quizParticipationPoints, reconcileOrphanAnswers,
}
