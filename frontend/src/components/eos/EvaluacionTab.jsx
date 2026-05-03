import { useState, useEffect } from 'react'
import api from '../../api/client'

// ─── Preguntas (espejo del backend) ──────────────────────────────────────────

const CATEGORIES = [
  {
    id: 'vision', label: 'Visión', emoji: '🧭',
    questions: [
      { id: 1, text: 'Todos los líderes comparten la misma visión y están alineados al 100% sobre hacia dónde va la empresa.' },
      { id: 2, text: 'Todos en la organización conocen y pueden articular el Core Focus, los Core Values y los objetivos estratégicos (10, 3 y 1 año).' },
      { id: 3, text: 'La estrategia de marketing está claramente definida: cliente ideal, diferenciadores, proceso probado y garantía.' },
    ],
  },
  {
    id: 'personas', label: 'Personas', emoji: '👥',
    questions: [
      { id: 4, text: 'El 100% de los líderes son "personas correctas": comparten los valores de la empresa y están en el puesto adecuado.' },
      { id: 5, text: 'El 100% de los empleados son "personas correctas en puestos correctos": hacen lo que mejor hacen y les apasiona.' },
      { id: 6, text: 'Existe un organigrama claro con responsabilidades bien definidas, actualizado y conocido por todos.' },
    ],
  },
  {
    id: 'datos', label: 'Datos', emoji: '📊',
    questions: [
      { id: 7, text: 'El equipo de liderazgo revisa semanalmente un Scorecard con indicadores que reflejan el pulso real del negocio.' },
      { id: 8, text: 'Cada función/área tiene métricas claras y sabe en todo momento cómo está rindiendo.' },
      { id: 9, text: 'Las Rocas, metas e indicadores son medibles y se están alcanzando en tiempo.' },
    ],
  },
  {
    id: 'asuntos', label: 'Asuntos', emoji: '🔍',
    questions: [
      { id: 10, text: 'Somos excelentes identificando, discutiendo y resolviendo problemas rápido y de forma permanente.' },
      { id: 11, text: 'Mantenemos una lista de issues activa, priorizada y la trabajamos con regularidad.' },
      { id: 12, text: 'Los problemas se comunican y resuelven de forma efectiva en todos los niveles de la organización.' },
    ],
  },
  {
    id: 'procesos', label: 'Procesos', emoji: '⚙️',
    questions: [
      { id: 13, text: 'Los procesos clave están documentados, simplificados y seguidos de manera consistente por todos.' },
      { id: 14, text: 'Contamos con un proceso consistente para incorporar y capacitar a nuevas personas.' },
      { id: 15, text: 'Los procesos son escalables: funcionan bien independientemente de quién los ejecute.' },
    ],
  },
  {
    id: 'traccion', label: 'Tracción', emoji: '🚀',
    questions: [
      { id: 16, text: 'Todos establecen Rocas trimestrales y son responsables de cumplirlas (meta: 80% o más).' },
      { id: 17, text: 'Realizamos Level 10 Meetings semanales con agenda consistente, eficiencia y alta puntuación.' },
      { id: 18, text: 'Todo el equipo está 100% comprometido y remando en la misma dirección hacia los mismos objetivos.' },
    ],
  },
]

const SCORE_LABELS = ['', 'Muy débil', 'En desarrollo', 'En camino', 'Sólido', 'Excelente']
const SCORE_COLORS = ['', 'bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-blue-400', 'bg-green-500']
const SCORE_BG     = ['', 'bg-red-50 dark:bg-red-900/20', 'bg-orange-50 dark:bg-orange-900/20', 'bg-yellow-50 dark:bg-yellow-900/20', 'bg-blue-50 dark:bg-blue-900/20', 'bg-green-50 dark:bg-green-900/20']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(avg) {
  if (avg === null || avg === undefined) return 'text-gray-400'
  if (avg >= 4.0) return 'text-green-600 dark:text-green-400'
  if (avg >= 3.0) return 'text-blue-600 dark:text-blue-400'
  if (avg >= 2.0) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function scoreBand(avg) {
  if (avg === null || avg === undefined) return '—'
  if (avg >= 4.0) return 'Sólido'
  if (avg >= 3.0) return 'En camino'
  if (avg >= 2.0) return 'En desarrollo'
  return 'Débil'
}

function avatarUrl(avatar) {
  return avatar ? `/perfiles/${avatar}` : '/perfiles/2bee.png'
}

// ─── ScoreRing SVG ────────────────────────────────────────────────────────────

function ScoreRing({ value, max = 5 }) {
  const pct   = value ? value / max : 0
  const size  = 96
  const r     = 38
  const cx    = size / 2
  const cy    = size / 2
  const circ  = 2 * Math.PI * r
  const dash  = pct * circ
  const color = value >= 4 ? '#22c55e' : value >= 3 ? '#3b82f6' : value >= 2 ? '#eab308' : '#ef4444'

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} className="dark:stroke-gray-700" />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">{value ?? '—'}</p>
        <p className="text-[9px] text-gray-400">/5</p>
      </div>
    </div>
  )
}

// ─── CategoryBar ─────────────────────────────────────────────────────────────

function CategoryBar({ category, avg }) {
  const pct   = avg ? (avg / 5) * 100 : 0
  const color = avg >= 4 ? 'bg-green-500' : avg >= 3 ? 'bg-blue-400' : avg >= 2 ? 'bg-yellow-400' : 'bg-red-400'

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm w-5">{category.emoji}</span>
      <span className="text-xs text-gray-600 dark:text-gray-400 w-20 shrink-0">{category.label}</span>
      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold w-8 text-right ${scoreColor(avg)}`}>
        {avg ?? '—'}
      </span>
    </div>
  )
}

// ─── Questionnaire ────────────────────────────────────────────────────────────

function Questionnaire({ onSubmit, loading }) {
  const [answers, setAnswers] = useState({})

  const totalQ    = CATEGORIES.reduce((s, c) => s + c.questions.length, 0)
  const answered  = Object.keys(answers).length
  const complete  = answered === totalQ

  function setScore(questionId, score) {
    setAnswers(prev => ({ ...prev, [questionId]: score }))
  }

  function handleSubmit() {
    const arr = Object.entries(answers).map(([qId, score]) => ({
      questionId: Number(qId),
      score,
    }))
    onSubmit(arr)
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
          <div
            className="h-2 rounded-full bg-primary-500 transition-all"
            style={{ width: `${(answered / totalQ) * 100}%` }}
          />
        </div>
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 shrink-0">
          {answered} / {totalQ} respondidas
        </span>
      </div>

      {/* Categories */}
      {CATEGORIES.map(cat => (
        <div key={cat.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {cat.emoji} {cat.label}
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {cat.questions.map((q, qi) => (
              <div key={q.id} className="px-5 py-4">
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 leading-relaxed">
                  <span className="text-xs font-bold text-gray-400 mr-2">{q.id}.</span>
                  {q.text}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {[1, 2, 3, 4, 5].map(score => {
                    const selected = answers[q.id] === score
                    return (
                      <button
                        key={score}
                        onClick={() => setScore(q.id, score)}
                        className={`flex-1 min-w-[80px] py-2 px-1 rounded-lg text-xs font-medium transition-all border-2 ${
                          selected
                            ? `${SCORE_COLORS[score].replace('bg-', 'bg-').replace('500', '500').replace('400', '400')} text-white border-transparent`
                            : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-400'
                        }`}
                        style={selected ? { backgroundColor: score === 1 ? '#ef4444' : score === 2 ? '#fb923c' : score === 3 ? '#facc15' : score === 4 ? '#60a5fa' : '#22c55e' } : {}}
                      >
                        <span className="block text-base font-bold mb-0.5">{score}</span>
                        <span className="block text-[10px] leading-tight">{SCORE_LABELS[score]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!complete || loading}
        className="w-full py-3 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors"
      >
        {loading ? 'Enviando…' : complete ? 'Enviar mi evaluación' : `Completá las ${totalQ - answered} preguntas restantes`}
      </button>
    </div>
  )
}

// ─── ResultCard ───────────────────────────────────────────────────────────────

function ResultCard({ result, closedAt, respondentCount }) {
  const { totalAverage, categoryAverages, analysis } = result

  return (
    <div className="space-y-5">
      {/* Header con score */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-6">
          <ScoreRing value={totalAverage} />
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalAverage}<span className="text-base text-gray-400">/5</span></p>
            <p className={`text-sm font-semibold ${scoreColor(totalAverage)}`}>{scoreBand(totalAverage)}</p>
            <p className="text-xs text-gray-400 mt-1">
              Promedio de {respondentCount} {respondentCount === 1 ? 'evaluación' : 'evaluaciones'}
              {closedAt && ` · ${new Date(closedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}`}
            </p>
          </div>
        </div>
      </div>

      {/* Barras por categoría */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">Resultado por componente</h3>
        {CATEGORIES.map(cat => (
          <CategoryBar key={cat.id} category={cat} avg={categoryAverages?.[cat.id]} />
        ))}
      </div>

      {/* Análisis IA */}
      {analysis && (
        <div className="space-y-3">
          {/* Resumen */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Análisis ejecutivo</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{analysis.resumen}</p>
            {analysis.interpretacion && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 leading-relaxed italic">{analysis.interpretacion}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Fortalezas */}
            {analysis.fortalezas?.length > 0 && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 mb-3">✓ Fortalezas</h3>
                <ul className="space-y-2">
                  {analysis.fortalezas.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-green-800 dark:text-green-300">
                      <span className="mt-1 shrink-0 text-green-500">→</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Áreas de atención */}
            {analysis.areasDeAtencion?.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400 mb-3">⚠ Áreas de atención</h3>
                <ul className="space-y-2">
                  {analysis.areasDeAtencion.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-red-800 dark:text-red-300">
                      <span className="mt-1 shrink-0 text-red-500">→</span> {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Recomendaciones */}
          {analysis.recomendaciones?.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-3">🚀 Próximos pasos recomendados</h3>
              <ol className="space-y-2">
                {analysis.recomendaciones.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-blue-800 dark:text-blue-300">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    {r}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── EvaluacionTab ────────────────────────────────────────────────────────────

export default function EvaluacionTab() {
  const [state, setState]           = useState(null)  // { adminMembers, currentRound, history }
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [closing, setClosing]       = useState(false)
  const [view, setView]             = useState('current') // 'current' | 'history'
  const [selectedHistory, setSelectedHistory] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      const { data } = await api.get('/eos/assessment')
      setState(data)
    } catch {
      setState(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleStart() {
    try {
      await api.post('/eos/assessment/start')
      await load()
    } catch {}
  }

  async function handleSubmit(answers) {
    if (!state?.currentRound) return
    try {
      setSubmitting(true)
      await api.post(`/eos/assessment/rounds/${state.currentRound.id}/response`, { answers })
      await load()
    } catch {
    } finally {
      setSubmitting(false)
    }
  }

  async function handleClose() {
    if (!state?.currentRound) return
    if (!confirm('¿Generar el resultado y análisis ahora? No podrán agregarse más respuestas.')) return
    try {
      setClosing(true)
      await api.post(`/eos/assessment/rounds/${state.currentRound.id}/close`)
      await load()
    } catch {
    } finally {
      setClosing(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  const { adminMembers = [], currentRound, history = [] } = state || {}
  const hasSubmitted = currentRound?.myAnswers !== null && currentRound?.myAnswers !== undefined

  // ── Resultado del round actual cerrado (si acaba de cerrarse) ──────────────
  // Después de close, currentRound ya no existe → aparece en history[0]
  const latestClosed = history[0]

  return (
    <div className="space-y-5">
      {/* Nav interna si hay historial */}
      {history.length > 0 && (
        <div className="flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1 w-fit">
          <button
            onClick={() => setView('current')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              view === 'current'
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Evaluación actual
          </button>
          <button
            onClick={() => setView('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              view === 'history'
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Historial ({history.length})
          </button>
        </div>
      )}

      {/* ── Historial ── */}
      {view === 'history' && (
        <div className="space-y-4">
          {selectedHistory ? (
            <div className="space-y-4">
              <button
                onClick={() => setSelectedHistory(null)}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
              >
                ← Volver al historial
              </button>
              <ResultCard
                result={selectedHistory.resultData}
                closedAt={selectedHistory.closedAt}
                respondentCount={selectedHistory.respondentCount}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Evaluaciones anteriores</h3>
              {history.map(round => (
                <button
                  key={round.id}
                  onClick={() => setSelectedHistory(round)}
                  className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-primary-400 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        Evaluación del {new Date(round.closedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {round.respondentCount} {round.respondentCount === 1 ? 'respuesta' : 'respuestas'}
                      </p>
                    </div>
                    {round.resultData?.totalAverage && (
                      <div className="text-right">
                        <p className={`text-lg font-bold ${scoreColor(round.resultData.totalAverage)}`}>
                          {round.resultData.totalAverage}<span className="text-xs text-gray-400">/5</span>
                        </p>
                        <p className={`text-xs ${scoreColor(round.resultData.totalAverage)}`}>
                          {scoreBand(round.resultData.totalAverage)}
                        </p>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Evaluación actual ── */}
      {view === 'current' && (
        <>
          {/* Sin round activo */}
          {!currentRound && (
            <div className="text-center py-12 space-y-4">
              <p className="text-5xl">📋</p>
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-1">Evaluación Organizacional EOS</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                  18 preguntas agrupadas en los 6 componentes del EOS. Cada líder del equipo las califica del 1 al 5. El resultado es el promedio de todas las respuestas, con análisis de IA.
                </p>
              </div>
              <button
                onClick={handleStart}
                className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Iniciar nueva evaluación
              </button>
            </div>
          )}

          {/* Round abierto — el usuario no respondió todavía */}
          {currentRound && !hasSubmitted && (
            <div className="space-y-5">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Evaluación en curso</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                    {currentRound.respondentCount} {currentRound.respondentCount === 1 ? 'persona ha respondido' : 'personas han respondido'}.
                    Completá tu evaluación para sumarla al resultado.
                  </p>
                </div>
                <div className="flex -space-x-2">
                  {currentRound.respondents.map(r => (
                    <img key={r.id} src={avatarUrl(r.avatar)} alt={r.name} title={`${r.name} ya respondió`}
                      className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 object-cover" />
                  ))}
                </div>
              </div>
              <Questionnaire onSubmit={handleSubmit} loading={submitting} />
            </div>
          )}

          {/* Round abierto — el usuario YA respondió */}
          {currentRound && hasSubmitted && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-5 py-4">
                <p className="text-sm font-semibold text-green-800 dark:text-green-300 mb-1">✓ Ya enviaste tu evaluación</p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  El resultado se calcula con todas las respuestas disponibles. Podés generar el análisis ahora o esperar a que más líderes respondan.
                </p>
              </div>

              {/* Quiénes respondieron */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                  {currentRound.respondentCount} de {adminMembers.length} admins respondieron
                </p>
                <div className="flex flex-wrap gap-3">
                  {adminMembers.map(member => {
                    const responded = currentRound.respondents.some(r => r.id === member.id)
                    return (
                      <div key={member.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
                        responded
                          ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                      }`}>
                        <img src={avatarUrl(member.avatar)} alt={member.name} className="w-5 h-5 rounded-full object-cover" />
                        {member.name}
                        {responded && <span className="text-green-500">✓</span>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Botón generar resultado */}
              <button
                onClick={handleClose}
                disabled={closing}
                className="w-full py-3 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-40 rounded-xl transition-colors"
              >
                {closing ? 'Generando análisis…' : `✨ Ver resultado y análisis IA (${currentRound.respondentCount} ${currentRound.respondentCount === 1 ? 'respuesta' : 'respuestas'})`}
              </button>

              {currentRound.respondentCount < adminMembers.length && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                  Podés esperar a que los otros {adminMembers.length - currentRound.respondentCount} admins respondan, o generar el resultado ahora.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
