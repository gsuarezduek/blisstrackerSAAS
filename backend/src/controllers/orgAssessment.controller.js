const prisma  = require('../lib/prisma')
const Anthropic = require('@anthropic-ai/sdk')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Preguntas (fuente de verdad compartida con el frontend) ──────────────────
// Las 18 preguntas de la Evaluación Organizacional EOS, agrupadas en 6 componentes.
// El frontend las define igual para renderizarlas; el backend las usa para el análisis.

const CATEGORIES = [
  {
    id:    'vision',
    label: 'Visión',
    questions: [
      { id: 1, text: 'Todos los líderes comparten la misma visión y están alineados al 100% sobre hacia dónde va la empresa.' },
      { id: 2, text: 'Todos en la organización conocen y pueden articular el Core Focus, los Core Values y los objetivos estratégicos (10, 3 y 1 año).' },
      { id: 3, text: 'La estrategia de marketing está claramente definida: cliente ideal, diferenciadores, proceso probado y garantía.' },
    ],
  },
  {
    id:    'personas',
    label: 'Personas',
    questions: [
      { id: 4, text: 'El 100% de los líderes son "personas correctas": comparten los valores de la empresa y están en el puesto adecuado.' },
      { id: 5, text: 'El 100% de los empleados son "personas correctas en puestos correctos": hacen lo que mejor hacen y les apasiona.' },
      { id: 6, text: 'Existe un organigrama claro con responsabilidades bien definidas, actualizado y conocido por todos.' },
    ],
  },
  {
    id:    'datos',
    label: 'Datos',
    questions: [
      { id: 7, text: 'El equipo de liderazgo revisa semanalmente un Scorecard con indicadores que reflejan el pulso real del negocio.' },
      { id: 8, text: 'Cada función/área tiene métricas claras y sabe en todo momento cómo está rindiendo.' },
      { id: 9, text: 'Las Rocas, metas e indicadores son medibles y se están alcanzando en tiempo.' },
    ],
  },
  {
    id:    'asuntos',
    label: 'Asuntos',
    questions: [
      { id: 10, text: 'Somos excelentes identificando, discutiendo y resolviendo problemas rápido y de forma permanente.' },
      { id: 11, text: 'Mantenemos una lista de issues activa, priorizada y la trabajamos con regularidad.' },
      { id: 12, text: 'Los problemas se comunican y resuelven de forma efectiva en todos los niveles de la organización.' },
    ],
  },
  {
    id:    'procesos',
    label: 'Procesos',
    questions: [
      { id: 13, text: 'Los procesos clave están documentados, simplificados y seguidos de manera consistente por todos.' },
      { id: 14, text: 'Contamos con un proceso consistente para incorporar y capacitar a nuevas personas.' },
      { id: 15, text: 'Los procesos son escalables: funcionan bien independientemente de quién los ejecute.' },
    ],
  },
  {
    id:    'traccion',
    label: 'Tracción',
    questions: [
      { id: 16, text: 'Todos establecen Rocas trimestrales y son responsables de cumplirlas (meta: 80% o más).' },
      { id: 17, text: 'Realizamos Level 10 Meetings semanales con agenda consistente, eficiencia y alta puntuación.' },
      { id: 18, text: 'Todo el equipo está 100% comprometido y remando en la misma dirección hacia los mismos objetivos.' },
    ],
  },
]

const ALL_QUESTIONS = CATEGORIES.flatMap(c => c.questions)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRound(round, responses, workspaceMembers) {
  const respondentIds = responses.map(r => r.userId)
  const respondents   = workspaceMembers
    .filter(m => respondentIds.includes(m.userId))
    .map(m => ({ id: m.user.id, name: m.user.name, avatar: m.user.avatar }))

  return {
    id:            round.id,
    status:        round.status,
    resultData:    round.resultData ? JSON.parse(round.resultData) : null,
    closedAt:      round.closedAt,
    createdAt:     round.createdAt,
    respondentCount: responses.length,
    respondents,
  }
}

// ─── GET /api/eos/assessment ──────────────────────────────────────────────────
// Devuelve el estado actual: round abierto (si hay), usuarios que respondieron,
// si el usuario actual ya respondió, y la lista de rounds cerrados (historial).

async function getAssessment(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId      = req.user.userId

    const [members, openRound, closedRounds] = await Promise.all([
      prisma.workspaceMember.findMany({
        where:   { workspaceId, active: true, role: { in: ['admin', 'owner'] } },
        include: { user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { user: { name: 'asc' } },
      }),
      prisma.orgAssessmentRound.findFirst({
        where:   { workspaceId, status: 'open' },
        include: { responses: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.orgAssessmentRound.findMany({
        where:   { workspaceId, status: 'closed' },
        include: { responses: { select: { userId: true } } },
        orderBy: { closedAt: 'desc' },
        take:    10,
      }),
    ])

    const adminMembers = members

    let currentRound = null
    let myAnswers    = null

    if (openRound) {
      const myResponse = openRound.responses.find(r => r.userId === userId)
      myAnswers = myResponse ? JSON.parse(myResponse.answers) : null

      currentRound = {
        ...formatRound(openRound, openRound.responses, adminMembers),
        myAnswers,
      }
    }

    const history = closedRounds.map(r => ({
      id:             r.id,
      status:         r.status,
      closedAt:       r.closedAt,
      createdAt:      r.createdAt,
      respondentCount: r.responses.length,
      resultData:     r.resultData ? JSON.parse(r.resultData) : null,
    }))

    res.json({
      adminMembers: adminMembers.map(m => ({ id: m.user.id, name: m.user.name, avatar: m.user.avatar })),
      currentRound,
      history,
    })
  } catch (err) { next(err) }
}

// ─── POST /api/eos/assessment/start ──────────────────────────────────────────
// Inicia una nueva ronda (solo si no hay una abierta)

async function startRound(req, res, next) {
  try {
    const workspaceId = req.workspace.id

    const existing = await prisma.orgAssessmentRound.findFirst({
      where: { workspaceId, status: 'open' },
    })
    if (existing) return res.status(409).json({ error: 'Ya existe una evaluación en curso' })

    const round = await prisma.orgAssessmentRound.create({
      data: { workspaceId },
    })

    res.status(201).json({ id: round.id, status: round.status, createdAt: round.createdAt })
  } catch (err) { next(err) }
}

// ─── POST /api/eos/assessment/rounds/:id/response ────────────────────────────
// El admin actual envía o actualiza su respuesta
// body: { answers: [{questionId, score}] }

async function submitResponse(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const userId      = req.user.userId
    const roundId     = Number(req.params.id)
    const { answers } = req.body

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'answers es requerido' })
    }

    // Validar scores
    for (const a of answers) {
      if (!Number.isInteger(a.questionId) || a.questionId < 1 || a.questionId > 18) {
        return res.status(400).json({ error: `questionId inválido: ${a.questionId}` })
      }
      if (!Number.isInteger(a.score) || a.score < 1 || a.score > 5) {
        return res.status(400).json({ error: `score inválido en pregunta ${a.questionId}` })
      }
    }

    const round = await prisma.orgAssessmentRound.findFirst({
      where: { id: roundId, workspaceId, status: 'open' },
    })
    if (!round) return res.status(404).json({ error: 'Ronda no encontrada o ya cerrada' })

    await prisma.orgAssessmentResponse.upsert({
      where:  { roundId_userId: { roundId, userId } },
      create: { roundId, workspaceId, userId, answers: JSON.stringify(answers) },
      update: { answers: JSON.stringify(answers) },
    })

    res.json({ ok: true })
  } catch (err) { next(err) }
}

// ─── POST /api/eos/assessment/rounds/:id/close ───────────────────────────────
// Cierra la ronda, calcula promedios y genera análisis IA

async function closeRound(req, res, next) {
  try {
    const workspaceId = req.workspace.id
    const roundId     = Number(req.params.id)

    const round = await prisma.orgAssessmentRound.findFirst({
      where:   { id: roundId, workspaceId, status: 'open' },
      include: { responses: true },
    })
    if (!round) return res.status(404).json({ error: 'Ronda no encontrada o ya cerrada' })
    if (round.responses.length === 0) {
      return res.status(400).json({ error: 'No hay respuestas para generar el resultado' })
    }

    // ── Calcular promedios ────────────────────────────────────────────────────

    // scores[questionId] = array de scores
    const scoresByQuestion = {}
    for (let i = 1; i <= 18; i++) scoresByQuestion[i] = []

    for (const resp of round.responses) {
      const answers = JSON.parse(resp.answers)
      for (const a of answers) {
        if (scoresByQuestion[a.questionId]) {
          scoresByQuestion[a.questionId].push(a.score)
        }
      }
    }

    // Promedio por pregunta
    const questionAverages = {}
    for (const [qId, scores] of Object.entries(scoresByQuestion)) {
      questionAverages[Number(qId)] = scores.length
        ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
        : null
    }

    // Promedio por categoría
    const categoryAverages = {}
    for (const cat of CATEGORIES) {
      const catScores = cat.questions
        .map(q => questionAverages[q.id])
        .filter(s => s !== null)
      categoryAverages[cat.id] = catScores.length
        ? Math.round((catScores.reduce((s, v) => s + v, 0) / catScores.length) * 10) / 10
        : null
    }

    // Promedio total
    const allAvgs  = Object.values(questionAverages).filter(v => v !== null)
    const totalAverage = allAvgs.length
      ? Math.round((allAvgs.reduce((s, v) => s + v, 0) / allAvgs.length) * 10) / 10
      : 0

    // ── Generar análisis IA ───────────────────────────────────────────────────

    const categoryLines = CATEGORIES.map(cat => {
      const avg = categoryAverages[cat.id] ?? '—'
      const qLines = cat.questions.map(q => {
        const score = questionAverages[q.id] ?? '—'
        return `  - ${q.text} → ${score}/5`
      }).join('\n')
      return `${cat.label} (promedio: ${avg}/5):\n${qLines}`
    }).join('\n\n')

    const prompt = `Sos un consultor experto en EOS (Entrepreneurial Operating System) y gestión organizacional.

Estás analizando los resultados de una Evaluación Organizacional completada por ${round.responses.length} líderes.

RESULTADOS:
Promedio general: ${totalAverage}/5

${categoryLines}

ESCALA: 1 = Muy débil · 2 = En desarrollo · 3 = En camino · 4 = Sólido · 5 = Excelente

Generá un análisis constructivo y accionable de la situación actual de la empresa. Respondé SOLO con un JSON válido con esta estructura:
{
  "resumen": "2-3 oraciones que sinteticen el estado general de la organización",
  "fortalezas": ["punto fuerte 1", "punto fuerte 2", "punto fuerte 3"],
  "areasDeAtencion": ["área crítica 1", "área crítica 2", "área crítica 3"],
  "recomendaciones": ["acción concreta 1", "acción concreta 2", "acción concreta 3", "acción concreta 4"],
  "interpretacion": "1-2 oraciones interpretando qué significa el score general para la madurez operativa"
}

Fortalezas = categorías/preguntas con score ≥ 3.5.
Áreas de atención = categorías/preguntas con score < 3.0.
Recomendaciones = acciones específicas y concretas, priorizadas por impacto.
Tono: directo, profesional, constructivo. Sin exagerar ni minimizar.`

    let analysis = null
    try {
      const response = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages:   [{ role: 'user', content: prompt }],
      })
      const text = response.content[0]?.text?.trim() || ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) analysis = JSON.parse(jsonMatch[0])
    } catch (aiErr) {
      console.error('[OrgAssessment] AI error:', aiErr.message)
    }

    // ── Guardar y cerrar ──────────────────────────────────────────────────────

    const resultData = JSON.stringify({
      respondentCount:  round.responses.length,
      totalAverage,
      categoryAverages,
      questionAverages,
      analysis,
    })

    const closed = await prisma.orgAssessmentRound.update({
      where: { id: roundId },
      data:  { status: 'closed', resultData, closedAt: new Date() },
    })

    res.json({
      id:           closed.id,
      status:       closed.status,
      closedAt:     closed.closedAt,
      resultData:   JSON.parse(closed.resultData),
    })
  } catch (err) { next(err) }
}

module.exports = { getAssessment, startRound, submitResponse, closeRound }
