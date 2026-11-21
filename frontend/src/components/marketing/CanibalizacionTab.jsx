import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'
import { Search, Trash2, ShieldCheck, Languages, AlertTriangle, FileWarning, CheckCircle2, RotateCcw, Bot, Globe, Tag } from 'lucide-react'
import { Icon } from '../ui/Icon'
import LoadingSpinner from '../LoadingSpinner'
import FunLoader from './networks/FunLoader'
import { CANNIBALIZATION_LOADING_MESSAGES } from './networks/loadingMessages'
import ProtectedUrlsModal from './ProtectedUrlsModal'
import BrandTermsModal from './BrandTermsModal'
import ResolveConflictModal, { ACTION_LABEL } from './ResolveConflictModal'
import { matchesSearch } from '../../utils/textSearch'

const LANGUAGE_LABELS = { default: 'Principal (sin prefijo)' }
function languageLabel(lang) {
  return LANGUAGE_LABELS[lang] ?? (lang || '').toUpperCase()
}

const SEVERITY_COLORS = {
  Alta:  'bg-red-100   dark:bg-red-900/30   text-red-700   dark:text-red-400   border-red-200   dark:border-red-700',
  Media: 'bg-amber-100 dark:bg-amber-900/30  text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700',
  Baja:  'bg-blue-100  dark:bg-blue-900/30   text-blue-700  dark:text-blue-400  border-blue-200  dark:border-blue-700',
}

const SEVERITY_DOT = {
  Alta:  'bg-red-500',
  Media: 'bg-amber-400',
  Baja:  'bg-blue-400',
}

const DATE_RANGE_LABELS = { '30d': '30 días', '90d': '90 días', '180d': '180 días' }

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Fecha sola (sin hora) — para "resuelto el 4 nov".
function fmtDay(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Clave estable de un conflicto: la misma identidad que usa el backend
// (query + idioma), para que dos idiomas de la misma keyword no colisionen.
function keyOf(c) {
  return `${c.query}|${c.language ?? 'default'}`
}

// "301 hecho · 4 nov · Gastón" — el pie de un conflicto resuelto.
function resolutionLine(r) {
  // `resolvedByLabel` lo arma el backend (ver agentLabel en lib/cannibalResolution.js):
  // el agente va adelante, y si no declaró nombre dice "un agente" en vez del label del
  // token — que suele ser el nombre de su dueño y se leía como si lo hubiera hecho él.
  const autor = r.resolvedByLabel ?? (r.agent ? `${r.resolvedBy ?? 'alguien'} vía ${r.agent}` : r.resolvedBy)
  return [ACTION_LABEL[r.action] ?? r.action, fmtDay(r.resolvedAt), autor].filter(Boolean).join(' · ')
}

// "ARG 62% · USA 24%" — países de donde vienen las búsquedas (dimensión `country`
// de Search Console, códigos ISO alpha-3 como los devuelve la API).
function fmtCountries(list, limit = 3) {
  if (!list?.length) return null
  return list.slice(0, limit).map(c => `${c.code} ${Math.round(c.share * 100)}%`).join(' · ')
}

function fmtNum(n) {
  if (n == null) return '—'
  return n.toLocaleString('es-AR')
}

function fmtPct(n) {
  if (n == null || n === 0) return '0%'
  return (n * 100).toFixed(1) + '%'
}

function SeverityBadge({ label }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${SEVERITY_COLORS[label] ?? ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[label] ?? 'bg-gray-400'}`} />
      {label}
    </span>
  )
}

// Lo que la URL respondió cuando se la pidió durante el análisis. Sin esto, el reporte
// recomendaba trabajar sobre URLs que redirigen desde hace semanas: Search Console mira
// hacia atrás y sigue mostrando los datos de antes del arreglo.
const LIVE_LABEL = {
  redirect_to_other:  { text: 'redirige a la principal', tone: 'green' },
  redirect_elsewhere: { text: 'redirige',                tone: 'green' },
  gone:               { text: 'ya no existe',            tone: 'green' },
  noindex:            { text: 'noindex',                 tone: 'green' },
  canonical_to_other: { text: 'canonical a la principal', tone: 'green' },
  canonical_elsewhere:{ text: 'canonical a otra',        tone: 'amber' },
  server_error:       { text: 'error del servidor',      tone: 'red' },
}

const LIVE_TONE = {
  green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  red:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
}

function LiveBadge({ live }) {
  if (!live) return null
  const meta = LIVE_LABEL[live.state]
  if (!meta) return null
  return (
    <span
      title={live.note || ''}
      className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${LIVE_TONE[meta.tone]}`}
    >
      {live.status ? `${live.status} · ` : ''}{meta.text}
    </span>
  )
}

function ConflictCard({ conflict, expanded, onToggle, onResolve }) {
  const { query, language, urls, severity, severityScore, totalImpressions, totalClicks, positionSpread, countries, recommendation, resolution } = conflict
  const reopened = resolution?.status === 'reopened'

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      {/* Cabecera clickable */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <SeverityBadge label={severity} />
        {language && (
          <span className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
            {languageLabel(language)}
          </span>
        )}
        <span className="flex-1 font-medium text-gray-800 dark:text-gray-100 truncate text-sm">
          {query}
        </span>
        {reopened && (
          <span
            title={`Se había marcado como resuelto (${resolutionLine(resolution)}) y volvió a aparecer después de esa fecha`}
            className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
          >
            <Icon as={RotateCcw} size={11} /> Volvió
          </span>
        )}
        <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 mr-2">
          {urls.length} URLs · {fmtNum(totalImpressions)} imp.
        </span>
        <span className="text-gray-400 dark:text-gray-500 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Detalle expandible */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>Score: <strong className="text-gray-700 dark:text-gray-300">{severityScore}/100</strong></span>
            <span>Spread posiciones: <strong className="text-gray-700 dark:text-gray-300">{positionSpread}</strong></span>
            <span>Clics totales: <strong className="text-gray-700 dark:text-gray-300">{fmtNum(totalClicks)}</strong></span>
            {fmtCountries(countries) && (
              <span className="inline-flex items-center gap-1">
                <Icon as={Globe} size={12} className="text-gray-400" />
                Países: <strong className="text-gray-700 dark:text-gray-300">{fmtCountries(countries)}</strong>
              </span>
            )}
          </div>

          {/* Tabla de URLs */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">URL</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Posición</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Impresiones</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Clics</th>
                  <th className="text-right px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">CTR</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">País</th>
                </tr>
              </thead>
              <tbody>
                {urls.map((u, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={u.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 dark:text-primary-400 hover:underline break-all max-w-xs block"
                        >
                          {u.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                        </a>
                        {u.url === recommendation?.mainUrl && (
                          <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            principal
                          </span>
                        )}
                        {u.protected && (
                          <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400">
                            <Icon as={ShieldCheck} size={11} /> protegida
                          </span>
                        )}
                        <LiveBadge live={u.live} />
                      </div>
                    </td>
                    <td className="text-right px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                      {u.position?.toFixed(1) ?? '—'}
                    </td>
                    <td className="text-right px-3 py-2 text-gray-600 dark:text-gray-400">{fmtNum(u.impressions)}</td>
                    <td className="text-right px-3 py-2 text-gray-600 dark:text-gray-400">{fmtNum(u.clicks)}</td>
                    <td className="text-right px-3 py-2 text-gray-600 dark:text-gray-400">{fmtPct(u.ctr)}</td>
                    <td
                      className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap"
                      title={u.countries?.map(c => `${c.code}: ${fmtNum(c.impressions)} imp.`).join(' · ') || ''}
                    >
                      {fmtCountries(u.countries, 2) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Recomendación */}
          {recommendation ? (
            <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
              {conflict.live?.warning && (
                <p className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10 p-2.5 text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                  <Icon as={AlertTriangle} size={13} className="flex-shrink-0 mt-0.5" />
                  <span>{conflict.live.warning}</span>
                </p>
              )}
              {recommendation.geoNote && (
                <p className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-900/10 p-2.5 text-sky-800 dark:text-sky-300 flex items-start gap-1.5">
                  <Icon as={Globe} size={13} className="flex-shrink-0 mt-0.5" />
                  <span>{recommendation.geoNote}</span>
                </p>
              )}
              <p>
                <strong className="text-gray-700 dark:text-gray-200">URL principal sugerida:</strong>{' '}
                {recommendation.mainUrl?.replace(/^https?:\/\/[^/]+/, '') || recommendation.mainUrl}
                {' '}<span className="text-gray-400 dark:text-gray-500">({recommendation.mainUrlReason})</span>
              </p>
              <ol className="list-decimal list-inside space-y-1">
                {recommendation.steps?.map((step, i) => (
                  <li key={i} className="text-gray-500 dark:text-gray-400">{step}</li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 italic">Sin recomendación disponible para este conflicto.</p>
          )}

          {/* Historial: ya se había arreglado una vez y volvió — mirar si el cambio
              sigue aplicado antes de rehacerlo. */}
          {reopened && (
            <div className="text-xs rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/60 dark:bg-orange-900/10 p-3 space-y-1">
              <p className="text-orange-800 dark:text-orange-300 font-semibold">
                Ya se había resuelto ({resolutionLine(resolution)}) y volvió.
              </p>
              {resolution.note && <p className="text-orange-700 dark:text-orange-400">“{resolution.note}”</p>}
              {resolution.reopenEvidence && (
                <p className="text-orange-600 dark:text-orange-400/80">
                  Entre el {resolution.reopenEvidence.from} y el {resolution.reopenEvidence.to} volvieron a competir:{' '}
                  {(resolution.reopenEvidence.urls ?? []).map(u => `${u.url.replace(/^https?:\/\/[^/]+/, '') || '/'} (${fmtNum(u.impressions)} imp.)`).join(' · ')}.
                  Revisá que el cambio siga aplicado.
                </p>
              )}
            </div>
          )}

          <div className="pt-1">
            <button
              onClick={() => onResolve?.(conflict)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-200 dark:border-green-800 text-xs font-semibold text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
            >
              <Icon as={CheckCircle2} size={14} /> {reopened ? 'Volver a marcar resuelto' : 'Marcar como resuelto'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Un conflicto ya arreglado: fuera de la lista principal y de los conteos, pero
 * visible y reversible. Sigue apareciendo en los datos del análisis hasta que la
 * ventana (30/90/180 días) deje atrás los días previos al arreglo — eso es normal
 * y se explica acá para que nadie lo lea como "no se arregló".
 */
function ResolvedRow({ conflict, onUndo, undoing }) {
  const r = conflict.resolution ?? {}
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/60 dark:bg-gray-800/30">
      <Icon as={CheckCircle2} size={15} className="text-green-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{conflict.query}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 flex-wrap">
          {r.agent && <Icon as={Bot} size={11} className="text-primary-500" />}
          {resolutionLine(r)}
          {r.reopenCount > 0 && <span className="text-orange-500">· volvió {r.reopenCount}x antes</span>}
        </p>
        {r.note && <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-0.5 break-words">“{r.note}”</p>}
        {/* Por qué la última verificación no lo reabrió. Sin esto, un conflicto que la
            verificación nunca pudo evaluar — porque faltan días de datos, porque no llega
            al piso de volumen, o porque la resolución se guardó con otro idioma — se veía
            igual que uno bien resuelto. */}
        {r.lastCheckEvidence?.reason && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 break-words">
            Verificado{r.lastCheckedAt ? ` el ${new Date(r.lastCheckedAt).toLocaleDateString('es-AR')}` : ''}: {r.lastCheckEvidence.reason}
            {r.lastCheckEvidence.discardedByLanguage > 0 && r.lastCheckEvidence.competing === 0 && (
              <span className="text-amber-600 dark:text-amber-400"> — desmarcalo y volvelo a marcar desde el conflicto para que se guarden sus URLs.</span>
            )}
          </p>
        )}
      </div>
      <button
        onClick={() => onUndo(r.id)}
        disabled={undoing}
        title="Vuelve a la lista de conflictos abiertos"
        className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors disabled:opacity-50"
      >
        Reabrir
      </button>
    </div>
  )
}

export default function CanibalizacionTab({ projectId }) {
  const [reports,       setReports]       = useState([])
  const [activeReport,  setActiveReport]  = useState(null)
  const [loadingList,   setLoadingList]   = useState(false)
  const [loadingReport, setLoadingReport] = useState(false)
  const [running,       setRunning]       = useState(false)
  const [dateRange,     setDateRange]     = useState('90d')
  const [filter,        setFilter]        = useState('all')   // 'all' | 'Alta' | 'Media' | 'Baja'
  const [langFilter,    setLangFilter]    = useState('all')
  const [search,        setSearch]        = useState('')
  const [expanded,      setExpanded]      = useState(new Set())
  const [deleteModal,   setDeleteModal]   = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const [protectedModalOpen, setProtectedModalOpen] = useState(false)
  const [resolveTarget,  setResolveTarget]  = useState(null)   // conflicto a marcar resuelto
  const [showResolved,   setShowResolved]   = useState(false)
  const [showFixedLive,  setShowFixedLive]  = useState(false)
  const [showBrandModal, setShowBrandModal] = useState(false)
  const [showBrandQueries, setShowBrandQueries] = useState(false)
  const [undoing,        setUndoing]        = useState(false)
  const pollRef = useRef(null)

  // ── Cargar lista de reportes ────────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) return
    loadList()
  }, [projectId])

  async function loadList() {
    setLoadingList(true)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/cannibal?limit=10`)
      setReports(data.reports ?? [])
      // Si el más reciente está running/pending → cargar detalles y hacer polling
      const latest = (data.reports ?? [])[0]
      if (latest) {
        if (latest.status === 'running' || latest.status === 'pending') {
          startPolling(latest.id)
        } else if (latest.status === 'completed') {
          loadReport(latest.id)
        }
      }
    } catch { /* ignore */ }
    setLoadingList(false)
  }

  async function loadReport(rid) {
    setLoadingReport(true)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/cannibal/${rid}`)
      setActiveReport(data)
      setExpanded(new Set())
    } catch { /* ignore */ }
    setLoadingReport(false)
  }

  // ── Polling ─────────────────────────────────────────────────────────────────
  function startPolling(rid) {
    setRunning(true)
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/marketing/projects/${projectId}/cannibal/${rid}`)
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(pollRef.current)
          setRunning(false)
          setActiveReport(data)
          setReports(prev => prev.map(r => r.id === rid ? {
            ...r,
            status:         data.status,
            totalConflicts: data.totalConflicts,
            criticalCount:  data.criticalCount,
            warningCount:   data.warningCount,
            lowCount:       data.lowCount,
            trafficAtRisk:  data.trafficAtRisk,
          } : r))
        }
      } catch { /* ignore */ }
    }, 3000)
  }

  useEffect(() => () => clearInterval(pollRef.current), [])

  // ── Nuevo análisis ──────────────────────────────────────────────────────────
  async function handleRunAnalysis() {
    setRunning(true)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/cannibal`, { dateRange })
      setActiveReport(null)
      setReports(prev => [{ id: data.reportId, status: 'pending', dateRange, createdAt: new Date().toISOString() }, ...prev])
      startPolling(data.reportId)
    } catch (err) {
      setRunning(false)
      alert(err.response?.data?.error ?? 'Error al iniciar el análisis')
    }
  }

  // ── Eliminar ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteModal) return
    setDeleting(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/cannibal/${deleteModal.id}`)
      setReports(prev => prev.filter(r => r.id !== deleteModal.id))
      if (activeReport?.id === deleteModal.id) setActiveReport(null)
      setDeleteModal(null)
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al eliminar')
    }
    setDeleting(false)
  }

  // ── Resueltos ───────────────────────────────────────────────────────────────
  // Después de marcar/desmarcar se recarga el reporte: el backend reparte abiertos y
  // resueltos y recalcula los conteos en la misma lectura, así no hay dos criterios.
  function handleResolved() {
    setResolveTarget(null)
    if (activeReport?.id) loadReport(activeReport.id)
  }

  async function handleUndoResolution(resolutionId) {
    setUndoing(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/cannibal/resolutions/${resolutionId}`)
      if (activeReport?.id) await loadReport(activeReport.id)
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al reabrir el conflicto')
    }
    setUndoing(false)
  }

  // ── Filtrar conflictos ───────────────────────────────────────────────────────
  const conflicts = activeReport?.conflicts ?? []
  const resolvedConflicts = activeReport?.resolvedConflicts ?? []
  const hreflangIssues = activeReport?.hreflangIssues ?? []
  // Conflictos que el propio sitio ya resolvió (301/canonical/noindex/404 verificados en
  // vivo). No son pendientes, pero se muestran: un chequeo puede equivocarse.
  const fixedLiveConflicts = activeReport?.fixedLiveConflicts ?? []
  // Búsquedas de marca: no son canibalización, pero se muestran para poder corregir una
  // mala clasificación (el bucket se recalcula en cada lectura con los términos vigentes).
  const brandQueries = activeReport?.brandQueries ?? []
  const indexedByMistake = activeReport?.indexedByMistake ?? []
  const availableLanguages = [...new Set(conflicts.map(c => c.language).filter(Boolean))]
  const filteredConflicts = conflicts
    .filter(c => filter === 'all' || c.severity === filter)
    .filter(c => langFilter === 'all' || c.language === langFilter)
    .filter(c => !search || matchesSearch(c.query, search))

  // ─────────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Detección de Canibalización SEO
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Identifica keywords donde múltiples páginas del sitio compiten entre sí, diluyendo el tráfico orgánico.
        </p>
      </div>

      {/* Panel de control */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600 dark:text-gray-400 font-medium">Período:</label>
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            disabled={running}
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
          >
            {Object.entries(DATE_RANGE_LABELS).map(([val, lbl]) => (
              <option key={val} value={val}>{lbl}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleRunAnalysis}
          disabled={running || !projectId}
          className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center gap-2"
        >
          {running ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Analizando…
            </>
          ) : (
            <>Nuevo análisis</>
          )}
        </button>

        <button
          onClick={() => setProtectedModalOpen(true)}
          disabled={!projectId}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <Icon as={ShieldCheck} size={15} /> URLs protegidas
        </button>

        <button
          onClick={() => setShowBrandModal(true)}
          disabled={!projectId}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          <Icon as={Tag} size={15} /> Términos de marca
        </button>

        {/* Historial compacto */}
        {reports.length > 1 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-500 dark:text-gray-400">Historial:</span>
            <div className="flex gap-1">
              {reports.slice(0, 5).map(r => (
                <button
                  key={r.id}
                  onClick={() => loadReport(r.id)}
                  title={fmtDate(r.createdAt)}
                  className={`w-7 h-7 rounded-full text-xs font-bold transition-colors border ${
                    activeReport?.id === r.id
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-primary-400'
                  }`}
                >
                  {reports.indexOf(r) + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {protectedModalOpen && (
        <ProtectedUrlsModal projectId={projectId} onClose={() => setProtectedModalOpen(false)} />
      )}

      {showBrandModal && (
        <BrandTermsModal
          projectId={projectId}
          onClose={() => setShowBrandModal(false)}
          // La clasificación de marca se recalcula en cada lectura, así que basta con
          // volver a pedir el reporte para que el cambio se vea.
          onSaved={() => { if (activeReport?.id) loadReport(activeReport.id) }}
        />
      )}

      {/* Estado running */}
      {running && !activeReport && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-5">
          <FunLoader messages={CANNIBALIZATION_LOADING_MESSAGES} spinnerSize="sm" className="py-2" />
        </div>
      )}

      {/* Sin datos todavía */}
      {!running && !activeReport && !loadingReport && reports.length === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-10 text-center space-y-3">
          <div><Icon as={Search} size={40} className="inline-block text-gray-300 dark:text-gray-600" /></div>
          <p className="text-gray-600 dark:text-gray-300 font-medium">No hay análisis todavía</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Ejecutá el primer análisis para detectar keywords donde tus páginas compiten entre sí.
          </p>
        </div>
      )}

      {/* Loading detalle */}
      {loadingReport && (
        <div className="flex justify-center py-10">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {/* Reporte activo */}
      {activeReport && (
        <div className="space-y-4">
          {/* Resumen */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                  {DATE_RANGE_LABELS[activeReport.dateRange] ?? activeReport.dateRange} · {fmtDate(activeReport.createdAt)}
                  {resolvedConflicts.length > 0 && (
                    <span className="text-green-600 dark:text-green-500"> · {resolvedConflicts.length} resuelto{resolvedConflicts.length === 1 ? '' : 's'} (no cuentan acá)</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-4">
                  {/* KPIs */}
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">{fmtNum(activeReport.totalConflicts)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Conflictos</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{fmtNum(activeReport.criticalCount)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Alta</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{fmtNum(activeReport.warningCount)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Media</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{fmtNum(activeReport.lowCount)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Baja</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{fmtNum(activeReport.trafficAtRisk)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Imp. en riesgo</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{fmtNum(activeReport.hreflangCount)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Hreflang</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-500 dark:text-gray-400">{fmtNum(activeReport.indexedByMistakeCount)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Indexadas por error</p>
                  </div>
                </div>
              </div>

              {/* Botón eliminar */}
              <button
                onClick={() => setDeleteModal({ id: activeReport.id })}
                className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors flex items-center gap-1"
              >
                Eliminar
              </button>
            </div>

            {/* Resumen IA */}
            {activeReport.resumenGeneral && (
              <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 font-semibold uppercase tracking-wide">Análisis IA</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{activeReport.resumenGeneral}</p>
              </div>
            )}

            {/* Sin conflictos abiertos */}
            {activeReport.totalConflicts === 0 && activeReport.status === 'completed' && (
              <div className="mt-4 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-center">
                <p className="text-green-700 dark:text-green-400 font-semibold">
                  {resolvedConflicts.length > 0 ? 'No quedan conflictos abiertos' : 'No se detectaron conflictos de canibalización'}
                </p>
                <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                  {resolvedConflicts.length > 0
                    ? `Los ${resolvedConflicts.length} que siguen en los datos están marcados como resueltos.`
                    : 'Cada keyword relevante apunta a una única URL dominante. Excelente trabajo.'}
                </p>
              </div>
            )}

            {/* Error */}
            {activeReport.status === 'failed' && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
                <p className="text-sm text-red-700 dark:text-red-400">{activeReport.errorMsg ?? 'El análisis falló. Intentá de nuevo.'}</p>
              </div>
            )}
          </div>

          {/* Filtros y buscador */}
          {(activeReport.totalConflicts ?? 0) > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-1">
                  {['all', 'Alta', 'Media', 'Baja'].map(f => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                        filter === f
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-primary-400'
                      }`}
                    >
                      {f === 'all' ? 'Todos' : f}
                      {f !== 'all' && (
                        <span className="ml-1 opacity-70">
                          ({f === 'Alta' ? activeReport.criticalCount : f === 'Media' ? activeReport.warningCount : activeReport.lowCount})
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {availableLanguages.length > 1 && (
                  <select
                    value={langFilter}
                    onChange={e => setLangFilter(e.target.value)}
                    className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="all">Todos los idiomas</option>
                    {availableLanguages.map(lang => (
                      <option key={lang} value={lang}>{languageLabel(lang)}</option>
                    ))}
                  </select>
                )}

                <input
                  type="text"
                  placeholder="Buscar keyword…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="ml-auto text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 w-48"
                />
              </div>

              {/* Lista de conflictos */}
              <div className="space-y-2">
                {filteredConflicts.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
                    No hay conflictos que coincidan con el filtro.
                  </p>
                ) : (
                  filteredConflicts.map(conflict => (
                    <ConflictCard
                      key={keyOf(conflict)}
                      conflict={conflict}
                      expanded={expanded.has(keyOf(conflict))}
                      onResolve={setResolveTarget}
                      onToggle={() => setExpanded(prev => {
                        const next = new Set(prev)
                        const k = keyOf(conflict)
                        next.has(k) ? next.delete(k) : next.add(k)
                        return next
                      })}
                    />
                  ))
                )}
              </div>
            </>
          )}

          {/* Conflictos ya resueltos (siguen en los datos hasta que la ventana los deje atrás) */}
          {resolvedConflicts.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowResolved(v => !v)}
                className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                <Icon as={CheckCircle2} size={16} className="text-green-500" />
                Resueltos ({resolvedConflicts.length})
                <span className="text-gray-400 dark:text-gray-500 text-xs">{showResolved ? '▲' : '▼'}</span>
              </button>
              {showResolved && (
                <>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Fuera de los conteos y de Prioridades. Siguen apareciendo en los datos porque el
                    análisis mira hasta 180 días hacia atrás; vuelven solos a la lista si las URLs
                    compiten de nuevo después de la fecha del arreglo.
                  </p>
                  <div className="space-y-2">
                    {resolvedConflicts.map(c => (
                      <ResolvedRow
                        key={keyOf(c)}
                        conflict={c}
                        undoing={undoing}
                        onUndo={handleUndoResolution}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Ya arreglado en el sitio: el 301/canonical está puesto y Search Console todavía
              no se puso al día. No se cuenta como pendiente, pero se deja a la vista. */}
          {fixedLiveConflicts.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowFixedLive(v => !v)}
                className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                <Icon as={CheckCircle2} size={16} className="text-emerald-500" />
                Ya arreglados en el sitio ({fixedLiveConflicts.length})
                <span className="text-gray-400 dark:text-gray-500 text-xs">{showFixedLive ? '▲' : '▼'}</span>
              </button>
              {showFixedLive && (
                <>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Se pidieron estas URLs durante el análisis y ya redirigen, no existen o están
                    noindex: el arreglo está hecho. Siguen en los datos porque la ventana analizada
                    incluye días anteriores al cambio. No hace falta marcarlos a mano.
                  </p>
                  <div className="space-y-2">
                    {fixedLiveConflicts.map(c => (
                      <div key={keyOf(c)} className="border border-emerald-200 dark:border-emerald-900 rounded-xl p-3 bg-emerald-50/40 dark:bg-emerald-900/10">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-800 dark:text-gray-100">{c.query}</span>
                          <span className="text-[11px] text-gray-400 ml-auto">{fmtNum(c.totalImpressions)} imp.</span>
                        </div>
                        <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">{c.live?.reason}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Problemas de hreflang — verificados contra las etiquetas reales */}
          {hreflangIssues.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Icon as={Languages} size={16} className="text-purple-500" />
                Problemas de hreflang ({hreflangIssues.length})
              </h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Google devuelve URLs de distinto idioma para la misma búsqueda — no se cuenta como
                canibalización. Solo figuran los casos donde cada idioma se lleva una parte real de
                la búsqueda <strong>y</strong> las etiquetas hreflang de las páginas tienen un
                problema real al leerlas en vivo.
              </p>
              <div className="space-y-2">
                {hreflangIssues.map(issue => (
                  <div key={issue.query} className="border border-purple-200 dark:border-purple-800 rounded-xl p-4 bg-purple-50/40 dark:bg-purple-900/10">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-sm text-gray-800 dark:text-gray-100">{issue.query}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{fmtNum(issue.totalImpressions)} imp.</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {issue.urls.map((u, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1">
                          <span className="font-semibold text-purple-600 dark:text-purple-400">{languageLabel(u.language)}</span>
                          <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-gray-600 dark:text-gray-300 hover:underline break-all">
                            {u.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                          </a>
                          {u.urlsInLanguage > 1 && (
                            <span
                              className="text-[10px] text-gray-400"
                              title={`Hay ${u.urlsInLanguage} URLs en este idioma para esta búsqueda; se muestra la de más impresiones. Que compitan entre sí es canibalización, no hreflang.`}
                            >
                              +{u.urlsInLanguage - 1}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic">{issue.suggestion}</p>
                    {/* Observaciones que NO son errores: declara el idioma pero hacia otra
                        URL (no son par de traducción), o la página canonicaliza a otra y
                        por eso no se le exige hreflang. Van separadas a propósito. */}
                    {(issue.notes?.length > 0 || issue.skipped?.length > 0) && (
                      <ul className="mt-1.5 space-y-0.5">
                        {(issue.notes ?? []).map((n, i) => (
                          <li key={`n${i}`} className="text-[11px] text-gray-400">
                            {n.url.replace(/^https?:\/\/[^/]+/, '') || '/'}: {n.detail}
                          </li>
                        ))}
                        {(issue.skipped ?? []).map((sk, i) => (
                          <li key={`s${i}`} className="text-[11px] text-gray-400">
                            {sk.url.replace(/^https?:\/\/[^/]+/, '') || '/'}: {sk.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                    {issue.verified === false && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 inline-flex items-start gap-1">
                        <Icon as={AlertTriangle} size={12} className="flex-shrink-0 mt-0.5" />
                        Sin verificar en vivo: no se pudieron leer las etiquetas de estas páginas.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Búsquedas de marca: no son canibalización. Visible para poder corregir una
              mala clasificación (se recalcula con los términos vigentes en cada lectura). */}
          {brandQueries.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowBrandQueries(v => !v)}
                className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                <Icon as={Tag} size={16} className="text-primary-500" />
                Búsquedas de marca ({brandQueries.length})
                <span className="text-gray-400 dark:text-gray-500 text-xs">{showBrandQueries ? '▲' : '▼'}</span>
              </button>
              {showBrandQueries && (
                <>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Alguien buscó el nombre del negocio: que aparezcan dos páginas del sitio no es
                    canibalización y no hay nada que consolidar. Lo único que se verifica es que gane
                    la URL esperada. Si alguna no debería estar acá, saca el término en{' '}
                    <button onClick={() => setShowBrandModal(true)} className="underline hover:text-primary-600">
                      Términos de marca
                    </button>.
                  </p>
                  <div className="space-y-2">
                    {brandQueries.map(b => (
                      <div
                        key={`${b.query}-${b.language}`}
                        className={`border rounded-xl p-3 ${
                          b.ok === false
                            ? 'border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-900/10'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {b.ok === false && <Icon as={AlertTriangle} size={13} className="text-amber-500 flex-shrink-0" />}
                          <span className="font-medium text-sm text-gray-800 dark:text-gray-100">{b.query}</span>
                          <span className="text-[11px] text-gray-400 ml-auto">{fmtNum(b.totalImpressions)} imp.</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{b.note}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* URLs indexadas por error */}
          {indexedByMistake.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Icon as={FileWarning} size={16} className="text-gray-400" />
                URLs indexadas por error ({indexedByMistake.length})
              </h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Excluidas de los conflictos y de las impresiones en riesgo — no son canibalización, son limpieza técnica.
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">URL</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Motivo</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Sugerencia</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-500 dark:text-gray-400">Impresiones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indexedByMistake.map((item, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50">
                        <td className="px-3 py-2">
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline break-all max-w-xs block">
                            {item.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                          </a>
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <Icon as={AlertTriangle} size={12} className="text-amber-500 flex-shrink-0" /> {item.reason}
                        </td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{item.suggestion}</td>
                        <td className="text-right px-3 py-2 text-gray-600 dark:text-gray-400">{fmtNum(item.impressions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {resolveTarget && (
        <ResolveConflictModal
          projectId={projectId}
          conflict={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onSaved={handleResolved}
        />
      )}

      {/* Modal de confirmación de eliminación */}
      {deleteModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !deleting && setDeleteModal(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-3 text-center"><Icon as={Trash2} size={32} className="inline-block text-red-400" /></div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center mb-2">
              Eliminar análisis
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-5">
              Esta acción es permanente. El reporte se eliminará completamente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
