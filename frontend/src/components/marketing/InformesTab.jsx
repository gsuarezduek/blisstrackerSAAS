import { useState, useEffect, useMemo } from 'react'
import api from '../../api/client'
import ReportViewer from './ReportViewer'
import ObjectivesManager from './ObjectivesManager'

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

// ─── Helpers de rango de fechas (selector de período del informe) ──────────────
const pad2 = n => String(n).padStart(2, '0')
function monthFirstDay(month) { return `${month}-01` }
function monthLastDay(month) {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${pad2(new Date(y, m, 0).getDate())}`
}
function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
function dmy(ymd) {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

// ─── Modal de generación (selección de secciones) ──────────────────────────────

// Catálogo de secciones (las claves coinciden con sections del backend / ReportViewer)
const SECTION_CATALOG = [
  { key: 'objectives',      label: 'Objetivos',             icon: '🎯' },
  { key: 'analytics',       label: 'Analítica web (GA4)',  icon: '📊' },
  { key: 'performance',     label: 'Performance web',       icon: '⚡' },
  { key: 'geo',             label: 'Presencia en IA (GEO)', icon: '🤖' },
  { key: 'seo',             label: 'SEO / Search Console',  icon: '🔍' },
  { key: 'keywords',        label: 'Keywords',              icon: '🔑' },
  { key: 'instagram',       label: 'Instagram',             icon: '📸' },
  { key: 'tiktok',          label: 'TikTok',                icon: '🎵' },
  { key: 'youtube',         label: 'YouTube',               icon: '▶️' },
  { key: 'linkedin',        label: 'LinkedIn',              icon: '💼' },
  { key: 'facebook',        label: 'Facebook',              icon: '👍' },
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

function GenerateModal({ projectId, month, availableSections: initialAvailable, initialSelected, initialPeriod, onGenerate, onClose, generating }) {
  const [available, setAvailable]   = useState(initialAvailable)
  const [refreshing, setRefreshing] = useState(false)

  // ── Período de datos del informe ──
  const prevMonth = prevMonthStr(month)
  // Si el informe ya tenía un rango elegido, reabrir en "Personalizado" con esas fechas
  const [preset, setPreset] = useState(initialPeriod?.start ? 'custom' : 'prev')
  const [customStart, setCustomStart] = useState(initialPeriod?.start || monthFirstDay(prevMonth))
  const [customEnd,   setCustomEnd]   = useState(initialPeriod?.end   || monthLastDay(prevMonth))

  const period = useMemo(() => {
    if (preset === 'prev')       { const pm = prevMonthStr(month); return { start: monthFirstDay(pm), end: monthLastDay(pm) } }
    if (preset === 'thisToDate') return { start: monthFirstDay(month), end: todayYmd() }
    if (preset === 'last3') {
      const endM = prevMonthStr(month)
      let s = endM; for (let i = 0; i < 2; i++) s = prevMonthStr(s)
      return { start: monthFirstDay(s), end: monthLastDay(endM) }
    }
    return { start: customStart, end: customEnd }
  }, [preset, month, customStart, customEnd])

  const periodInvalid = !period.start || !period.end || period.start > period.end

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
          Elegí el período de datos y qué secciones incluir. Solo se muestran las secciones con datos o fuente conectada. Las que dejes sin marcar no se generan ni aparecen en el link del cliente.
        </p>

        {/* ── Período de datos ── */}
        <div className="mb-4 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">📅 Período de datos</p>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {[
              { k: 'prev',       label: `Mes anterior (${monthLabel(prevMonth)})` },
              { k: 'thisToDate', label: 'Este mes hasta hoy' },
              { k: 'last3',      label: 'Últimos 3 meses' },
              { k: 'custom',     label: 'Personalizado' },
            ].map(p => (
              <button
                key={p.k}
                onClick={() => setPreset(p.k)}
                className={`text-[11px] px-2 py-1.5 rounded-lg border transition-colors text-left capitalize ${
                  preset === p.k
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium'
                    : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/60'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2 mb-2">
              <input type="date" value={customStart} max={customEnd || undefined} onChange={e => setCustomStart(e.target.value)}
                className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200" />
              <span className="text-gray-400 text-xs">al</span>
              <input type="date" value={customEnd} min={customStart || undefined} onChange={e => setCustomEnd(e.target.value)}
                className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200" />
            </div>
          )}

          {periodInvalid ? (
            <p className="text-[11px] text-red-600 dark:text-red-400">La fecha de inicio no puede ser posterior a la de fin.</p>
          ) : (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Datos del <strong>{dmy(period.start)}</strong> al <strong>{dmy(period.end)}</strong>.
              {period.end >= todayYmd() && (
                <span className="text-amber-600 dark:text-amber-400"> Incluye días del mes en curso: las RRSS pueden ser aproximadas (datos en vivo).</span>
              )}
            </p>
          )}
        </div>

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
            onClick={() => onGenerate([...selected], { periodStart: period.start, periodEnd: period.end })}
            disabled={generating || selected.size === 0 || periodInvalid}
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

  async function handleGenerate(enabledSections, period) {
    setGenerating(true)
    setError(null)
    try {
      const body = { enabledSections }
      if (period?.periodStart && period?.periodEnd) {
        body.periodStart = period.periodStart
        body.periodEnd   = period.periodEnd
      }
      const res = await api.post(`/marketing/projects/${projectId}/reports/${month}/regenerate`, body)
      setReportMeta(res.data.report)
      setReportData(res.data.data)
      setShowGenModal(false)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al generar el informe')
    } finally {
      setGenerating(false)
    }
  }

  async function handleTogglePublish() {
    if (!reportMeta) return
    const next = reportMeta.status === 'published' ? 'draft' : 'published'
    try {
      await api.patch(`/marketing/projects/${projectId}/reports/${month}/status`, { status: next })
      setReportMeta(prev => prev ? { ...prev, status: next } : prev)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar el estado del informe')
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
            <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{reportMeta?.periodLabel || monthLabel(month)}</p>
            {isGenerated && reportMeta?.status && (
              <span className={`inline-block mt-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                reportMeta.status === 'published'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
              }`}>
                {reportMeta.status === 'published' ? '● Publicado' : '● Borrador'}
              </span>
            )}
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
              onClick={handleTogglePublish}
              title={reportMeta?.status === 'published' ? 'Volver a borrador (el link del cliente dejará de funcionar)' : 'Publicar (habilita el link del cliente)'}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                reportMeta?.status === 'published'
                  ? 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  : 'border-green-600 bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {reportMeta?.status === 'published' ? '↩ Despublicar' : '✅ Publicar'}
            </button>
          )}
          {isGenerated && (
            <button
              onClick={handleCopyLink}
              disabled={!reportMeta?.token || reportMeta?.status !== 'published'}
              title={reportMeta?.status !== 'published' ? 'Publicá el informe para habilitar el link del cliente' : ''}
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

      {/* ── Gestor de objetivos (CRUD, nivel proyecto) ── */}
      {showObjModal && (
        <ObjectivesManager
          projectId={projectId}
          onClose={() => setShowObjModal(false)}
        />
      )}

      {/* ── Modal de generación (selección de secciones) ── */}
      {showGenModal && (
        <GenerateModal
          projectId={projectId}
          month={month}
          availableSections={availableSections}
          initialSelected={reportMeta?.enabledSections ?? null}
          initialPeriod={reportMeta?.periodStart ? { start: reportMeta.periodStart, end: reportMeta.periodEnd } : null}
          onGenerate={handleGenerate}
          onClose={() => setShowGenModal(false)}
          generating={generating}
        />
      )}
    </div>
  )
}
