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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function InformesTab({ projectId }) {
  // Default: último mes cerrado (el mes actual no tiene snapshots todavía)
  const [month,       setMonth]       = useState(prevMonthStr(currentMonthStr()))
  const [reportMeta,  setReportMeta]  = useState(null)
  const [reportData,  setReportData]  = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [showObjModal, setShowObjModal] = useState(false)
  const [savingObjs,  setSavingObjs]  = useState(false)
  const [copied,      setCopied]      = useState(false)
  const [retryKey,    setRetryKey]    = useState(0)

  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    api.get(`/marketing/projects/${projectId}/reports/${month}`, { signal: controller.signal })
      .then(res => {
        setReportMeta(res.data.report)
        setReportData(res.data.data)
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
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
        <p className="text-4xl mb-3">📊</p>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Seleccioná un proyecto para ver el informe mensual.</p>
      </div>
    )
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
          <span className="text-sm font-semibold text-gray-900 dark:text-white capitalize min-w-[140px] text-center">
            {monthLabel(month)}
          </span>
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
