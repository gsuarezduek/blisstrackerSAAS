import { useState, useEffect, useMemo } from 'react'
import api from '../../api/client'
import ReportViewer from './ReportViewer'
import ObjectivesManager from './ObjectivesManager'
import ProjectSearchSelect from './ProjectSearchSelect'
import { ObjectiveCard } from './ReportViewerParts'

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
  { key: 'seo',             label: 'Rendimiento del sitio (Search Console)', icon: '🔍' },
  { key: 'keywords',        label: 'Posicionamiento SEO (keywords)',         icon: '🔑' },
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

// ─── Modal de configuración de secciones (rueda "⚙️", por proyecto) ────────────
// Define qué secciones de Marketing están habilitadas para ofrecer al generar el
// informe de este proyecto (ej: un proyecto sin web no ofrece "Performance web"/"GEO").
// Si se abre sin proyecto seleccionado, primero pide elegir uno.
function SectionsConfigModal({ projects, initialProjectId, onClose }) {
  const [pid,     setPid]     = useState(initialProjectId || '')
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [config,   setConfig]   = useState(null) // { projectName, services, sections }
  const [selected, setSelected] = useState(new Set())

  useEffect(() => {
    if (!pid) { setConfig(null); return }
    setLoading(true)
    setError(null)
    api.get(`/marketing/projects/${pid}/report-sections-config`)
      .then(r => {
        setConfig(r.data)
        setSelected(new Set(r.data.sections))
      })
      .catch(() => setError('No se pudo cargar la configuración de este proyecto.'))
      .finally(() => setLoading(false))
  }, [pid])

  function toggle(key) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const allChecked = SECTION_CATALOG.every(s => selected.has(s.key))
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(SECTION_CATALOG.map(s => s.key)))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/marketing/projects/${pid}/report-sections-config`, { sections: [...selected] })
      onClose()
    } catch {
      setError('No se pudo guardar la configuración.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">⚙️ Secciones del informe</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        {!pid ? (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Elegí el proyecto que querés configurar.
            </p>
            <ProjectSearchSelect projects={projects} value={pid} onChange={setPid} placeholder="Buscar proyecto…" />
          </>
        ) : loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : error && !config ? (
          <p className="text-sm text-red-500 dark:text-red-400 py-6 text-center">{error}</p>
        ) : config ? (
          <>
            <div className="mb-3">
              {!initialProjectId && (
                <button onClick={() => setPid('')} className="text-xs text-primary-600 dark:text-primary-400 hover:underline mb-2">
                  ← Cambiar proyecto
                </button>
              )}
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{config.projectName}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {config.services.length
                  ? `Servicios: ${config.services.map(s => s.name).join(', ')}`
                  : 'Sin servicios asociados'}
              </p>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Elegí qué secciones de Marketing están disponibles para este proyecto. Las que desmarques no se van a poder incluir al generar el informe.
            </p>

            <div className="flex items-center justify-between mb-2">
              <button onClick={toggleAll} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
                {allChecked ? 'Desmarcar todas' : 'Marcar todas'}
              </button>
            </div>

            {error && <p className="text-xs text-red-500 dark:text-red-400 mb-2">{error}</p>}

            <div className="space-y-1 overflow-y-auto pr-1">
              {SECTION_CATALOG.map(s => (
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
                </label>
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
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ─── Vista global de informes (sin proyecto seleccionado) ─────────────────────

function StatCard({ icon, label, value, sub, accent = 'text-gray-900 dark:text-white' }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <p className={`mt-1.5 text-2xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function ReportsStatsCards({ stats }) {
  if (!stats) return null
  const { monthLabel, reportsThisMonth, feedbackThisMonth, ratePct, ratedReports, avgRating, generators } = stats
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard
        icon="📊"
        label="Informes este mes"
        value={reportsThisMonth}
        sub={<span className="capitalize">{monthLabel}</span>}
      />
      <StatCard
        icon="⭐"
        label="Calificaciones este mes"
        value={feedbackThisMonth}
        sub={avgRating != null ? `${avgRating} de promedio` : 'Sin calificaciones aún'}
      />
      <StatCard
        icon="📈"
        label="% con calificación"
        value={`${ratePct}%`}
        accent="text-primary-600 dark:text-primary-400"
        sub={`${ratedReports} de ${reportsThisMonth} calificados`}
      />
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
          <span>👤</span>
          <span>Generado por</span>
        </div>
        {generators.length === 0 ? (
          <p className="mt-1.5 text-sm text-gray-400">—</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {generators.map(g => (
              <span
                key={g.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-200"
              >
                {g.name}
                <span className="font-semibold text-gray-500 dark:text-gray-400">{g.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Banda de color del % de cumplimiento de objetivos (mismo criterio de 3 bandas
// usado en otros lados de Marketing: ≥80 bien, ≥50 parcial, <50 mal).
function objPctBand(pct) {
  if (pct == null) return 'text-gray-300 dark:text-gray-600'
  if (pct >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (pct >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

// Una fila de la lista de informes — nombre, fecha, % de cumplimiento de objetivos
// (número principal, desplegable con el detalle) y link al informe.
function ReportRow({ r, onSelectProject }) {
  const [open, setOpen] = useState(false)
  const [y, m] = r.month.split('-').map(Number)
  const monthLabel = r.periodLabel || new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  const publicUrl = `${window.location.origin}/report/${r.token}`
  const hasObjectives = r.objectives?.length > 0

  return (
    <div>
      <div className="flex items-center gap-4 px-5 py-3.5">
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

        {r.objectivesPct != null ? (
          <button
            onClick={() => setOpen(o => !o)}
            title="Ver detalle de objetivos"
            className="flex-shrink-0 flex flex-col items-center px-2 hover:opacity-80 transition-opacity"
          >
            <span className={`text-xl font-bold tabular-nums ${objPctBand(r.objectivesPct)}`}>{r.objectivesPct}%</span>
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">objetivos {open ? '▲' : '▼'}</span>
          </button>
        ) : hasObjectives ? (
          <span className="flex-shrink-0 text-[11px] text-gray-400 px-2 text-center">Sin datos<br />de objetivos</span>
        ) : (
          <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 whitespace-nowrap">
            SIN OBJETIVOS
          </span>
        )}

        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
        >
          Ver informe →
        </a>
      </div>

      {open && hasObjectives && (
        <div className="px-5 pb-4 grid sm:grid-cols-2 gap-3 bg-gray-50/60 dark:bg-gray-900/20">
          {r.objectives.map(o => <ObjectiveCard key={o.id} obj={o} />)}
        </div>
      )}
    </div>
  )
}

const SORT_OPTIONS = [
  { key: 'date_desc', label: 'Más reciente' },
  { key: 'pct_desc',  label: 'Mayor cumplimiento' },
  { key: 'pct_asc',   label: 'Menor cumplimiento' },
]

// ─── Vista "En vivo" (objetivos del mes, sin esperar al informe mensual) ──────

function LiveProjectRow({ p, onSelectProject }) {
  const [open, setOpen] = useState(false)
  const hasObjectives = p.objectives?.length > 0

  return (
    <div>
      <div className="flex items-center gap-4 px-5 py-3.5">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => onSelectProject?.(String(p.projectId))}
            className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            {p.projectName}
          </button>
        </div>

        {p.objectivesPct != null ? (
          <button
            onClick={() => setOpen(o => !o)}
            title="Ver detalle de objetivos"
            className="flex-shrink-0 flex flex-col items-center px-2 hover:opacity-80 transition-opacity"
          >
            <span className={`text-xl font-bold tabular-nums ${objPctBand(p.objectivesPct)}`}>{p.objectivesPct}%</span>
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">objetivos {open ? '▲' : '▼'}</span>
          </button>
        ) : hasObjectives ? (
          <span className="flex-shrink-0 text-[11px] text-gray-400 px-2 text-center">Sin datos<br />de objetivos</span>
        ) : (
          <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 whitespace-nowrap">
            SIN OBJETIVOS
          </span>
        )}
      </div>

      {open && hasObjectives && (
        <div className="px-5 pb-4 grid sm:grid-cols-2 gap-3 bg-gray-50/60 dark:bg-gray-900/20">
          {p.objectives.map(o => <ObjectiveCard key={o.id} obj={o} />)}
        </div>
      )}
    </div>
  )
}

function LiveObjectivesPanel({ onSelectProject }) {
  const [data,    setData]    = useState(null)
  const [month,   setMonth]   = useState(null) // null = todavía no elegido, usa el default del backend
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = month ? `?month=${month}` : ''
    api.get(`/marketing/summary/objectives-live${params}`)
      .then(r => { setData(r.data); setMonth(r.data.month) })
      .catch(() => setData({ month, monthLabel: '', isCurrent: true, availableMonths: [], projects: [] }))
      .finally(() => setLoading(false))
  }, [month])

  const availableMonths = data?.availableMonths || []
  const idx = availableMonths.findIndex(m => m.month === data?.month)
  // La lista viene ordenada desc (más reciente primero): "anterior" = índice + 1, "siguiente" = índice - 1
  const canGoOlder = idx >= 0 && idx < availableMonths.length - 1
  const canGoNewer = idx > 0

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => canGoOlder && setMonth(availableMonths[idx + 1].month)}
            disabled={!canGoOlder}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ◀
          </button>
          <div className="text-center min-w-[160px]">
            <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{data?.monthLabel || '…'}</p>
            <span className={`inline-block mt-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${
              data?.isCurrent
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>
              {data?.isCurrent ? '● En curso' : 'Cerrado'}
            </span>
          </div>
          <button
            onClick={() => canGoNewer && setMonth(availableMonths[idx - 1].month)}
            disabled={!canGoNewer}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ▶
          </button>
        </div>
        <p className="text-xs text-gray-400 max-w-xs text-right">
          {data?.isCurrent
            ? 'Cumplimiento de objetivos recalculado en vivo con los datos de hoy, antes de que salga el informe mensual.'
            : 'Recalculado en vivo con los datos actuales de la base (puede diferir levemente del informe ya generado).'}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data?.projects?.length ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Ningún proyecto tiene objetivos configurados todavía. Entrá a un proyecto → pestaña Informes → 🎯 Objetivos para cargarlos.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
          {data.projects.map(p => <LiveProjectRow key={p.projectId} p={p} onSelectProject={onSelectProject} />)}
        </div>
      )}
    </div>
  )
}

function ReportsHistoryPanel({ onSelectProject, projects }) {
  const [reports, setReports]     = useState([])
  const [total,   setTotal]       = useState(0)
  const [month,   setMonth]       = useState(null)
  const [generators, setGenerators] = useState([])
  const [stats,   setStats]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [showConfig, setShowConfig] = useState(false)
  const [search,   setSearch]   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [generatedById, setGeneratedById] = useState('')
  const [sort, setSort] = useState('date_desc')

  // Debounce del buscador (300ms) para no pegarle al backend en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Stats de "este mes" — independientes de los filtros, se cargan una sola vez.
  useEffect(() => {
    api.get('/marketing/summary/reports-stats').then(r => setStats(r.data)).catch(() => {})
  }, [])

  // Lista de informes — todos los del mes en curso (sin paginar). El buscador y el
  // filtro por persona acotan dentro de ese mismo mes (no buscan en el historial).
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ sort })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (generatedById)   params.set('generatedById', generatedById)
    api.get(`/marketing/summary/reports?${params}`)
      .then(r => { setReports(r.data.reports); setTotal(r.data.total); setMonth(r.data.month); setGenerators(r.data.generators) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [debouncedSearch, generatedById, sort])

  const configBtn = (
    <button
      onClick={() => setShowConfig(true)}
      title="Configurar qué secciones de Marketing están disponibles por proyecto"
      className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
    >
      ⚙️
    </button>
  )

  // El título muestra el período de DATOS de los informes (por defecto, el mes
  // calendario anterior al "slot" en el que se generaron), no el mes en el que
  // se generaron — así coincide con el período que ya muestra cada fila.
  const heading = month ? monthLabel(prevMonthStr(month)) : ''
  const selectCls = 'text-sm px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="space-y-4">
      <ReportsStatsCards stats={stats} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 capitalize">
          Informes de {heading} <span className="font-normal text-gray-400 lowercase">({total} en total)</span>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar proyecto…"
            className="w-44 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {generators.length > 0 && (
            <select value={generatedById} onChange={e => setGeneratedById(e.target.value)} className={selectCls}>
              <option value="">Todas las personas</option>
              {generators.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <select value={sort} onChange={e => setSort(e.target.value)} className={selectCls}>
            {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          {configBtn}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !reports.length ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {debouncedSearch || generatedById
              ? <>No se encontraron informes de {heading} con esos filtros.</>
              : <>Todavía no hay informes generados este mes. Seleccioná un proyecto para crear el primero.</>}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
          {reports.map(r => <ReportRow key={r.id} r={r} onSelectProject={onSelectProject} />)}
        </div>
      )}

      {showConfig && (
        <SectionsConfigModal projects={projects} initialProjectId={null} onClose={() => setShowConfig(false)} />
      )}
    </div>
  )
}

// Hub de la vista global (sin proyecto seleccionado): "En vivo" (default, objetivos
// del mes recalculados al instante) vs "Informes" (historial ya generado).
function AllReportsPanel({ onSelectProject, projects }) {
  const [view, setView] = useState('live')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-900 rounded-lg p-0.5 w-fit">
        {[
          { k: 'live',    label: '🔴 En vivo' },
          { k: 'history', label: '📄 Informes' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setView(t.k)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === t.k
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'live'
        ? <LiveObjectivesPanel onSelectProject={onSelectProject} />
        : <ReportsHistoryPanel onSelectProject={onSelectProject} projects={projects} />}
    </div>
  )
}

// ─── Feedback del cliente (vista agencia) ─────────────────────────────────────

function StarRow({ value, size = 14 }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map(n => {
        const on = n <= Math.round(value)
        return (
          <svg key={n} width={size} height={size} viewBox="0 0 24 24" fill={on ? '#f59e0b' : 'none'} stroke={on ? '#f59e0b' : '#cbd5e1'} strokeWidth="1.6" strokeLinejoin="round">
            <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9l-5.8 3.06 1.1-6.47L2.6 9.35l6.5-.95L12 2.5z" />
          </svg>
        )
      })}
    </span>
  )
}

function ClientFeedbackPanel({ feedback }) {
  const [open, setOpen] = useState(false)
  if (!feedback || !feedback.count) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">💬 Feedback del cliente</span>
          <StarRow value={feedback.avg} />
          <span className="text-sm font-bold text-gray-900 dark:text-white">{feedback.avg}</span>
          <span className="text-xs text-gray-400">({feedback.count} {feedback.count === 1 ? 'respuesta' : 'respuestas'})</span>
        </div>
        <span className="text-gray-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
          {feedback.items.map(it => (
            <div key={it.id} className="text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <StarRow value={it.rating} size={12} />
                <span className="font-medium text-gray-700 dark:text-gray-200">{it.name || 'Anónimo'}</span>
                <span className="text-xs text-gray-400">
                  {new Date(it.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              {it.comment && <p className="text-gray-600 dark:text-gray-400 mt-0.5 whitespace-pre-line">{it.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function InformesTab({ projectId, onSelectProject, projects = [] }) {
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
  const [showSectionsConfig, setShowSectionsConfig] = useState(false)

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

  async function handleRemoveSections(keys) {
    if (!keys || keys.length === 0) return
    const res = await api.patch(`/marketing/projects/${projectId}/reports/${month}/sections`, { remove: keys })
    const removeSet = new Set(keys)
    // Podado optimista local (el backend ya persistió enabledSections + caché)
    setReportData(prev => {
      if (!prev) return prev
      const sections = { ...(prev.sections || {}) }
      for (const k of keys) if (k in sections) sections[k] = null
      if (removeSet.has('analytics') && 'evolution' in sections) sections.evolution = null
      const objectives = removeSet.has('objectives') ? [] : prev.objectives
      return { ...prev, sections, objectives }
    })
    setReportMeta(prev => prev ? { ...prev, enabledSections: res.data.enabledSections } : prev)
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
    return <AllReportsPanel onSelectProject={onSelectProject} projects={projects} />
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
          <button
            onClick={() => setShowSectionsConfig(true)}
            title="Elegí qué secciones de Marketing están disponibles para este proyecto"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            ⚙️
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

      {/* ── Feedback del cliente ── */}
      {isGenerated && <ClientFeedbackPanel feedback={reportMeta?.feedback} />}

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
          onRemoveSection={handleRemoveSections}
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

      {/* ── Config de secciones habilitadas para este proyecto (rueda "⚙️") ── */}
      {showSectionsConfig && (
        <SectionsConfigModal
          projects={projects}
          initialProjectId={projectId}
          onClose={() => setShowSectionsConfig(false)}
        />
      )}
    </div>
  )
}
