/**
 * ReportViewer — componente compartido para el informe mensual.
 * Se usa tanto en la URL pública (/report/:token) como en el tab interno (InformesTab).
 *
 * Props:
 *   data             — objeto { project, month, sections, analysis, connectedTypes }
 *   objectives       — objeto con targets (puede ser {})
 *   isPublic         — boolean: true en la URL del cliente (sin edición)
 *   onSaveAnalysis   — función async(updatedAnalysis) — solo en vista interna
 */

import { useState } from 'react'
import DOMPurify from 'dompurify'
import RichTextEditor from '../RichTextEditor'
import '../situation-editor.css'

// ─── Print CSS (inyectado en el DOM, solo afecta cuando se imprime) ────────────

const PRINT_STYLES = `
@media print {
  .no-print { display: none !important; }
  body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bg-gray-50, .dark\\:bg-gray-700\\/50 { background-color: #f9fafb !important; }
  .bg-white { background-color: white !important; }
  .border { border-color: #e5e7eb !important; }
  .text-gray-900 { color: #111827 !important; }
  .text-gray-700 { color: #374151 !important; }
  .text-gray-600 { color: #4b5563 !important; }
  .text-gray-500 { color: #6b7280 !important; }
  .text-gray-400 { color: #9ca3af !important; }
  svg { display: block; }
  .rounded-2xl { border-radius: 1rem; border: 1px solid #e5e7eb; }
  .space-y-5 > * + * { margin-top: 1.25rem; }
  .print-break-avoid { break-inside: avoid; }
}
`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n, decimals = 0) {
  if (n == null) return '—'
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: decimals })
}

function fmtDuration(secs) {
  if (!secs) return '0s'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

function monthLabel(month) {
  if (!month) return ''
  const [y, m] = month.split('-').map(Number)
  const date = new Date(y, m - 1, 1)
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

function dataPeriodLabel(dataMonth) {
  if (!dataMonth) return null
  const [y, m] = dataMonth.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long' })
  return `Datos del 1 al ${lastDay} de ${monthName} de ${y}`
}

function monthShort(month) {
  if (!month) return ''
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
}

function geoBandColor(band) {
  if (band === 'Excelente') return { stroke: '#3b82f6', text: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20'   }
  if (band === 'Bueno')     return { stroke: '#22c55e', text: 'text-green-600',  bg: 'bg-green-50 dark:bg-green-900/20' }
  if (band === 'Base')      return { stroke: '#eab308', text: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20'}
  return                           { stroke: '#ef4444', text: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20'     }
}

function DeltaChip({ delta, invert = false }) {
  if (delta == null) return null
  const good  = invert ? delta < 0 : delta > 0
  const color = good ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
  return (
    <span className={`text-xs font-semibold ${color}`}>
      {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}%
    </span>
  )
}

// Score ring SVG
function ScoreRing({ score, band }) {
  if (score == null) return null
  const r      = 52
  const circ   = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const colors = geoBandColor(band)

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="65" cy="65" r={r} fill="none"
          stroke={colors.stroke} strokeWidth="10"
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 65 65)"
        />
        <text x="65" y="60" textAnchor="middle" fontSize="26" fontWeight="700" fill="currentColor" className="fill-gray-900 dark:fill-white">{score}</text>
        <text x="65" y="78" textAnchor="middle" fontSize="12" fill="#94a3b8">/100</text>
      </svg>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>{band}</span>
    </div>
  )
}

// Barra horizontal simple
function BarChart({ items, maxVal, color = '#f97316' }) {
  if (!items || items.length === 0) return null
  const max = maxVal || Math.max(...items.map(i => i.value), 1)
  return (
    <div className="space-y-1.5">
      {items.slice(0, 5).map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-28 truncate text-right">{item.label}</span>
          <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max((item.value / max) * 100, 2)}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-12 text-right">{fmt(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

// Línea SVG — soporta una o dos series
function LineChart({ points, color = '#f97316', height = 60, showLabels = true, secondPoints, secondColor = '#3b82f6' }) {
  if (!points || points.length < 2) return null

  const values1   = points.map(p => p.value)
  const values2   = secondPoints ? secondPoints.map(p => p.value) : []
  const allValues = [...values1, ...values2]
  const min       = Math.min(...allValues)
  const max       = Math.max(...allValues)
  const range     = max - min || 1
  const w = 300
  const h = height
  const pad = 12

  function coordsFor(pts) {
    return pts.map((p, i) => ({
      x: pad + (i / (pts.length - 1)) * (w - pad * 2),
      y: h - pad - ((p.value - min) / range) * (h - pad * 2),
      ...p,
    }))
  }

  function pathD(coords) {
    return coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  }
  function areaD(coords) {
    return `${pathD(coords)} L ${coords[coords.length - 1].x} ${h - pad} L ${coords[0].x} ${h - pad} Z`
  }

  const coords1 = coordsFor(points)
  const coords2 = secondPoints ? coordsFor(secondPoints) : null

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="cg1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
          {coords2 && (
            <linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={secondColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={secondColor} stopOpacity="0.02" />
            </linearGradient>
          )}
        </defs>
        <path d={areaD(coords1)} fill="url(#cg1)" />
        <path d={pathD(coords1)} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {coords1.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r="3" fill={color} />)}
        {coords2 && (
          <>
            <path d={areaD(coords2)} fill="url(#cg2)" />
            <path d={pathD(coords2)} fill="none" stroke={secondColor} strokeWidth="2" strokeLinejoin="round" />
            {coords2.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r="3" fill={secondColor} />)}
          </>
        )}
      </svg>
      {showLabels && (
        <div className="flex justify-between mt-1">
          {coords1.map((c, i) => (
            <span key={i} className="text-xs text-gray-400 dark:text-gray-500">{c.label}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Secciones ────────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children, className = '', action }) {
  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 print-break-avoid ${className}`}>
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2"><span>{icon}</span> {title}</span>
        {action}
      </h3>
      {children}
    </div>
  )
}

function GroupHeader({ title }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{title}</span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
    </div>
  )
}

function KpiGrid({ items }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item, i) => (
        <div key={i} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-gray-900 dark:text-white">{item.value ?? '—'}</p>
          {item.delta !== undefined && <DeltaChip delta={item.delta} invert={item.invertDelta} />}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.label}</p>
        </div>
      ))}
    </div>
  )
}

// Tabla de objetivos vs real
function ObjectivesTable({ objectives, sections }) {
  const rows = []

  if (objectives.sessions != null && sections.analytics) {
    const real = sections.analytics.sessions ?? 0
    const pct  = Math.round((real / objectives.sessions) * 100)
    rows.push({ label: 'Sesiones web', target: fmt(objectives.sessions), real: fmt(real), pct })
  }
  if (objectives.newUsers != null && sections.analytics) {
    const real = sections.analytics.newUsers ?? 0
    const pct  = Math.round((real / objectives.newUsers) * 100)
    rows.push({ label: 'Usuarios nuevos', target: fmt(objectives.newUsers), real: fmt(real), pct })
  }
  if (objectives.followersIg != null && sections.instagram) {
    const real = sections.instagram.followersCount ?? 0
    const pct  = Math.round((real / objectives.followersIg) * 100)
    rows.push({ label: 'Seguidores Instagram', target: fmt(objectives.followersIg), real: fmt(real), pct })
  }
  if (objectives.followersTk != null && sections.tiktok) {
    const real = sections.tiktok.followersCount ?? 0
    const pct  = Math.round((real / objectives.followersTk) * 100)
    rows.push({ label: 'Seguidores TikTok', target: fmt(objectives.followersTk), real: fmt(real), pct })
  }
  if (objectives.engagementIg != null && sections.instagram) {
    const real = sections.instagram.engagementRate ?? 0
    const pct  = Math.round((real / objectives.engagementIg) * 100)
    rows.push({ label: 'Engagement Instagram', target: `${objectives.engagementIg}%`, real: `${real?.toFixed(2) ?? '—'}%`, pct })
  }
  if (objectives.conversions != null && sections.analytics) {
    const real = sections.analytics.conversions ?? 0
    const pct  = Math.round((real / objectives.conversions) * 100)
    rows.push({ label: 'Conversiones', target: fmt(objectives.conversions), real: fmt(real), pct })
  }

  if (rows.length === 0) return null

  return (
    <SectionCard title="Objetivos del mes" icon="🎯">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Métrica</th>
              <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Objetivo</th>
              <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Real</th>
              <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Cumplimiento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                <td className="py-2.5 text-gray-700 dark:text-gray-300">{row.label}</td>
                <td className="py-2.5 text-right text-gray-500 dark:text-gray-400">{row.target}</td>
                <td className="py-2.5 text-right font-semibold text-gray-900 dark:text-white">{row.real}</td>
                <td className="py-2.5 text-right">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                    row.pct >= 90 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : row.pct >= 70 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>{row.pct}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ReportViewer({ data, objectives = {}, isPublic = false, onSaveAnalysis }) {
  const [editingResumen,   setEditingResumen]   = useState(false)
  const [resumenDraft,     setResumenDraft]     = useState('')
  const [savingResumen,    setSavingResumen]    = useState(false)

  const [editingNextSteps, setEditingNextSteps] = useState(false)
  const [nextStepsDraft,   setNextStepsDraft]   = useState('')
  const [savingNextSteps,  setSavingNextSteps]  = useState(false)

  // Contexto editorial por sección: 'rrss' | 'sitio' | 'seo' | null
  const [editingContext, setEditingContext] = useState(null)
  const [contextDraft,   setContextDraft]  = useState('')
  const [savingContext,  setSavingContext]  = useState(false)

  if (!data) return null

  const { project, month, dataMonth, sections, analysis } = data
  const displayMonth = dataMonth || month
  const s = sections
  const canEdit = !isPublic && !!onSaveAnalysis

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleSaveResumen() {
    if (!onSaveAnalysis) return
    setSavingResumen(true)
    try {
      await onSaveAnalysis({ ...analysis, resumen: resumenDraft })
      setEditingResumen(false)
    } finally {
      setSavingResumen(false)
    }
  }

  async function handleSaveNextSteps() {
    if (!onSaveAnalysis) return
    setSavingNextSteps(true)
    try {
      await onSaveAnalysis({ ...analysis, nextSteps: nextStepsDraft })
      setEditingNextSteps(false)
    } finally {
      setSavingNextSteps(false)
    }
  }

  async function handleSaveContext(analysisKey) {
    if (!onSaveAnalysis) return
    setSavingContext(true)
    try {
      await onSaveAnalysis({ ...analysis, [analysisKey]: contextDraft })
      setEditingContext(null)
      setContextDraft('')
    } finally {
      setSavingContext(false)
    }
  }

  // ── Valores computados ───────────────────────────────────────────────────────

  // Canales de tráfico para el chart
  const channels = (() => {
    try {
      const ch = s.analytics?.topChannels || []
      return ch.map(c => ({ label: c.channel || c.channelGroup || c.sessionDefaultChannelGroup || '', value: c.sessions || 0 }))
        .filter(c => c.value > 0)
    } catch { return [] }
  })()

  // Evolución (sesiones + nuevos usuarios)
  const evolutionPoints = (() => {
    if (!s.evolution || s.evolution.length < 2) return null
    return s.evolution.map(snap => ({
      label: monthShort(snap.month),
      value: snap.sessions ?? 0,
    }))
  })()

  const evolutionNewUsers = (() => {
    if (!s.evolution || s.evolution.length < 2) return null
    return s.evolution.map(snap => ({
      label: monthShort(snap.month),
      value: snap.newUsers ?? 0,
    }))
  })()

  // Tráfico desde IAs
  const aiTrafficEntries = (() => {
    const entries = Object.entries(s.analytics?.aiTraffic || {}).sort(([, a], [, b]) => b - a)
    return entries.length > 0 ? entries : null
  })()

  const AI_LABELS = {
    chatgpt: 'ChatGPT', gemini: 'Gemini', claude: 'Claude',
    grok: 'Grok', metaAi: 'Meta AI', perplexity: 'Perplexity', copilot: 'Copilot',
  }

  // Notas de contexto editorial por sección
  const contextRRSS  = analysis?.contextRRSS  || ''
  const contextSitio = analysis?.contextSitio || ''
  const contextSEO   = analysis?.contextSEO   || ''

  // Flags de disponibilidad por grupo
  const hasRRSS   = !!(s.instagram || s.tiktok)
  const hasAds    = !!(s.metaAds || s.googleAds)
  const hasSeoGeo = !!(s.keywords || s.seo || s.geo || aiTrafficEntries || s.cannibalization)
  const hasSitio  = !!(s.analytics || evolutionPoints || s.performance)

  // ── Scorecard ejecutivo: métricas clave de todos los servicios ───────────────
  const heroMetrics = (() => {
    const items = []
    if (s.analytics) {
      items.push({ label: 'Sesiones web',    value: fmt(s.analytics.sessions), delta: s.analytics.delta?.sessions })
      if (s.analytics.conversions > 0) {
        items.push({ label: 'Conversiones', value: fmt(s.analytics.conversions), delta: s.analytics.delta?.conversions })
      }
    }
    if (s.instagram) {
      items.push({ label: 'Seguidores IG', value: fmt(s.instagram.followersCount), delta: s.instagram.deltaFollowers })
    } else if (s.tiktok) {
      items.push({ label: 'Seguidores TK', value: fmt(s.tiktok.followersCount), delta: s.tiktok.deltaFollowers })
    }
    if (s.seo?.avgPosition) {
      items.push({ label: 'Pos. media SEO', value: String(s.seo.avgPosition) })
    } else if (s.seo?.clicks > 0) {
      items.push({ label: 'Clics orgánicos', value: fmt(s.seo.clicks), delta: s.seo.delta?.clicks })
    }
    // Inversión publicitaria total (Google Ads + Meta Ads)
    const totalAdSpend = (s.googleAds?.cost ?? 0) + (s.metaAds?.spend ?? 0)
    if (totalAdSpend > 0) {
      items.push({ label: 'Inversión en ads', value: `$${totalAdSpend.toLocaleString('es-AR', { maximumFractionDigits: 0 })}` })
    }
    if (s.geo) {
      items.push({ label: 'Score GEO', value: `${s.geo.score}/100` })
    }
    if (s.performance?.mobile) {
      items.push({ label: 'Performance', value: String(s.performance.mobile.score) })
    }
    return items.slice(0, 6)
  })()

  // ── Helpers de contexto editorial ───────────────────────────────────────────
  function ContextNote({ sectionKey, analysisKey, contextValue }) {
    if (!contextValue && !canEdit) return null
    const isEditing = editingContext === sectionKey

    return (
      <SectionCard
        title="Contexto del período"
        icon="💬"
        action={canEdit && !isEditing && (
          <button
            onClick={() => { setContextDraft(contextValue); setEditingContext(sectionKey) }}
            className="no-print text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
          >
            ✏️ {contextValue ? 'Editar' : 'Agregar nota'}
          </button>
        )}
      >
        {isEditing ? (
          <div className="space-y-3 no-print">
            <textarea
              value={contextDraft}
              onChange={e => setContextDraft(e.target.value)}
              rows={4}
              placeholder="Explicá qué pasó en esta área: campañas lanzadas, factores externos, acciones realizadas, etc."
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setEditingContext(null); setContextDraft('') }}
                className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSaveContext(analysisKey)}
                disabled={savingContext}
                className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {savingContext ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        ) : contextValue ? (
          <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line">{contextValue}</p>
        ) : (
          <p className="text-gray-400 dark:text-gray-500 italic text-sm">Sin nota del período.</p>
        )}
      </SectionCard>
    )
  }

  // ── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <div className={`space-y-5 ${isPublic ? 'max-w-3xl mx-auto' : ''}`}>

      {/* Print CSS */}
      <style>{PRINT_STYLES}</style>

      {/* ── Header ── */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 print-break-avoid">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{project.name}</h1>
            <p className="text-gray-500 dark:text-gray-400 capitalize mt-0.5">
              Informe mensual — {monthLabel(month)}
            </p>
            {dataMonth && dataMonth !== month && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 capitalize">
                {dataPeriodLabel(dataMonth)}
              </p>
            )}
            {project.websiteUrl && (
              <a href={project.websiteUrl} target="_blank" rel="noreferrer"
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1 block">
                {project.websiteUrl}
              </a>
            )}
          </div>
          {isPublic && (
            <button
              onClick={() => window.print()}
              className="no-print flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shrink-0"
            >
              🖨️ Imprimir / PDF
            </button>
          )}
        </div>
      </div>

      {/* ── 0. Scorecard ejecutivo ── */}
      {heroMetrics.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-6 py-5 print-break-avoid">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">Resumen del período</p>
          <div className={`grid gap-4 ${heroMetrics.length <= 3 ? 'grid-cols-3' : heroMetrics.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}>
            {heroMetrics.map((m, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{m.value}</p>
                <div className="h-4 flex items-center justify-center">
                  {m.delta != null ? <DeltaChip delta={m.delta} invert={m.invertDelta} /> : <span />}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 1. Resumen general ── */}
      {(analysis?.resumen || canEdit) && (
        <SectionCard
          title="Resumen del mes"
          icon="📝"
          action={canEdit && !editingResumen && (
            <button
              onClick={() => { setResumenDraft(analysis?.resumen || ''); setEditingResumen(true) }}
              className="no-print text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
            >
              ✏️ Editar
            </button>
          )}
        >
          {editingResumen ? (
            <div className="space-y-3 no-print">
              <RichTextEditor
                defaultContent={resumenDraft}
                onChange={setResumenDraft}
                minHeight={160}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditingResumen(false)}
                  className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveResumen}
                  disabled={savingResumen}
                  className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {savingResumen ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {analysis?.resumen ? (
                analysis.resumen.startsWith('<') ? (
                  <div
                    className="situation-content text-sm text-gray-700 dark:text-gray-300"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(analysis.resumen) }}
                  />
                ) : (
                  <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                    {analysis.resumen}
                  </p>
                )
              ) : (
                <span className="text-gray-400 dark:text-gray-500 italic text-sm">Sin resumen todavía.</span>
              )}

              {analysis?.highlights?.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Logros del mes</p>
                  {analysis.highlights.map((hl, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{hl}</span>
                    </div>
                  ))}
                </div>
              )}

              {analysis?.alertas?.length > 0 && (
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl space-y-1">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Oportunidades de mejora</p>
                  {analysis.alertas.map((a, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5 shrink-0">→</span>
                      <span className="text-sm text-amber-800 dark:text-amber-300">{a}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </SectionCard>
      )}

      {/* ── Objetivos ── */}
      {Object.keys(objectives).length > 0 && (
        <ObjectivesTable objectives={objectives} sections={s} />
      )}

      {/* ── 2. Redes Sociales ── */}
      {hasRRSS && (
        <>
          <GroupHeader title="Redes Sociales" />
          <div className={`grid gap-5 ${s.instagram && s.tiktok ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
            {s.instagram && (
              <SectionCard title="Instagram" icon="📸">
                <KpiGrid items={[
                  { label: 'Seguidores',   value: fmt(s.instagram.followersCount), delta: s.instagram.deltaFollowers },
                  { label: 'Engagement',  value: s.instagram.engagementRate != null ? `${s.instagram.engagementRate.toFixed(2)}%` : '—', delta: s.instagram.deltaEngagement },
                  { label: 'Avg. likes',  value: fmt(s.instagram.avgLikes, 0) },
                  { label: 'Posts / mes', value: fmt(s.instagram.postsCount) },
                ]} />
              </SectionCard>
            )}

            {s.tiktok && (
              <SectionCard title="TikTok" icon="🎵">
                <KpiGrid items={[
                  { label: 'Seguidores',   value: fmt(s.tiktok.followersCount), delta: s.tiktok.deltaFollowers },
                  { label: 'Engagement',  value: s.tiktok.engagementRate != null ? `${s.tiktok.engagementRate.toFixed(2)}%` : '—', delta: s.tiktok.deltaEngagement },
                  { label: 'Avg. views',  value: fmt(s.tiktok.avgViews, 0) },
                  { label: 'Posts / mes', value: fmt(s.tiktok.postsThisMonth) },
                ]} />
              </SectionCard>
            )}
          </div>
          <ContextNote sectionKey="rrss" analysisKey="contextRRSS" contextValue={contextRRSS} />
        </>
      )}

      {/* ── 3. Publicidad ── */}
      {hasAds && (
        <>
          <GroupHeader title="Publicidad" />
          <div className={`grid gap-5 ${s.metaAds && s.googleAds ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
            {s.metaAds && (
              <SectionCard title="Meta Ads" icon="📣">
                <KpiGrid items={[
                  { label: 'Inversión',    value: s.metaAds.spend != null ? `$${fmt(s.metaAds.spend, 2)}` : '—' },
                  { label: 'Impresiones', value: fmt(s.metaAds.impressions) },
                  { label: 'Clics',       value: fmt(s.metaAds.clicks) },
                  { label: 'CTR',         value: s.metaAds.ctr != null ? `${Number(s.metaAds.ctr).toFixed(2)}%` : '—' },
                ]} />
              </SectionCard>
            )}
            {s.googleAds && (
              <SectionCard title="Google Ads" icon="🅖">
                <KpiGrid items={[
                  { label: 'Inversión',    value: s.googleAds.cost != null ? `$${fmt(s.googleAds.cost, 2)}` : '—' },
                  { label: 'Impresiones', value: fmt(s.googleAds.impressions) },
                  { label: 'Clics',       value: fmt(s.googleAds.clicks) },
                  { label: 'CTR',         value: s.googleAds.ctr != null ? `${Number(s.googleAds.ctr).toFixed(2)}%` : '—' },
                ]} />
              </SectionCard>
            )}
          </div>
        </>
      )}

      {/* ── 4. SEO y GEO ── */}
      {hasSeoGeo && (
        <>
          <GroupHeader title="SEO y GEO" />

          {/* Keywords */}
          {s.keywords && (
            <SectionCard title="Posicionamiento SEO" icon="🔑">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{s.keywords.avgPosition}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Posición promedio</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{s.keywords.count}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Keywords rastreadas</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">+{s.keywords.improved?.length ?? 0}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Mejoraron</p>
                </div>
              </div>

              {s.keywords.table?.length > 0 && (
                <div className="overflow-x-auto mt-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Keyword</th>
                        <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Posición</th>
                        <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Cambio</th>
                        <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Clics</th>
                        <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Impresiones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.keywords.table.slice(0, 15).map((kw, i) => (
                        <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                          <td className="py-1.5 text-gray-700 dark:text-gray-300">{kw.query}</td>
                          <td className="py-1.5 text-right font-semibold text-gray-900 dark:text-white">{kw.position != null ? Number(kw.position).toFixed(1) : '—'}</td>
                          <td className="py-1.5 text-right">
                            {kw.delta != null
                              ? <span className={kw.delta > 0 ? 'text-green-600' : kw.delta < 0 ? 'text-red-500' : 'text-gray-400'}>
                                  {kw.delta > 0 ? `↑${Number(kw.delta).toFixed(1)}` : kw.delta < 0 ? `↓${Math.abs(Number(kw.delta)).toFixed(1)}` : '—'}
                                </span>
                              : <span className="text-gray-400">—</span>
                            }
                          </td>
                          <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(kw.clicks)}</td>
                          <td className="py-1.5 text-right text-gray-500 dark:text-gray-500">{kw.impressions != null ? fmt(kw.impressions) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {/* SEO — Search Console */}
          {s.seo && (
            <SectionCard title="SEO — Google Search Console" icon="🔍">
              <KpiGrid items={[
                { label: 'Clicks orgánicos', value: fmt(s.seo.clicks),      delta: s.seo.delta?.clicks },
                { label: 'Impresiones',      value: fmt(s.seo.impressions), delta: s.seo.delta?.impressions },
                { label: 'CTR promedio',     value: s.seo.ctr != null ? `${(s.seo.ctr * 100).toFixed(2)}%` : '—' },
                { label: 'Posición media',   value: s.seo.avgPosition != null ? String(s.seo.avgPosition) : '—',
                  delta: s.seo.delta?.avgPosition != null ? s.seo.delta.avgPosition : undefined,
                  invertDelta: true,
                },
              ]} />

              {s.seo.topQueries?.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Top consultas</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Consulta</th>
                          <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Clics</th>
                          <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Impres.</th>
                          <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">CTR</th>
                          <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Posición</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.seo.topQueries.map((q, i) => (
                          <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                            <td className="py-1.5 text-gray-700 dark:text-gray-300 max-w-[180px] truncate">{q.query}</td>
                            <td className="py-1.5 text-right font-semibold text-gray-900 dark:text-white">{fmt(q.clicks)}</td>
                            <td className="py-1.5 text-right text-gray-500 dark:text-gray-500">{fmt(q.impressions)}</td>
                            <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{q.ctr != null ? `${(q.ctr * 100).toFixed(1)}%` : '—'}</td>
                            <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{q.position != null ? Number(q.position).toFixed(1) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {s.seo.topPages?.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Top páginas</p>
                  <div className="space-y-1.5">
                    {s.seo.topPages.map((p, i) => {
                      let label = p.page || ''
                      try { label = new URL(p.page).pathname } catch { /* keep original */ }
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="text-gray-400 dark:text-gray-500 w-4 text-right shrink-0">{i + 1}.</span>
                          <span className="flex-1 text-gray-700 dark:text-gray-300 truncate">{label}</span>
                          <span className="text-gray-500 dark:text-gray-400 shrink-0">{fmt(p.clicks)} clics</span>
                          <span className="text-gray-400 dark:text-gray-500 shrink-0">pos. {p.position != null ? Number(p.position).toFixed(1) : '—'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* GEO */}
          {s.geo && (
            <SectionCard title="Presencia en IAs (GEO)" icon="🌐">
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                <div className="shrink-0 flex flex-col items-center gap-1">
                  <ScoreRing score={s.geo.score} band={s.geo.band} />
                  {s.geo.date && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(s.geo.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { label: 'Citabilidad',        key: 'citability' },
                    { label: 'Autoridad de marca',  key: 'brandAuthority' },
                    { label: 'E-E-A-T',             key: 'eeat' },
                    { label: 'Técnico',             key: 'technical' },
                    { label: 'Plataformas',         key: 'platforms' },
                    { label: 'Schema',              key: 'schema' },
                  ].filter(c => s.geo.components[c.key] != null).map(c => {
                    const val = s.geo.components[c.key]
                    const col = val >= 86 ? '#3b82f6' : val >= 68 ? '#22c55e' : val >= 36 ? '#eab308' : '#ef4444'
                    return (
                      <div key={c.key} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.label}</span>
                          <span className="text-xs font-bold text-gray-900 dark:text-white ml-1">{Math.round(val)}</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${val}%`, backgroundColor: col }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {s.geo.history && s.geo.history.length >= 2 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Evolución del score</p>
                  <LineChart
                    points={s.geo.history.map(h => ({
                      label: new Date(h.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }),
                      value: h.score,
                    }))}
                    color="#3b82f6"
                    height={70}
                  />
                </div>
              )}
            </SectionCard>
          )}

          {/* Tráfico desde IAs */}
          {aiTrafficEntries && (
            <SectionCard title="Sesiones referidas desde IAs" icon="🤖">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {aiTrafficEntries.map(([key, sessions]) => (
                  <div key={key} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{fmt(sessions)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{AI_LABELS[key] ?? key}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 text-right mt-3">
                Total: <strong className="text-gray-600 dark:text-gray-300">{fmt(aiTrafficEntries.reduce((acc, [, v]) => acc + v, 0))} sesiones</strong> desde IAs este mes
              </p>
            </SectionCard>
          )}

          {/* Canibalización SEO */}
          {s.cannibalization && (
            <SectionCard title="Canibalización SEO" icon="⚠️">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="text-center bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{s.cannibalization.totalConflicts}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Conflictos totales</p>
                </div>
                <div className="text-center bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{s.cannibalization.criticalCount}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Críticos</p>
                </div>
                <div className="text-center bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-3">
                  <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{s.cannibalization.warningCount}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Advertencias</p>
                </div>
                <div className="text-center bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{s.cannibalization.trafficAtRisk > 0 ? fmt(s.cannibalization.trafficAtRisk) : '—'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Tráfico en riesgo</p>
                </div>
              </div>
              {s.cannibalization.criticalCount > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-lg px-3 py-2">
                  Se detectaron <strong>{s.cannibalization.criticalCount}</strong> conflictos críticos de canibalización. Se recomienda revisar y consolidar las páginas afectadas.
                </p>
              )}
              {s.cannibalization.date && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-right mt-2">
                  Análisis del {new Date(s.cannibalization.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })} · Período: {s.cannibalization.dateRange}
                </p>
              )}
            </SectionCard>
          )}

          <ContextNote sectionKey="seo" analysisKey="contextSEO" contextValue={contextSEO} />
        </>
      )}

      {/* ── 5. Sitio web ── */}
      {hasSitio && (
        <>
          <GroupHeader title="Sitio web" />

          {/* Analytics GA4 */}
          {s.analytics && (
            <SectionCard title="Analytics web" icon="📊">
              <KpiGrid items={[
                { label: 'Sesiones',        value: fmt(s.analytics.sessions),    delta: s.analytics.delta?.sessions },
                { label: 'Usuarios nuevos', value: fmt(s.analytics.newUsers),    delta: s.analytics.delta?.newUsers },
                { label: 'Páginas vistas',  value: fmt(s.analytics.pageviews),   delta: s.analytics.delta?.pageviews },
                { label: 'Conversiones',    value: fmt(s.analytics.conversions), delta: s.analytics.delta?.conversions },
                { label: 'Tasa de rebote',  value: `${s.analytics.bounceRate != null ? (s.analytics.bounceRate * 100).toFixed(1) : '—'}%`, invertDelta: true },
                { label: 'Duración media',  value: fmtDuration(s.analytics.avgDuration) },
              ]} />

              {/* Canales de tráfico */}
              {channels.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Canales de tráfico</p>
                  <BarChart items={channels} color="#f97316" />
                </div>
              )}

              {/* Fuentes de tráfico */}
              {s.analytics.topSources?.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Fuentes de tráfico</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Fuente</th>
                          <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Medium</th>
                          <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Sesiones</th>
                          <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.analytics.topSources.map((src, i) => (
                          <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                            <td className="py-1.5 font-medium text-gray-700 dark:text-gray-300">{src.source || '(direct)'}</td>
                            <td className="py-1.5 text-gray-500 dark:text-gray-400">{src.medium || '—'}</td>
                            <td className="py-1.5 text-right text-gray-700 dark:text-gray-300">{fmt(src.sessions)}</td>
                            <td className="py-1.5 text-right text-gray-400">{src.pct != null ? `${src.pct}%` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top páginas */}
              {s.analytics.topPages?.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Top páginas</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium w-6">#</th>
                          <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Página</th>
                          <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Vistas</th>
                          <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Sesiones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.analytics.topPages.map((page, i) => (
                          <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                            <td className="py-1.5 text-gray-400">{i + 1}</td>
                            <td className="py-1.5 pr-3">
                              <p className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[220px]">{page.path}</p>
                              {page.title && page.title !== page.path && (
                                <p className="text-gray-400 dark:text-gray-500 truncate max-w-[220px]">{page.title}</p>
                              )}
                            </td>
                            <td className="py-1.5 text-right font-medium text-gray-700 dark:text-gray-300">{fmt(page.pageviews)}</td>
                            <td className="py-1.5 text-right text-gray-500 dark:text-gray-400">{fmt(page.sessions)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* Evolución multi-mes (hasta 6 meses, sesiones + usuarios nuevos) */}
          {evolutionPoints && (
            <SectionCard title="Evolución web" icon="📈">
              {/* Leyenda */}
              {evolutionNewUsers && (
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-full bg-orange-500" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Sesiones</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Usuarios nuevos</span>
                  </div>
                </div>
              )}
              <LineChart
                points={evolutionPoints}
                color="#f97316"
                height={80}
                secondPoints={evolutionNewUsers}
                secondColor="#3b82f6"
              />

              {/* Tabla mes a mes */}
              {s.evolution?.length >= 2 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Mes</th>
                        <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Sesiones</th>
                        <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Nuevos</th>
                        <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Conversiones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...s.evolution].reverse().map((snap, i) => (
                        <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                          <td className="py-1.5 text-gray-600 dark:text-gray-400 capitalize">{monthLabel(snap.month)}</td>
                          <td className="py-1.5 text-right font-medium text-gray-900 dark:text-white">{fmt(snap.sessions)}</td>
                          <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(snap.newUsers)}</td>
                          <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(snap.conversions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {/* Performance */}
          {s.performance && (
            <SectionCard title="Performance web" icon="⚡">
              {/* Scores móvil / desktop */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                {s.performance.mobile && (
                  <div className="text-center bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                    <p className={`text-4xl font-bold ${
                      s.performance.mobile.score >= 90 ? 'text-green-600' :
                      s.performance.mobile.score >= 50 ? 'text-yellow-600' : 'text-red-600'
                    }`}>{s.performance.mobile.score}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">📱 Móvil</p>
                    <p className="text-xs font-medium mt-0.5 text-gray-400 dark:text-gray-500">
                      {s.performance.mobile.score >= 90 ? 'Excelente' : s.performance.mobile.score >= 50 ? 'Necesita mejoras' : 'Deficiente'}
                    </p>
                  </div>
                )}
                {s.performance.desktop && (
                  <div className="text-center bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                    <p className={`text-4xl font-bold ${
                      s.performance.desktop.score >= 90 ? 'text-green-600' :
                      s.performance.desktop.score >= 50 ? 'text-yellow-600' : 'text-red-600'
                    }`}>{s.performance.desktop.score}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">🖥️ Desktop</p>
                    <p className="text-xs font-medium mt-0.5 text-gray-400 dark:text-gray-500">
                      {s.performance.desktop.score >= 90 ? 'Excelente' : s.performance.desktop.score >= 50 ? 'Necesita mejoras' : 'Deficiente'}
                    </p>
                  </div>
                )}
              </div>

              {/* Core Web Vitals */}
              {(() => {
                const mm = s.performance.mobile?.metrics  || {}
                const dm = s.performance.desktop?.metrics || {}
                const cwv = [
                  { label: 'LCP',         desc: 'Largest Contentful Paint', mobile: mm.lcp != null ? `${(Number(mm.lcp)/1000).toFixed(1)}s` : null, desktop: dm.lcp != null ? `${(Number(dm.lcp)/1000).toFixed(1)}s` : null, good: v => parseFloat(v) <= 2.5, warn: v => parseFloat(v) <= 4.0 },
                  { label: 'CLS',         desc: 'Cumulative Layout Shift',  mobile: mm.cls != null ? Number(mm.cls).toFixed(3) : null,                desktop: dm.cls != null ? Number(dm.cls).toFixed(3) : null,                good: v => parseFloat(v) <= 0.1, warn: v => parseFloat(v) <= 0.25 },
                  { label: 'FCP',         desc: 'First Contentful Paint',   mobile: mm.fcp != null ? `${(Number(mm.fcp)/1000).toFixed(1)}s` : null, desktop: dm.fcp != null ? `${(Number(dm.fcp)/1000).toFixed(1)}s` : null, good: v => parseFloat(v) <= 1.8, warn: v => parseFloat(v) <= 3.0 },
                  { label: 'TBT',         desc: 'Total Blocking Time',      mobile: mm.tbt != null ? `${Math.round(Number(mm.tbt))}ms` : null,       desktop: dm.tbt != null ? `${Math.round(Number(dm.tbt))}ms` : null,       good: v => parseInt(v) <= 200,  warn: v => parseInt(v) <= 600 },
                  { label: 'Speed Index', desc: 'Speed Index',              mobile: mm.speedIndex != null ? `${(Number(mm.speedIndex)/1000).toFixed(1)}s` : null, desktop: dm.speedIndex != null ? `${(Number(dm.speedIndex)/1000).toFixed(1)}s` : null, good: v => parseFloat(v) <= 3.4, warn: v => parseFloat(v) <= 5.8 },
                  { label: 'TTI',         desc: 'Time to Interactive',      mobile: mm.tti != null ? `${(Number(mm.tti)/1000).toFixed(1)}s` : null, desktop: dm.tti != null ? `${(Number(dm.tti)/1000).toFixed(1)}s` : null, good: v => parseFloat(v) <= 3.8, warn: v => parseFloat(v) <= 7.3 },
                ].filter(v => v.mobile || v.desktop)

                if (cwv.length === 0) return null
                return (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Core Web Vitals</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {cwv.map((v, i) => {
                        const val = v.mobile || v.desktop
                        const colorClass = !val ? 'text-gray-400'
                          : v.good(val) ? 'text-green-600 dark:text-green-400'
                          : v.warn(val) ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                        return (
                          <div key={i} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 text-center">
                            <p className={`text-base font-bold ${colorClass}`}>{val ?? '—'}</p>
                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{v.label}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{v.desc}</p>
                            {v.mobile && v.desktop && v.mobile !== v.desktop && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                📱 {v.mobile} · 🖥️ {v.desktop}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </SectionCard>
          )}

          <ContextNote sectionKey="sitio" analysisKey="contextSitio" contextValue={contextSitio} />
        </>
      )}

      {/* ── Próximos pasos ── */}
      {(() => {
        const ns = analysis?.nextSteps
        const hasNextSteps = Array.isArray(ns) ? ns.length > 0 : !!ns
        if (!hasNextSteps && !canEdit) return null

        function openNextStepsEditor() {
          let initial = ''
          if (Array.isArray(ns) && ns.length > 0) {
            initial = '<ul>' + ns.map(s => `<li>${s}</li>`).join('') + '</ul>'
          } else if (typeof ns === 'string') {
            initial = ns
          }
          setNextStepsDraft(initial)
          setEditingNextSteps(true)
        }

        return (
          <SectionCard
            title="Próximos pasos"
            icon="🚀"
            action={canEdit && !editingNextSteps && (
              <button
                onClick={openNextStepsEditor}
                className="no-print text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
              >
                ✏️ Editar
              </button>
            )}
          >
            {editingNextSteps ? (
              <div className="space-y-3 no-print">
                <RichTextEditor
                  defaultContent={nextStepsDraft}
                  onChange={setNextStepsDraft}
                  minHeight={160}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingNextSteps(false)}
                    className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveNextSteps}
                    disabled={savingNextSteps}
                    className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {savingNextSteps ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : Array.isArray(ns) && ns.length > 0 ? (
              <ul className="space-y-2">
                {ns.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-primary-500 font-bold shrink-0">{i + 1}.</span>
                    <span className="text-gray-700 dark:text-gray-300">{step}</span>
                  </li>
                ))}
              </ul>
            ) : typeof ns === 'string' && ns ? (
              <div
                className="situation-content text-sm text-gray-700 dark:text-gray-300"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ns) }}
              />
            ) : (
              <p className="text-gray-400 dark:text-gray-500 italic text-sm">Sin próximos pasos todavía.</p>
            )}
          </SectionCard>
        )
      })()}

      {/* ── Trabajo realizado en el mes ── */}
      {s.tasks && s.tasks.length > 0 && (
        <SectionCard title="Trabajo realizado en el mes" icon="🔧">
          <ul className="space-y-2">
            {s.tasks.map((task) => {
              const mins = task.minutesOverride != null
                ? task.minutesOverride
                : (task.startedAt && task.completedAt)
                  ? Math.max(0, Math.round((new Date(task.completedAt) - new Date(task.startedAt)) / 60000) - (task.pausedMinutes || 0))
                  : null
              const duration = mins != null && mins > 0
                ? (mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60 > 0 ? `${mins % 60}m` : ''}`.trim())
                : null
              return (
                <li key={task.id} className="flex items-start gap-2 text-sm">
                  <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                  <span className="text-gray-700 dark:text-gray-300 flex-1">{task.description}</span>
                  <div className="ml-2 flex items-center gap-2 shrink-0">
                    {duration && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{duration}</span>
                    )}
                    {task.user?.name && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{task.user.name}</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      )}

      {/* ── Footer público ── */}
      {isPublic && (
        <div className="text-center py-4">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Generado por <strong className="text-gray-600 dark:text-gray-400">BlissTracker</strong> · {monthLabel(displayMonth)}
          </p>
        </div>
      )}
    </div>
  )
}
