import { useState, useEffect, useCallback } from 'react'
import DOMPurify from 'dompurify'
import api from '../api/client'
import Navbar from '../components/Navbar'
import RichTextEditor from '../components/RichTextEditor'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import '../components/situation-editor.css'

// La descripción puede ser HTML (RichTextEditor) o texto plano (desafíos legacy).
// Se detecta HTML por la presencia de un tag; el texto plano se renderiza respetando
// los saltos de línea con `whitespace-pre-line`.
const looksLikeHtml = (s) => /<[a-z][\s\S]*>/i.test(s || '')
// El editor devuelve "<p></p>" cuando está vacío: se trata como sin descripción.
const htmlIsEmpty = (s) => !(s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const STATUS_PILL = {
  draft:    { label: 'Borrador',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  active:   { label: 'Activo',    cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  finished: { label: 'Finalizado', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  archived: { label: 'Archivado', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
}

const SUBJECT_LABEL = { project: 'Proyectos', person: 'Personas', team: 'Equipos' }

function visibilitySummary(rule = {}) {
  const mode = rule.mode || 'always'
  if (mode === 'always') return 'Siempre visible'
  if (mode === 'date_range') return 'Entre fechas'
  if (mode === 'recurring') {
    if (rule.kind === 'last_n_days_of_month') return `Últimos ${rule.n || 7} días del mes`
    if (rule.kind === 'first_n_days_of_month') return `Primeros ${rule.n || 7} días del mes`
    if (rule.kind === 'day_range_of_month') return `Días ${rule.fromDay}–${rule.toDay} del mes`
    if (rule.kind === 'weekdays') return `${(rule.weekdays || []).map((d) => WEEKDAYS[d]).join(', ') || '—'}`
  }
  return mode
}

export default function Gamification() {
  const { enabled, loading: flagLoading } = useFeatureFlag('gamification')
  const [games, setGames] = useState([])
  const [catalog, setCatalog] = useState([])
  const [metrics, setMetrics] = useState([])
  const [metricCategories, setMetricCategories] = useState([])
  const [members, setMembers] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')     // all | active | draft | finished
  const [editing, setEditing] = useState(null)   // game o {} para nuevo
  const [scoresFor, setScoresFor] = useState(null) // game manual para cargar puntos
  const [detailFor, setDetailFor] = useState(null) // game para ver detalle (votación/quiz)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get('/gamification/games'),
      api.get('/gamification/catalog'),
      api.get('/workspaces/current/members'),
      api.get('/projects'),
    ]).then(([g, c, m, p]) => {
      setGames(g.data.games || [])
      setCatalog(c.data.types || [])
      setMetrics(c.data.marketingMetrics || [])
      setMetricCategories(c.data.marketingCategories || [])
      setMembers((m.data || []).filter((u) => u.active))
      setProjects((p.data || []).filter((pr) => pr.active !== false))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (enabled) load() }, [enabled, load])

  async function setStatus(game, status) {
    await api.patch(`/gamification/games/${game.id}`, { status })
    load()
  }
  async function finish(game) {
    if (!window.confirm('¿Finalizar el juego y proclamar al ganador según el ranking actual?')) return
    const { data } = await api.post(`/gamification/games/${game.id}/finish`)
    load()
    if (data.winner) window.alert(`🏆 Ganador: ${data.winner.label} (${data.winner.score} pts)`)
    else window.alert('El juego se finalizó, pero todavía nadie tiene puntaje.')
  }
  async function remove(game) {
    if (!window.confirm(`¿Eliminar el juego "${game.title}"? Esta acción no se puede deshacer.`)) return
    await api.delete(`/gamification/games/${game.id}`)
    load()
  }
  // Archivar oculta el juego del botón flotante 🏆 al instante (sin esperar los 7 días
  // de gracia post-finalización). Reactivar lo vuelve a dejar como "finalizado".
  async function archive(game) { await setStatus(game, 'archived') }
  async function unarchive(game) { await setStatus(game, 'finished') }
  // Sube (dir=-1) o baja (dir=+1) un juego DENTRO del subconjunto de activos y persiste
  // el orden completo. Los juegos que no están activos mantienen su posición relativa.
  async function move(game, dir) {
    const byId = new Map(games.map((g) => [g.id, g]))
    const activeIds = games.filter((g) => g.status === 'active').map((g) => g.id)
    const idx = activeIds.indexOf(game.id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= activeIds.length) return
    ;[activeIds[idx], activeIds[swap]] = [activeIds[swap], activeIds[idx]]

    let ai = 0
    const next = games.map((g) => (g.status === 'active' ? byId.get(activeIds[ai++]) : g))
    setGames(next) // optimista
    try {
      await api.put('/gamification/games/reorder', { orderedIds: next.map((g) => g.id) })
    } catch { load() } // revertir si falla
  }

  if (flagLoading) return null
  if (!enabled) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="text-5xl mb-4">🏆</p>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Gamification no está habilitado</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Pedile al equipo de BlissTracker que active el módulo, o revisá Preferencias → Módulos adicionales.</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🏆 Gamification</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Creá juegos y desafíos para el equipo. Cuando un juego está <strong>activo</strong> y dentro de su ventana, aparece para todos con el botón flotante 🏆.
            </p>
          </div>
          <button
            onClick={() => setEditing({})}
            className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors shadow-sm"
          >
            + Nuevo juego
          </button>
        </div>

        {games.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {[
              { k: 'all', label: 'Todos' },
              { k: 'active', label: 'Activos' },
              { k: 'draft', label: 'Borradores' },
              { k: 'finished', label: 'Finalizados' },
              { k: 'archived', label: 'Archivados' },
            ].map((f) => {
              const n = f.k === 'all' ? games.length : games.filter((g) => g.status === f.k).length
              return (
                <button
                  key={f.k}
                  onClick={() => setFilter(f.k)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${filter === f.k ? 'bg-primary-600 text-white' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  {f.label} <span className="opacity-60">{n}</span>
                </button>
              )
            })}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : games.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
            <p className="text-4xl mb-3">🎯</p>
            <p className="text-gray-700 dark:text-gray-200 font-medium mb-1">Todavía no hay juegos</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Creá tu primer desafío: una competencia, una votación o un puntaje manual.</p>
            <button onClick={() => setEditing({})} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl">+ Nuevo juego</button>
          </div>
        ) : (
          <div className="space-y-3">
            {games.length > 1 && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {filter === 'active'
                  ? 'Usá ▲▼ para ordenar los juegos activos. Por defecto el más nuevo va primero (arriba); el orden se respeta también en el botón flotante 🏆 que ve el equipo.'
                  : 'Para reordenar los juegos, cambiá el filtro a «Activos».'}
              </p>
            )}
            {games.filter((g) => filter === 'all' || g.status === filter).map((g, i, arr) => (
              <GameCard
                key={g.id}
                game={g}
                reorderable={filter === 'active'}
                canMoveUp={filter === 'active' && i > 0}
                canMoveDown={filter === 'active' && i < arr.length - 1}
                onMoveUp={() => move(g, -1)}
                onMoveDown={() => move(g, +1)}
                onEdit={() => setEditing(g)}
                onScores={() => setScoresFor(g)}
                onDetail={() => setDetailFor(g)}
                onActivate={() => setStatus(g, 'active')}
                onPause={() => setStatus(g, 'draft')}
                onFinish={() => finish(g)}
                onArchive={() => archive(g)}
                onUnarchive={() => unarchive(g)}
                onRemove={() => remove(g)}
              />
            ))}
          </div>
        )}
      </main>

      {editing !== null && (
        <GameEditor
          game={editing.id ? editing : null}
          catalog={catalog}
          metrics={metrics}
          metricCategories={metricCategories}
          members={members}
          projects={projects}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}

      {scoresFor && (
        <ManualScores
          game={scoresFor}
          members={members}
          projects={projects}
          onClose={() => setScoresFor(null)}
          onSaved={() => { setScoresFor(null); load() }}
        />
      )}

      {detailFor && <GameDetailModal game={detailFor} onClose={() => setDetailFor(null)} />}
    </div>
  )
}

// ─── Card de un juego ─────────────────────────────────────────────────────────

function GameCard({ game, reorderable, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onEdit, onScores, onDetail, onActivate, onPause, onFinish, onArchive, onUnarchive, onRemove }) {
  const pill = STATUS_PILL[game.status] || STATUS_PILL.draft
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        {reorderable && (
          <div className="flex flex-col gap-1 shrink-0 pt-0.5">
            <ReorderBtn title="Subir" disabled={!canMoveUp} onClick={onMoveUp}>▲</ReorderBtn>
            <ReorderBtn title="Bajar" disabled={!canMoveDown} onClick={onMoveDown}>▼</ReorderBtn>
          </div>
        )}
        <div className="flex-1 min-w-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${pill.cls}`}>{pill.label}</span>
            {game.status === 'active' && (
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${game.visibleNow ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                {game.visibleNow ? 'Visible ahora' : 'Fuera de ventana'}
              </span>
            )}
            <span className="text-[11px] text-gray-400">{game.typeName}</span>
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">{game.title}</h3>
          {game.description && (
            looksLikeHtml(game.description)
              ? <div className="situation-content text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(game.description) }} />
              : <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 whitespace-pre-line">{game.description}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span>👥 {SUBJECT_LABEL[game.subjectType]}</span>
            <span>
              👁 {game.status === 'finished'
                ? 'Visible en 🏆 unos días más (podés ocultarlo ya con "Ocultar del 🏆")'
                : game.status === 'archived'
                  ? 'Oculto del 🏆 del equipo'
                  : visibilitySummary(game.visibilityRule)}
            </span>
            {game.prize && <span>🎁 {game.prize}</span>}
            {game.winnerSubject && <span className="text-blue-600 dark:text-blue-300">🏆 {game.winnerSubject.label} ({game.winnerSubject.score})</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        {game.status === 'draft' && <Btn onClick={onActivate} kind="primary">▶ Activar</Btn>}
        {game.status === 'active' && <Btn onClick={onPause}>⏸ Pausar</Btn>}
        {game.scoring === 'manual' && game.status !== 'finished' && <Btn onClick={onScores}>🔢 Cargar puntos</Btn>}
        {(game.scoring === 'vote' || game.scoring === 'quiz') && <Btn onClick={onDetail}>{game.scoring === 'vote' ? '👁 Ver votación' : '👁 Ver resultados'}</Btn>}
        <Btn onClick={onEdit}>✏️ Editar</Btn>
        {['draft', 'active'].includes(game.status) && <Btn onClick={onFinish}>🏁 Finalizar</Btn>}
        {game.status === 'finished' && <Btn onClick={onArchive}>🗄 Ocultar del 🏆</Btn>}
        {game.status === 'archived' && <Btn onClick={onUnarchive}>↩ Reactivar</Btn>}
        <Btn onClick={onRemove} kind="danger">🗑 Eliminar</Btn>
      </div>
        </div>
      </div>
    </div>
  )
}

// Flecha de reordenamiento (▲/▼). Deshabilitada en los extremos de la lista.
function ReorderBtn({ children, onClick, disabled, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-6 h-6 flex items-center justify-center text-xs rounded-md border transition-colors ${
        disabled
          ? 'text-gray-300 dark:text-gray-600 border-gray-100 dark:border-gray-700 cursor-not-allowed'
          : 'text-gray-500 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function Btn({ children, onClick, kind }) {
  const cls = kind === 'primary'
    ? 'text-white bg-primary-600 hover:bg-primary-700'
    : kind === 'danger'
      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-900/40'
      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600'
  return <button onClick={onClick} className={`text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${cls}`}>{children}</button>
}

// ─── Editor de juego (crear/editar) ───────────────────────────────────────────

function GameEditor({ game, catalog, metrics, metricCategories, members, projects, onClose, onSaved }) {
  const isNew = !game
  const [type, setType] = useState(game?.type || '')
  const def = catalog.find((c) => c.key === type) || null

  const [title, setTitle] = useState(game?.title || '')
  const [description, setDescription] = useState(game?.description || '')
  const [prize, setPrize] = useState(game?.prize || '')
  const [subjectType, setSubjectType] = useState(game?.subjectType || 'team')
  const [projectIds, setProjectIds] = useState(game?.config?.projectIds || [])
  const [candidateIds, setCandidateIds] = useState(game?.config?.candidateIds || [])
  const [metric, setMetric] = useState(game?.config?.metric || '')
  const [adsPlatform, setAdsPlatform] = useState(game?.config?.adsPlatform || '')
  const [imageFile, setImageFile] = useState(null)
  const [removeImg, setRemoveImg] = useState(false)
  const [questions, setQuestions] = useState([])
  const apiUrl = import.meta.env.VITE_API_URL || ''
  const showExistingImg = game?.hasImage && !removeImg && !imageFile

  // Carga las preguntas existentes al editar un cuestionario.
  useEffect(() => {
    if (game?.id && game.scoring === 'quiz') {
      api.get(`/gamification/games/${game.id}`)
        .then(({ data }) => setQuestions((data.questions || []).map((q) => ({ kind: q.kind || 'multiple_choice', text: q.text, options: q.options || [], correctOptionId: q.correctOptionId, points: q.points }))))
        .catch(() => {})
    }
  }, [game?.id, game?.scoring])
  const [startDate, setStartDate] = useState(game?.startDate ? game.startDate.slice(0, 10) : '')
  const [endDate, setEndDate] = useState(game?.endDate ? game.endDate.slice(0, 10) : '')
  const [vis, setVis] = useState(game?.visibilityRule || { mode: 'always' })
  const [hideLiveResults, setHideLiveResults] = useState(game?.config?.hideLiveResults !== false)
  const [withPoints, setWithPoints] = useState(game?.config?.withPoints !== false)
  const [participationPoints, setParticipationPoints] = useState(game?.config?.participationPoints || 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Al elegir un tipo nuevo, precargar defaults del catálogo.
  function chooseType(key) {
    setType(key)
    const d = catalog.find((c) => c.key === key)
    if (d) {
      setSubjectType(d.subjectType)
      setVis(d.defaultVisibility || { mode: 'always' })
    }
  }

  const scoring = def?.scoring || game?.scoring
  const effSubjectType = def?.subjectConfigurable ? subjectType : (def?.subjectType || game?.subjectType)
  const metricDef = metrics.find((m) => m.key === metric) || null

  async function save(activate) {
    setError('')
    if (!type) return setError('Elegí un tipo de juego')
    if (!title.trim()) return setError('El enunciado es obligatorio')
    if (def?.metricRequired && !metric) return setError('Elegí la métrica de la competencia')
    if (metricDef?.needsPlatform && !adsPlatform) return setError('Elegí la plataforma de anuncios (Meta o Google)')
    if (def?.requiresPeriod && (!startDate || !endDate)) return setError('Este juego necesita fecha de inicio y fin')
    if (scoring === 'quiz') {
      if (activate && questions.length === 0) return setError('Agregá al menos una pregunta para activar el cuestionario')
      for (let i = 0; i < questions.length; i++) {
        if (!questions[i].text.trim()) return setError(`La pregunta ${i + 1} no tiene enunciado`)
        if (questions[i].kind === 'open') continue // abierta: solo requiere enunciado
        const opts = questions[i].options.filter((o) => o.text.trim())
        if (opts.length < 2) return setError(`La pregunta ${i + 1} necesita al menos 2 opciones`)
        // Sin puntos (encuesta de preferencia) no hace falta marcar una respuesta correcta.
        if (withPoints && !opts.some((o) => o.id === questions[i].correctOptionId)) return setError(`Marcá la opción correcta de la pregunta ${i + 1}`)
      }
    }

    const config = {}
    if (scoring === 'auto_metric') {
      config.projectIds = projectIds
      if (def?.metricRequired) { config.metric = metric; if (metricDef?.needsPlatform) config.adsPlatform = adsPlatform }
    }
    if (scoring === 'vote') { config.candidateIds = candidateIds; config.hideLiveResults = hideLiveResults }
    if (scoring === 'quiz') {
      config.withPoints = withPoints
      // Puntos por participar: solo aplica en el modo "sin respuesta correcta" (exclusivo con withPoints).
      if (!withPoints && Number(participationPoints) > 0) config.participationPoints = Number(participationPoints)
    }

    const payload = {
      title: title.trim(),
      description: htmlIsEmpty(description) ? null : description,
      prize: prize.trim() || null,
      config,
      visibilityRule: vis,
      startDate: startDate || null,
      endDate: endDate || null,
    }
    if (def?.subjectConfigurable) payload.subjectType = subjectType

    setSaving(true)
    try {
      let gameId = game?.id
      if (isNew) {
        payload.type = type
        if (activate) payload.status = 'active'
        const { data } = await api.post('/gamification/games', payload)
        gameId = data.game.id
      } else {
        if (activate) payload.status = 'active'
        await api.patch(`/gamification/games/${game.id}`, payload)
      }
      // Imagen: subir la nueva, o quitar la existente.
      if (gameId) {
        if (imageFile) {
          const fd = new FormData()
          fd.append('image', imageFile)
          await api.post(`/gamification/games/${gameId}/image`, fd)
        } else if (removeImg && game?.hasImage) {
          await api.delete(`/gamification/games/${gameId}/image`)
        }
      }
      // Cuestionario: guardar las preguntas.
      if (gameId && scoring === 'quiz') {
        await api.put(`/gamification/games/${gameId}/questions`, { questions })
      }
      onSaved()
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo guardar')
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} title={isNew ? 'Nuevo juego' : 'Editar juego'}>
      {/* Tipo */}
      {isNew ? (
        <Field label="Tipo de juego">
          <div className="space-y-2">
            {catalog.map((c) => (
              <button
                key={c.key}
                onClick={() => chooseType(c.key)}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${type === c.key ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
              >
                <p className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.description}</p>
              </button>
            ))}
          </div>
        </Field>
      ) : (
        <p className="text-xs text-gray-400 mb-3">{def?.name || game.typeName}</p>
      )}

      {type && (
        <>
          <Field label="Enunciado del desafío">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: ¿Qué proyecto suma más seguidores en junio?" className={inputCls} />
          </Field>
          {scoring === 'quiz' && (
            <Field label="¿Cómo suma puntos este cuestionario?">
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                  <input type="radio" name="quiz-scoring-mode" checked={withPoints} onChange={() => setWithPoints(true)} className="mt-0.5" />
                  <span>Suma puntos por respuestas
                    <span className="block text-xs text-gray-400">Cada pregunta de opción múltiple tiene una respuesta correcta y otorga sus puntos a quien acierte.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                  <input type="radio" name="quiz-scoring-mode" checked={!withPoints} onChange={() => setWithPoints(false)} className="mt-0.5" />
                  <span>Suma puntos por participar
                    <span className="block text-xs text-gray-400">No hay respuesta correcta — ideal para preguntas de gustos/preferencias con las que el equipo toma una decisión. Todos suman los mismos puntos por responder y completar el cuestionario, y en "Ver resultados" vas a ver qué respondió cada uno.</span>
                  </span>
                </label>
              </div>
              {!withPoints && (
                <div className="mt-2 pl-6">
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                    Puntos por participar:
                    <input type="number" min={0} value={participationPoints} onChange={(e) => setParticipationPoints(Number(e.target.value) || 0)} className="w-20 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
                  </label>
                  <p className="text-[11px] text-gray-400 mt-1">Dejalo en 0 si es solo informativo (sin ranking ni puntaje).</p>
                </div>
              )}
            </Field>
          )}
          <Field label="Descripción (opcional)">
            <RichTextEditor
              defaultContent={description}
              onChange={setDescription}
              minHeight={100}
              autoFocus={false}
            />
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Podés usar negrita, listas y saltos de línea para que se lea mejor.</p>
          </Field>
          <Field label="Imagen (opcional)">
            <p className="text-xs text-gray-400 mb-1.5">Recomendado: <strong>1200 × 400 px</strong> (relación 3:1, apaisada). PNG, JPG o WebP, hasta 5 MB.</p>
            {(imageFile || showExistingImg) && (
              <div className="relative mb-2">
                <img
                  src={imageFile ? URL.createObjectURL(imageFile) : `${apiUrl}/api/gamification/games/${game.id}/image?v=${encodeURIComponent(game.updatedAt)}`}
                  alt=""
                  className="w-full aspect-[3/1] object-cover rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700"
                />
                <button type="button" onClick={() => { setImageFile(null); setRemoveImg(true) }} className="absolute top-1.5 right-1.5 bg-black/55 hover:bg-black/70 text-white text-xs font-medium px-2 py-1 rounded-lg">Quitar</button>
              </div>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => { setImageFile(e.target.files?.[0] || null); setRemoveImg(false) }}
              className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/30 dark:file:text-primary-300"
            />
          </Field>
          <Field label="Premio (opcional)">
            <input value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="Ej: Día libre / Almuerzo del equipo" className={inputCls} />
          </Field>

          {/* Sujeto configurable (solo custom) */}
          {def?.subjectConfigurable && (
            <Field label="¿Quiénes compiten?">
              <select value={subjectType} onChange={(e) => setSubjectType(e.target.value)} className={inputCls}>
                <option value="person">Personas</option>
                <option value="project">Proyectos</option>
                <option value="team">Equipos custom</option>
              </select>
            </Field>
          )}

          {/* Config por scoring */}
          {scoring === 'auto_metric' && (
            <>
              {def?.metricRequired && (
                <Field label="¿Qué métrica define al ganador?">
                  <select value={metric} onChange={(e) => { setMetric(e.target.value); setAdsPlatform('') }} className={inputCls}>
                    <option value="">Elegí una métrica…</option>
                    {metricCategories.map((cat) => (
                      <optgroup key={cat.key} label={cat.label}>
                        {metrics.filter((m) => m.category === cat.key).map((m) => (
                          <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {metricDef?.needsPlatform && (
                    <select value={adsPlatform} onChange={(e) => setAdsPlatform(e.target.value)} className={`${inputCls} mt-2`}>
                      <option value="">Plataforma de anuncios…</option>
                      <option value="meta_ads">Meta Ads</option>
                      <option value="google_ads">Google Ads</option>
                    </select>
                  )}
                </Field>
              )}
              <Field label="Proyectos que participan (vacío = todos)">
                <CheckList items={projects.map((p) => ({ id: p.id, label: p.name }))} selected={projectIds} onChange={setProjectIds} />
              </Field>
            </>
          )}
          {scoring === 'vote' && (
            <>
              <Field label="Candidatos (vacío = todo el equipo)">
                <CheckList items={members.map((m) => ({ id: m.id, label: m.name }))} selected={candidateIds} onChange={setCandidateIds} />
              </Field>
              <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200 mb-3 cursor-pointer">
                <input type="checkbox" checked={hideLiveResults} onChange={(e) => setHideLiveResults(e.target.checked)} className="rounded mt-0.5" />
                <span>Ocultar los votos hasta que finalice la votación <span className="block text-xs text-gray-400">Nadie ve quién va ganando mientras está abierta. Recomendado.</span></span>
              </label>
            </>
          )}
          {scoring === 'manual' && effSubjectType !== 'team' && (
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1 mb-3">
              Después de guardar el juego vas a poder cargar los puntos con el botón <strong>🔢 Cargar puntos</strong>.
            </p>
          )}
          {scoring === 'quiz' && (
            <Field label="Preguntas">
              <QuizEditor questions={questions} setQuestions={setQuestions} withPoints={withPoints} />
            </Field>
          )}
          {effSubjectType === 'team' && (
            isNew ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1 mb-3">
                Guardá el juego y volvé a abrirlo (✏️ Editar) para armar los equipos y luego cargar sus puntos.
              </p>
            ) : (
              <Field label="Equipos">
                <TeamsManager game={game} members={members} projects={projects} />
              </Field>
            )
          )}

          {/* Período (date_range / auto_metric) */}
          {(def?.requiresPeriod || vis.mode === 'date_range') && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inicio"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} /></Field>
              <Field label="Fin"><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} /></Field>
            </div>
          )}

          {/* Visibilidad */}
          <VisibilityEditor vis={vis} setVis={setVis} />

          {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}

          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">Cancelar</button>
            <button disabled={saving} onClick={() => save(false)} className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-xl disabled:opacity-50">Guardar borrador</button>
            <button disabled={saving} onClick={() => save(true)} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar y activar'}</button>
          </div>
        </>
      )}
    </Modal>
  )
}

function VisibilityEditor({ vis, setVis }) {
  const mode = vis.mode || 'always'
  function set(patch) { setVis({ ...vis, ...patch }) }
  return (
    <Field label="¿Cuándo se muestra a los usuarios?">
      <select value={mode} onChange={(e) => set({ mode: e.target.value })} className={inputCls}>
        <option value="always">Siempre (mientras esté activo)</option>
        <option value="date_range">Entre fechas (usa Inicio/Fin de arriba)</option>
        <option value="recurring">Ventana recurrente del mes/semana</option>
      </select>
      {mode === 'recurring' && (
        <div className="mt-2 space-y-2">
          <select value={vis.kind || 'last_n_days_of_month'} onChange={(e) => set({ kind: e.target.value })} className={inputCls}>
            <option value="last_n_days_of_month">Últimos N días del mes</option>
            <option value="first_n_days_of_month">Primeros N días del mes</option>
            <option value="day_range_of_month">Rango de días del mes</option>
            <option value="weekdays">Días de la semana</option>
          </select>
          {(vis.kind === 'last_n_days_of_month' || vis.kind === 'first_n_days_of_month' || !vis.kind) && (
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              N días: <input type="number" min={1} max={28} value={vis.n ?? 7} onChange={(e) => set({ n: Number(e.target.value) })} className="w-20 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
            </label>
          )}
          {vis.kind === 'day_range_of_month' && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              Del día <input type="number" min={1} max={31} value={vis.fromDay ?? 1} onChange={(e) => set({ fromDay: Number(e.target.value) })} className="w-16 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
              al <input type="number" min={1} max={31} value={vis.toDay ?? 31} onChange={(e) => set({ toDay: Number(e.target.value) })} className="w-16 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
            </div>
          )}
          {vis.kind === 'weekdays' && (
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((w, i) => {
                const on = (vis.weekdays || []).includes(i)
                return (
                  <button key={i} onClick={() => set({ weekdays: on ? (vis.weekdays || []).filter((d) => d !== i) : [...(vis.weekdays || []), i] })}
                    className={`px-2 py-1 rounded-lg text-xs font-medium ${on ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{w}</button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Field>
  )
}

// ─── Gestor de equipos custom (por juego) ─────────────────────────────────────

function TeamsManager({ game, members, projects }) {
  const [teams, setTeams] = useState(game.teams || [])
  const [editing, setEditing] = useState(null) // team | {} (nuevo) | null

  async function saveTeam(payload) {
    if (editing.id) {
      const { data } = await api.patch(`/gamification/games/${game.id}/teams/${editing.id}`, payload)
      setTeams((t) => t.map((x) => x.id === editing.id ? data.team : x))
    } else {
      const { data } = await api.post(`/gamification/games/${game.id}/teams`, payload)
      setTeams((t) => [...t, data.team])
    }
    setEditing(null)
  }
  async function del(id) {
    if (!window.confirm('¿Eliminar el equipo?')) return
    await api.delete(`/gamification/games/${game.id}/teams/${id}`)
    setTeams((t) => t.filter((x) => x.id !== id))
  }

  return (
    <div className="space-y-2">
      {teams.length === 0 && <p className="text-xs text-gray-400">Todavía no hay equipos.</p>}
      {teams.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2">
          <span className="min-w-0">
            <span className="font-medium text-gray-800 dark:text-gray-100">{t.name}</span>
            <span className="text-xs text-gray-400 ml-2">{(t.memberIds || []).length} pers · {(t.projectIds || []).length} proy</span>
          </span>
          <span className="flex gap-1 shrink-0">
            <button onClick={() => setEditing(t)} className="text-xs px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">✏️</button>
            <button onClick={() => del(t.id)} className="text-xs px-2 py-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">🗑</button>
          </span>
        </div>
      ))}
      {editing ? (
        <TeamForm team={editing} members={members} projects={projects} onSave={saveTeam} onCancel={() => setEditing(null)} />
      ) : (
        <button onClick={() => setEditing({})} className="text-sm text-primary-600 dark:text-primary-400 font-medium">+ Agregar equipo</button>
      )}
    </div>
  )
}

function TeamForm({ team, members, projects, onSave, onCancel }) {
  const [name, setName] = useState(team.name || '')
  const [memberIds, setMemberIds] = useState(team.memberIds || [])
  const [projectIds, setProjectIds] = useState(team.projectIds || [])
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    try { await onSave({ name: name.trim(), memberIds, projectIds }) } finally { setBusy(false) }
  }
  return (
    <div className="border border-primary-200 dark:border-primary-900/40 rounded-xl p-3 space-y-2 bg-primary-50/40 dark:bg-primary-900/10">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del equipo" className={inputCls} />
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Integrantes</p>
      <CheckList items={members.map((m) => ({ id: m.id, label: m.name }))} selected={memberIds} onChange={setMemberIds} />
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Proyectos (opcional)</p>
      <CheckList items={projects.map((p) => ({ id: p.id, label: p.name }))} selected={projectIds} onChange={setProjectIds} />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Cancelar</button>
        <button disabled={busy} onClick={submit} className="text-xs px-3 py-1.5 rounded-lg text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50">Guardar equipo</button>
      </div>
    </div>
  )
}

// ─── Carga manual de puntos ───────────────────────────────────────────────────

function ManualScores({ game, members, projects, onClose, onSaved }) {
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const isTeam = game.subjectType === 'team'

  useEffect(() => {
    api.get(`/gamification/games/${game.id}`).then(({ data }) => {
      const existing = data.leaderboard?.subjects || []
      const byId = new Map(existing.map((s) => [s.subjectId, s.score]))
      if (isTeam) {
        const t = data.game?.teams || []
        setRows(t.map((team) => ({ subjectId: team.id, label: team.name, points: byId.get(team.id) ?? 0, locked: true })))
      } else if (existing.length) {
        setRows(existing.map((s) => ({ subjectId: s.subjectId, label: s.label, points: s.score })))
      } else {
        setRows([{ subjectId: `s${Date.now()}`, label: '', points: 0 }])
      }
    }).catch(() => setRows(isTeam ? [] : [{ subjectId: `s${Date.now()}`, label: '', points: 0 }]))
  }, [game.id, isTeam])

  function update(i, patch) { setRows((r) => r.map((row, idx) => idx === i ? { ...row, ...patch } : row)) }
  function add() { setRows((r) => [...r, { subjectId: `s${Date.now()}${r.length}`, label: '', points: 0 }]) }
  function removeRow(i) { setRows((r) => r.filter((_, idx) => idx !== i)) }

  async function save() {
    setSaving(true)
    try {
      const scores = rows.filter((r) => String(r.label).trim()).map((r) => ({ subjectId: r.subjectId, label: String(r.label).trim(), points: Number(r.points) || 0 }))
      await api.put(`/gamification/games/${game.id}/scores`, { scores })
      onSaved()
    } catch { setSaving(false) }
  }

  const suggestions = game.subjectType === 'person' ? members.map((m) => m.name) : game.subjectType === 'project' ? projects.map((p) => p.name) : []

  return (
    <Modal onClose={onClose} title={`Puntos · ${game.title}`}>
      {isTeam && rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Este juego no tiene equipos. Agregalos desde <strong>✏️ Editar</strong> y volvé a cargar los puntos.</p>
      ) : (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Cargá el puntaje de cada participante. El de mayor puntaje gana.</p>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={row.subjectId || i} className="flex items-center gap-2">
                <input
                  list={!row.locked && suggestions.length ? 'ms-sug' : undefined}
                  value={row.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  readOnly={row.locked}
                  placeholder="Nombre / equipo"
                  className={`${inputCls} flex-1 ${row.locked ? 'bg-gray-50 dark:bg-gray-800' : ''}`}
                />
                <input type="number" value={row.points} onChange={(e) => update(i, { points: e.target.value })} className="w-24 px-2 py-2 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm" />
                {!isTeam && <button onClick={() => removeRow(i)} className="text-gray-400 hover:text-red-500 px-1">✕</button>}
              </div>
            ))}
            {suggestions.length > 0 && <datalist id="ms-sug">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
          </div>
          {!isTeam && <button onClick={add} className="mt-2 text-sm text-primary-600 dark:text-primary-400 font-medium">+ Agregar fila</button>}
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">Cancelar</button>
            <button disabled={saving} onClick={save} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar puntos'}</button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ─── Editor de preguntas (quiz) ───────────────────────────────────────────────

const oid = () => `o${Math.random().toString(36).slice(2, 8)}`

function QuizEditor({ questions, setQuestions, withPoints }) {
  function updateQ(i, patch) { setQuestions((qs) => qs.map((q, idx) => idx === i ? { ...q, ...patch } : q)) }
  function addChoice() { setQuestions((qs) => { const a = oid(), b = oid(); return [...qs, { kind: 'multiple_choice', text: '', options: [{ id: a, text: '' }, { id: b, text: '' }], correctOptionId: a, points: 1 }] }) }
  function addOpen() { setQuestions((qs) => [...qs, { kind: 'open', text: '', options: [], correctOptionId: null, points: 0 }]) }
  function removeQ(i) { setQuestions((qs) => qs.filter((_, idx) => idx !== i)) }
  function updateOpt(i, oi, text) { updateQ(i, { options: questions[i].options.map((o, idx) => idx === oi ? { ...o, text } : o) }) }
  function addOpt(i) { updateQ(i, { options: [...questions[i].options, { id: oid(), text: '' }] }) }
  function removeOpt(i, oi) {
    const q = questions[i]
    if (q.options.length <= 2) return
    const removed = q.options[oi]
    const options = q.options.filter((_, idx) => idx !== oi)
    updateQ(i, { options, correctOptionId: removed.id === q.correctOptionId ? options[0].id : q.correctOptionId })
  }

  return (
    <div className="space-y-3">
      {questions.length === 0 && <p className="text-xs text-gray-400">Todavía no hay preguntas.</p>}
      {questions.map((q, i) => (
        <div key={i} className="border border-gray-200 dark:border-gray-600 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 shrink-0">P{i + 1}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${q.kind === 'open' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
              {q.kind === 'open' ? 'Abierta' : 'Opción múltiple'}
            </span>
            <input value={q.text} onChange={(e) => updateQ(i, { text: e.target.value })} placeholder="Enunciado de la pregunta" className={`${inputCls} flex-1`} />
            <button type="button" onClick={() => removeQ(i)} className="text-gray-400 hover:text-red-500 px-1">🗑</button>
          </div>
          {q.kind === 'open' ? (
            <div className="pl-5">
              <input disabled placeholder="El usuario escribe una respuesta libre" className={`${inputCls} w-full bg-gray-50 dark:bg-gray-700/40 text-gray-400 cursor-not-allowed`} />
              <p className="text-[11px] text-gray-400 mt-1">Respuesta de texto libre. No suma puntos; queda para que la leas en el detalle del juego.</p>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-gray-400">{withPoints ? 'Marcá la opción correcta con el círculo.' : 'Opciones para elegir (encuesta de preferencia, sin respuesta correcta).'}</p>
              {q.options.map((o, oi) => (
                <div key={o.id} className="flex items-center gap-2 pl-5">
                  {withPoints && <input type="radio" name={`correct-${i}`} checked={q.correctOptionId === o.id} onChange={() => updateQ(i, { correctOptionId: o.id })} title="Correcta" />}
                  <input value={o.text} onChange={(e) => updateOpt(i, oi, e.target.value)} placeholder={`Opción ${oi + 1}`} className={`${inputCls} flex-1`} />
                  {q.options.length > 2 && <button type="button" onClick={() => removeOpt(i, oi)} className="text-gray-400 hover:text-red-500 px-1">✕</button>}
                </div>
              ))}
              <div className="flex items-center justify-between pl-5">
                <button type="button" onClick={() => addOpt(i)} className="text-xs text-primary-600 dark:text-primary-400 font-medium">+ Opción</button>
                {withPoints && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    Puntos:
                    <input type="number" min={1} value={q.points} onChange={(e) => updateQ(i, { points: Number(e.target.value) })} className="w-16 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700" />
                  </label>
                )}
              </div>
            </>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={addChoice} className="text-sm text-primary-600 dark:text-primary-400 font-medium">+ Opción múltiple</button>
        <button type="button" onClick={addOpen} className="text-sm text-primary-600 dark:text-primary-400 font-medium">+ Pregunta abierta</button>
      </div>
    </div>
  )
}

// Recorre las entregas del cuestionario de a una, con navegación ‹ › — para leer
// todas las respuestas de una persona junto y pasar a la siguiente sin scrollear.
function SubmissionsPager({ submissions, questions, withPoints }) {
  const [idx, setIdx] = useState(0)
  const safeIdx = Math.min(idx, Math.max(0, submissions.length - 1))
  const sub = submissions[safeIdx]

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Qué respondió cada uno</h4>
        {submissions.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 shrink-0">
            <button type="button" disabled={safeIdx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))} className="w-6 h-6 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700">‹</button>
            <span>{safeIdx + 1} / {submissions.length}</span>
            <button type="button" disabled={safeIdx === submissions.length - 1} onClick={() => setIdx((i) => Math.min(submissions.length - 1, i + 1))} className="w-6 h-6 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700">›</button>
          </div>
        )}
      </div>

      {!sub ? (
        <p className="text-xs text-gray-400">Todavía nadie respondió.</p>
      ) : (
        <div className="border border-gray-200 dark:border-gray-600 rounded-xl p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{sub.userName}</span>
            {withPoints && <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">{sub.score} pts</span>}
          </div>
          <div className="space-y-2.5">
            {questions.map((q) => {
              const a = (sub.answers || []).find((x) => x.questionId === String(q.id))
              const text = !a ? null : q.kind === 'open' ? a.text : (q.options || []).find((o) => o.id === a.optionId)?.text
              const correct = withPoints && q.kind !== 'open' && !!a && a.optionId === q.correctOptionId
              return (
                <div key={q.id}>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{q.text}</p>
                  <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words">
                    {text || <span className="text-gray-400 italic">Sin respuesta</span>}
                    {withPoints && q.kind !== 'open' && a && <span className={`ml-1.5 text-xs ${correct ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{correct ? '✓' : '✗'}</span>}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Detalle (admin): votación o resultados del quiz ──────────────────────────

function GameDetailModal({ game, onClose }) {
  const [data, setData] = useState(null)
  useEffect(() => { api.get(`/gamification/games/${game.id}`).then((r) => setData(r.data)).catch(() => setData({ error: true })) }, [game.id])

  const isQuiz = game.scoring === 'quiz'
  const quizWithPoints = isQuiz ? game.config?.withPoints !== false : true
  const participationPoints = isQuiz ? Number(game.config?.participationPoints) || 0 : 0
  // Hay ranking si el quiz puntúa por acierto, o si igual reparte puntos por participar.
  const showRanking = !isQuiz || quizWithPoints || participationPoints > 0

  const allSubjects = data?.leaderboard?.subjects || []
  // En votaciones mostramos solo a quienes tienen al menos un voto.
  const subjects = game.scoring === 'vote' ? allSubjects.filter((s) => s.score > 0) : allSubjects
  const part = data?.participation
  // Todas las preguntas del cuestionario (opción múltiple + abiertas), para mostrar qué respondió cada uno.
  const questions = data?.questions || []
  const submissions = data?.submissions || []

  return (
    <Modal title={`Detalle · ${game.title}`} onClose={onClose}>
      {!data ? <p className="text-sm text-gray-400">Cargando…</p> : (
        <>
          {part && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              {game.scoring === 'vote'
                ? <>Votaron <strong>{part.voted}</strong> de <strong>{part.eligible}</strong> personas.</>
                : <>Respondieron <strong>{part.submitted}</strong> de <strong>{part.eligible}</strong>{showRanking && data.maxScore ? <> · puntaje máximo <strong>{data.maxScore}</strong></> : null}.</>}
            </p>
          )}

          {showRanking && (
            <>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Ranking</h4>
              <ol className="space-y-1">
                {subjects.length === 0 && <li className="text-xs text-gray-400">{game.scoring === 'vote' ? 'Todavía nadie recibió votos.' : 'Sin datos todavía.'}</li>}
                {subjects.map((s, i) => (
                  <li key={s.subjectId} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-sm">
                    <span className="truncate text-gray-800 dark:text-gray-100">{['🥇', '🥈', '🥉'][i] || `${i + 1}.`} {s.label}</span>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{s.score} {game.scoring === 'vote' ? (s.score === 1 ? 'voto' : 'votos') : 'pts'}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {isQuiz && questions.length > 0 && (
            <div className={showRanking ? 'mt-4' : ''}>
              <SubmissionsPager submissions={submissions} questions={questions} withPoints={quizWithPoints} />
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  )
}

function CheckList({ items, selected, onChange }) {
  function toggle(id) { onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]) }
  return (
    <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-xl p-2 space-y-1">
      {items.length === 0 && <p className="text-xs text-gray-400 px-1">Sin opciones</p>}
      {items.map((it) => (
        <label key={it.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 px-1 py-0.5 cursor-pointer">
          <input type="checkbox" checked={selected.includes(it.id)} onChange={() => toggle(it.id)} className="rounded" />
          {it.label}
        </label>
      ))}
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    // El contenedor raíz scrollea; un click fuera del panel cierra (stopPropagation en el panel).
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      {/* Backdrop fijo: cubre siempre el viewport, aunque el modal sea más alto y haya scroll. */}
      <div className="fixed inset-0 bg-black/30" />
      <div className="relative min-h-full flex items-start justify-center p-4">
        <div onClick={(e) => e.stopPropagation()} className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg my-8 p-5 z-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
