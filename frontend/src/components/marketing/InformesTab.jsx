import { useState, useEffect } from 'react'
import api from '../../api/client'
import ReportViewer from './ReportViewer'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonthStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

function nextMonthStr(month) {
  const [y, m] = month.split('-').map(Number)
  const nm = m === 12 ? 1 : m + 1
  const ny = m === 12 ? y + 1 : y
  return `${ny}-${String(nm).padStart(2, '0')}`
}

function monthLabel(month) {
  if (!month) return ''
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

// ─── Modal de objetivos ───────────────────────────────────────────────────────

const OBJECTIVE_FIELDS = [
  { key: 'sessions',      label: 'Sesiones web',          placeholder: '20000' },
  { key: 'newUsers',      label: 'Usuarios nuevos',       placeholder: '8000'  },
  { key: 'conversions',   label: 'Conversiones',          placeholder: '150'   },
  { key: 'followersIg',   label: 'Seguidores Instagram',  placeholder: '15000' },
  { key: 'engagementIg',  label: 'Engagement IG (%)',     placeholder: '3.5'   },
  { key: 'followersTk',   label: 'Seguidores TikTok',     placeholder: '5000'  },
]

function ObjectivesModal({ objectives, onSave, onClose, saving }) {
  const [draft, setDraft] = useState(
    OBJECTIVE_FIELDS.reduce((acc, f) => ({
      ...acc,
      [f.key]: objectives[f.key] != null ? String(objectives[f.key]) : '',
    }), {})
  )

  function handleSave() {
    const parsed = {}
    OBJECTIVE_FIELDS.forEach(f => {
      const v = parseFloat(draft[f.key])
      if (!isNaN(v) && v > 0) parsed[f.key] = v
    })
    onSave(parsed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">🎯 Objetivos del mes</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Definí las metas para este mes. Solo se muestran las métricas con datos disponibles.
        </p>

        <div className="space-y-3">
          {OBJECTIVE_FIELDS.map(f => (
            <div key={f.key} className="flex items-center gap-3">
              <label className="text-sm text-gray-700 dark:text-gray-300 w-44 shrink-0">{f.label}</label>
              <input
                type="number"
                value={draft[f.key]}
                onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar objetivos'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de generación (selección de secciones) ──────────────────────────────

// Catálogo de secciones (las claves coinciden con sections del backend / ReportViewer)
const SECTION_CATALOG = [
  { key: 'analytics',       label: 'Analítica web (GA4)',  icon: '📊' },
  { key: 'performance',     label: 'Performance web',       icon: '⚡' },
  { key: 'geo',             label: 'Presencia en IA (GEO)', icon: '🤖' },
  { key: 'seo',             label: 'SEO / Search Console',  icon: '🔍' },
  { key: 'keywords',        label: 'Keywords',              icon: '🎯' },
  { key: 'cannibalization', label: 'Canibalización SEO',    icon: '⚔️' },
  { key: 'instagram',       label: 'Instagram',             icon: '📸' },
  { key: 'tiktok',          label: 'TikTok',                icon: '🎵' },
  { key: 'linkedin',        label: 'LinkedIn',              icon: '💼' },
  { key: 'metaAds',         label: 'Meta Ads',              icon: '📣' },
  { key: 'googleAds',       label: 'Google Ads',            icon: '🔎' },
  { key: 'competitors',     label: 'Competidores',          icon: '🏁' },
  { key: 'tasks',           label: 'Trabajo realizado',     icon: '✅' },
]

// Chip de estado de conexión de la integración de una sección
function IntegrationChip({ integration }) {
  if (!integration) return null
  if (integration === 'active') {
    return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">● Conectado</span>
  }
  if (integration === 'expired') {
    return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">● Desconectado</span>
  }
  // missing: no hay integración pero existen datos históricos guardados
  return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Datos guardados</span>
}

function GenerateModal({ projectId, availableSections: initialAvailable, initialSelected, onGenerate, onClose, generating }) {
  const [available, setAvailable]   = useState(initialAvailable)
  const [refreshing, setRefreshing] = useState(false)

  // Refresca el estado de conexión al abrir (por si se reconectó algo en otra pestaña)
  async function refreshStatus() {
    setRefreshing(true)
    try {
      const res = await api.get(`/marketing/projects/${projectId}/report-sections`)
      setAvailable(res.data.availableSections)
    } catch { /* mantenemos el estado inicial */ }
    finally { setRefreshing(false) }
  }
  useEffect(() => { refreshStatus() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Solo se ofrecen las secciones con datos/fuente disponible
  const offered = SECTION_CATALOG.filter(s => available?.[s.key]?.available)

  const [selected, setSelected] = useState(() => {
    const base = Array.isArray(initialSelected)
      ? SECTION_CATALOG.filter(s => initialSelected.includes(s.key)).map(s => s.key)
      : SECTION_CATALOG.filter(s => initialAvailable?.[s.key]?.available).map(s => s.key)  // por defecto: todas las disponibles
    return new Set(base)
  })

  function toggle(key) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const allChecked = offered.length > 0 && offered.every(s => selected.has(s.key))
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(offered.map(s => s.key)))
  }

  // Secciones seleccionadas cuya integración está caída → aviso para reconectar
  const expiredSelected = offered.filter(s => selected.has(s.key) && available?.[s.key]?.integration === 'expired')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">📄 Generar informe</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Elegí qué secciones querés incluir. Solo se muestran las que tienen datos o una fuente conectada. Las que dejes sin marcar no se generan ni aparecen en el link del cliente.
        </p>

        {offered.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Este proyecto todavía no tiene datos ni integraciones para armar un informe.
            <br />Conectá una fuente (web, RRSS, Ads…) y volvé a intentarlo.
          </div>
        ) : (
          <>
            {expiredSelected.length > 0 && (
              <div className="mb-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                ⚠️ Hay secciones desconectadas: <strong>{expiredSelected.map(s => s.label).join(', ')}</strong>. Reconectalas desde su pestaña en Marketing para incluir datos actualizados (sin reconectar, el informe usa los últimos datos guardados o queda incompleto).
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <button
                onClick={toggleAll}
                className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                {allChecked ? 'Desmarcar todas' : 'Marcar todas'}
              </button>
              <button
                onClick={refreshStatus}
                disabled={refreshing}
                className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
              >
                {refreshing ? 'Actualizando…' : '🔄 Actualizar estado'}
              </button>
            </div>

            <div className="space-y-1 overflow-y-auto pr-1">
              {offered.map(s => {
                const integration = available?.[s.key]?.integration
                return (
                  <label
                    key={s.key}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(s.key)}
                      onChange={() => toggle(s.key)}
                      className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-base leading-none">{s.icon}</span>
                    <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0">{s.label}</span>
                    <IntegrationChip integration={integration} />
                  </label>
                )
              })}
            </div>
          </>
        )}

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => onGenerate([...selected])}
            disabled={generating || selected.size === 0}
            className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            {generating ? 'Generando…' : 'Generar informe'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Vista global de informes (sin proyecto seleccionado) ─────────────────────

function AllReportsPanel({ onSelectProject }) {
  const [reports, setReports]     = useState([])
  const [total,   setTotal]       = useState(0)
  const [loading, setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const PAGE = 20

  useEffect(() => {
    setLoading(true)
    api.get(`/marketing/summary/reports?limit=${PAGE}&offset=0`)
      .then(r => { setReports(r.data.reports); setTotal(r.data.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleLoadMore() {
    setLoadingMore(true)
    try {
      const r = await api.get(`/marketing/summary/reports?limit=${PAGE}&offset=${reports.length}`)
      setReports(prev => [...prev, ...r.data.reports])
      setTotal(r.data.total)
    } catch {}
    finally { setLoadingMore(false) }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!reports.length) return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
      <p className="text-4xl mb-3">📊</p>
      <p className="text-gray-500 dark:text-gray-400 text-sm">
        Todavía no hay informes generados. Seleccioná un proyecto para crear el primer informe.
      </p>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Todos los informes <span className="font-normal text-gray-400">({total} en total)</span>
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
        {reports.map(r => {
          const [y, m] = r.month.split('-').map(Number)
          const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
          const publicUrl  = `${window.location.origin}/report/${r.token}`

          return (
            <div key={r.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => onSelectProject?.(String(r.project.id))}
                    className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  >
                    {r.project.name}
                  </button>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 capitalize">{monthLabel}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Generado: {new Date(r.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {r.generatedBy?.name && <>, por <span className="text-gray-500 dark:text-gray-300">{r.generatedBy.name}</span></>}
                </p>
              </div>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
              >
                Ver informe →
              </a>
            </div>
          )
        })}
      </div>

      {reports.length < total && (
        <div className="flex justify-center pt-2">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {loadingMore
              ? <><span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Cargando…</>
              : `Cargar más (${total - reports.length} restantes)`
            }
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function InformesTab({ projectId, onSelectProject }) {
  // Default: informe del mes actual (que contiene datos del mes anterior)
  // Ej: "Informe de Mayo 2026" → muestra datos de Abril 2026
  const [month,       setMonth]       = useState(currentMonthStr())
  const [reportMeta,  setReportMeta]  = useState(null)
  const [reportData,  setReportData]  = useState(null)
  const [reportWorkspace, setReportWorkspace] = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [showObjModal, setShowObjModal] = useState(false)
  const [savingObjs,  setSavingObjs]  = useState(false)
  const [copied,        setCopied]        = useState(false)
  const [retryKey,      setRetryKey]      = useState(0)
  const [availableSections, setAvailableSections] = useState(null)
  const [showGenModal, setShowGenModal] = useState(false)
  const [generating,   setGenerating]   = useState(false)

  const isGenerated = !!reportMeta?.isGenerated

  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setReportData(null)
    api.get(`/marketing/projects/${projectId}/reports/${month}`, { signal: controller.signal })
      .then(res => {
        setReportMeta(res.data.report)
        setReportData(res.data.data)   // null si el informe aún no fue generado
        setAvailableSections(res.data.availableSections ?? null)
        setReportWorkspace(res.data.workspace ?? null)
      })
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return
        setError(err.response?.data?.error || 'Error al cargar el informe')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [projectId, month, retryKey])

  async function handleGenerate(enabledSections) {
    setGenerating(true)
    setError(null)
    try {
      const res = await api.post(`/marketing/projects/${projectId}/reports/${month}/regenerate`, { enabledSections })
      setReportMeta(res.data.report)
      setReportData(res.data.data)
      setShowGenModal(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al generar el informe')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSaveObjectives(objectives) {
    setSavingObjs(true)
    try {
      const res = await api.patch(`/marketing/projects/${projectId}/reports/${month}`, { objectives })
      setReportMeta(prev => ({ ...prev, objectives: res.data.report.objectives }))
      setShowObjModal(false)
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar objetivos')
    } finally {
      setSavingObjs(false)
    }
  }

  async function handleSaveAnalysis(updatedAnalysis) {
    await api.patch(`/marketing/projects/${projectId}/reports/${month}`, { analysis: updatedAnalysis })
    setReportData(prev => prev ? { ...prev, analysis: updatedAnalysis } : prev)
  }

  async function handleBannerUpload(file) {
    const fd = new FormData()
    fd.append('image', file)
    const res = await api.post(`/marketing/projects/${projectId}/reports/${month}/banner`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    setReportMeta(prev => prev ? { ...prev, hasBanner: true } : prev)
    return res.data
  }

  async function handleBannerDelete() {
    await api.delete(`/marketing/projects/${projectId}/reports/${month}/banner`)
    setReportMeta(prev => prev ? { ...prev, hasBanner: false } : prev)
  }

  function handleCopyLink() {
    if (!reportMeta?.token) return
    const url = `${window.location.origin}/report/${reportMeta.token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const today = currentMonthStr()
  const canGoNext = month < today

  if (!projectId) {
    return <AllReportsPanel onSelectProject={onSelectProject} />
  }

  return (
    <div className="space-y-4">

      {/* ── Barra de navegación de mes ── */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth(prevMonthStr(month))}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ◀
          </button>
          <div className="text-center min-w-[160px]">
            <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{monthLabel(month)}</p>
          </div>
          <button
            onClick={() => canGoNext && setMonth(nextMonthStr(month))}
            disabled={!canGoNext}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ▶
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isGenerated && (
            <button
              onClick={() => setShowGenModal(true)}
              disabled={generating || loading}
              title="Elegí las secciones y regenerá el informe (relee los datos y el análisis IA)"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
            >
              🔄 Regenerar
            </button>
          )}
          <button
            onClick={() => setShowObjModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            🎯 Objetivos
          </button>
          {isGenerated && (
            <button
              onClick={handleCopyLink}
              disabled={!reportMeta?.token}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-40"
            >
              {copied ? '✓ Copiado' : '📋 Link del cliente'}
            </button>
          )}
        </div>
      </div>

      {/* ── Contenido ── */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5 text-center">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
          <button onClick={() => setRetryKey(k => k + 1)} className="mt-2 text-xs text-red-500 underline">Reintentar</button>
        </div>
      )}

      {!loading && !error && reportData?.analysisError && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
          <span className="text-lg leading-none mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              No se pudo generar el texto del análisis con IA
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
              {reportData.analysisError}
            </p>
          </div>
          <button
            onClick={() => setShowGenModal(true)}
            disabled={generating}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            🔄 Regenerar
          </button>
        </div>
      )}

      {!loading && !error && reportData && (
        <ReportViewer
          data={reportData}
          objectives={reportMeta?.objectives ?? {}}
          isPublic={false}
          onSaveAnalysis={handleSaveAnalysis}
          onBannerUpload={handleBannerUpload}
          onBannerDelete={handleBannerDelete}
          report={reportMeta}
          workspace={reportWorkspace}
        />
      )}

      {/* ── Estado vacío: informe todavía no generado ── */}
      {!loading && !error && !reportData && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <p className="text-5xl mb-4">📄</p>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Todavía no generaste el informe de {monthLabel(month)}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
            Elegí qué secciones querés incluir y generamos el informe con los datos del período y el análisis con IA.
          </p>
          <button
            onClick={() => setShowGenModal(true)}
            disabled={generating}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors disabled:opacity-50"
          >
            {generating
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generando…</>
              : '📄 Generar informe'}
          </button>
        </div>
      )}

      {/* ── Modal de objetivos ── */}
      {showObjModal && (
        <ObjectivesModal
          objectives={reportMeta?.objectives ?? {}}
          onSave={handleSaveObjectives}
          onClose={() => setShowObjModal(false)}
          saving={savingObjs}
        />
      )}

      {/* ── Modal de generación (selección de secciones) ── */}
      {showGenModal && (
        <GenerateModal
          projectId={projectId}
          availableSections={availableSections}
          initialSelected={reportMeta?.enabledSections ?? null}
          onGenerate={handleGenerate}
          onClose={() => setShowGenModal(false)}
          generating={generating}
        />
      )}
    </div>
  )
}
