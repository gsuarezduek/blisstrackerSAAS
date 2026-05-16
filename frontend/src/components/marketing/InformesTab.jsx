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
  const [regenerating,  setRegenerating]  = useState(false)

  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    api.get(`/marketing/projects/${projectId}/reports/${month}`, { signal: controller.signal })
      .then(res => {
        setReportMeta(res.data.report)
        setReportData(res.data.data)
        setReportWorkspace(res.data.workspace ?? null)
      })
      .catch(err => {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return
        setError(err.response?.data?.error || 'Error al cargar el informe')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [projectId, month, retryKey])

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

  async function handleRegenerate() {
    if (!window.confirm('¿Regenerar el informe? Se volverán a leer todos los datos y se creará un nuevo análisis con IA. El texto editado de Resumen y Próximos pasos se perderá.')) return
    setRegenerating(true)
    setError(null)
    try {
      const res = await api.post(`/marketing/projects/${projectId}/reports/${month}/regenerate`)
      setReportMeta(res.data.report)
      setReportData(res.data.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al regenerar el informe')
    } finally {
      setRegenerating(false)
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
          <button
            onClick={handleRegenerate}
            disabled={regenerating || loading}
            title="Vuelve a leer todos los datos y regenera el análisis IA"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
          >
            {regenerating ? (
              <>
                <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                Regenerando…
              </>
            ) : '🔄 Regenerar'}
          </button>
          <button
            onClick={() => setShowObjModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            🎯 Objetivos
          </button>
          <button
            onClick={handleCopyLink}
            disabled={!reportMeta?.token}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-40"
          >
            {copied ? '✓ Copiado' : '📋 Link del cliente'}
          </button>
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

      {/* ── Modal de objetivos ── */}
      {showObjModal && (
        <ObjectivesModal
          objectives={reportMeta?.objectives ?? {}}
          onSave={handleSaveObjectives}
          onClose={() => setShowObjModal(false)}
          saving={savingObjs}
        />
      )}
    </div>
  )
}
