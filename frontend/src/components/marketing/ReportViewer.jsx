import { useState } from 'react'
import DOMPurify from 'dompurify'
import RichTextEditor from '../RichTextEditor'
import api from '../../api/client'
import { linkify } from '../../utils/linkify'
import '../situation-editor.css'
import {
  PRINT_STYLES, ReportEditContext, fmt, monthLabel, dataPeriodLabel,
  DeltaChip, SectionCard, ObjectivesResults,
} from './ReportViewerParts'
import { RRSSSection, PublicidadSection, SeoGeoSection, SitioWebSection } from './ReportViewerSections'

export default function ReportViewer({ data, isPublic = false, onSaveAnalysis, onRemoveSection, report = null, workspace = null, showFooter = true, compactHero = false }) {
  const [pendingRemove,    setPendingRemove]    = useState(null)   // { keys, label } — confirmación de borrado de sección
  const [removing,         setRemoving]         = useState(false)
  const [editingResumen,   setEditingResumen]   = useState(false)
  const [resumenDraft,     setResumenDraft]     = useState('')
  const [savingResumen,    setSavingResumen]    = useState(false)

  const [editingNextSteps, setEditingNextSteps] = useState(false)
  const [nextStepsDraft,   setNextStepsDraft]   = useState('')
  const [savingNextSteps,  setSavingNextSteps]  = useState(false)

  const [editingAlertas,   setEditingAlertas]   = useState(false)
  const [alertasDraft,     setAlertasDraft]     = useState('')
  const [savingAlertas,    setSavingAlertas]    = useState(false)

  const [editingHighlights, setEditingHighlights] = useState(false)
  const [highlightsDraft,   setHighlightsDraft]   = useState('')
  const [savingHighlights,  setSavingHighlights]  = useState(false)

  // Contexto editorial por sección: 'rrss' | 'sitio' | 'seo' | null
  const [editingContext, setEditingContext] = useState(null)
  const [contextDraft,   setContextDraft]  = useState('')
  const [savingContext,  setSavingContext]  = useState(false)

  // "Próximos pasos → tareas": estado por índice de paso ('creating' | 'done' | 'error')
  const [createdSteps, setCreatedSteps] = useState({})

  if (!data) return null

  const { project, month, dataMonth, sections, analysis, period } = data
  const objectives = data.objectives || []
  const displayMonth = dataMonth || month
  const periodTitle = period?.label || monthLabel(displayMonth)   // "Junio 2026" | "Abril–Junio 2026" | "1–29 Jun 2026"
  const periodRange = period?.dataLabel || (dataMonth && dataMonth !== month ? dataPeriodLabel(dataMonth) : null)
  const s = sections
  const canEdit = !isPublic && !!onSaveAnalysis

  // Borrado de secciones/grupos (solo vista agencia)
  const editEnabled = canEdit && !!onRemoveSection
  function requestRemove(keys, label) { setPendingRemove({ keys, label }) }
  async function confirmRemove() {
    if (!pendingRemove || !onRemoveSection) return
    setRemoving(true)
    try {
      await onRemoveSection(pendingRemove.keys)
      setPendingRemove(null)
    } finally {
      setRemoving(false)
    }
  }

  // Crea una tarea del proyecto a partir de un "próximo paso" (solo vista admin).
  async function handleCreateTaskFromStep(step, i) {
    if (!project?.id || createdSteps[i] === 'creating' || createdSteps[i] === 'done') return
    const desc = `Marketing - ${String(step).replace(/<[^>]+>/g, '').trim()}`.slice(0, 280)
    setCreatedSteps(prev => ({ ...prev, [i]: 'creating' }))
    try {
      await api.post('/tasks', { description: desc, projectId: String(project.id) })
      setCreatedSteps(prev => ({ ...prev, [i]: 'done' }))
    } catch {
      setCreatedSteps(prev => ({ ...prev, [i]: 'error' }))
    }
  }

  // ── Colores de marca ─────────────────────────────────────────────────────────
  const brandColors = workspace?.brandColors || []
  const brandPrimary   = brandColors[0]?.hex || '#f97316'
  const brandSecondary = brandColors[1]?.hex || '#3b82f6'
  const agencyName     = workspace?.companyName || workspace?.name || ''

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

  async function handleDeleteNextSteps() {
    if (!onSaveAnalysis) return
    if (!window.confirm('¿Eliminar la sección "Próximos pasos"? No aparecerá en el informe del cliente.')) return
    setSavingNextSteps(true)
    try {
      await onSaveAnalysis({ ...analysis, nextSteps: [] })
      setEditingNextSteps(false)
    } finally {
      setSavingNextSteps(false)
    }
  }

  async function handleSaveAlertas() {
    if (!onSaveAnalysis) return
    setSavingAlertas(true)
    try {
      await onSaveAnalysis({ ...analysis, alertas: alertasDraft })
      setEditingAlertas(false)
    } finally {
      setSavingAlertas(false)
    }
  }

  async function handleDeleteAlertas() {
    if (!onSaveAnalysis) return
    if (!window.confirm('¿Eliminar la sección "Oportunidades de mejora"? No aparecerá en el informe del cliente.')) return
    setSavingAlertas(true)
    try {
      await onSaveAnalysis({ ...analysis, alertas: [] })
      setEditingAlertas(false)
    } finally {
      setSavingAlertas(false)
    }
  }

  async function handleSaveHighlights() {
    if (!onSaveAnalysis) return
    setSavingHighlights(true)
    try {
      await onSaveAnalysis({ ...analysis, highlights: highlightsDraft })
      setEditingHighlights(false)
    } finally {
      setSavingHighlights(false)
    }
  }

  async function handleDeleteHighlights() {
    if (!onSaveAnalysis) return
    if (!window.confirm('¿Eliminar la sección "Logros del mes"? No aparecerá en el informe del cliente.')) return
    setSavingHighlights(true)
    try {
      await onSaveAnalysis({ ...analysis, highlights: [] })
      setEditingHighlights(false)
    } finally {
      setSavingHighlights(false)
    }
  }

  async function handleSaveContext(analysisKey, override) {
    if (!onSaveAnalysis) return
    const value = override !== undefined ? override : contextDraft
    setSavingContext(true)
    try {
      await onSaveAnalysis({ ...analysis, [analysisKey]: value })
      setEditingContext(null)
      setContextDraft('')
    } finally {
      setSavingContext(false)
    }
  }

  const contextEditing = {
    editingContext, setEditingContext,
    contextDraft, setContextDraft,
    savingContext,
    onSave: handleSaveContext,
  }

  // ── Valores computados ───────────────────────────────────────────────────────

  // Notas de contexto editorial por sección
  const contextRRSS       = analysis?.contextRRSS       || ''
  const contextPublicidad = analysis?.contextPublicidad || ''
  const contextSitio      = analysis?.contextSitio      || ''
  const contextSEO        = analysis?.contextSEO        || ''

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
    } else if (s.youtube) {
      items.push({ label: 'Suscriptores YT', value: fmt(s.youtube.subscriberCount), delta: s.youtube.deltaSubscribers })
    } else if (s.linkedin) {
      items.push({ label: 'Seguidores LI', value: fmt(s.linkedin.followersCount), delta: s.linkedin.deltaFollowers })
    } else if (s.facebook) {
      items.push({ label: 'Seguidores FB', value: fmt(s.facebook.followersCount), delta: s.facebook.deltaFollowers })
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

  // ── JSX ─────────────────────────────────────────────────────────────────────

  return (
   <ReportEditContext.Provider value={{ enabled: editEnabled, requestRemove }}>
    {/* Modal de confirmación de borrado de sección */}
    {pendingRemove && (
      <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && !removing && setPendingRemove(null)}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Eliminar del informe</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            ¿Seguro que querés eliminar <strong className="text-gray-700 dark:text-gray-200">{pendingRemove.label}</strong>? No se verá en el informe del cliente. Podés recuperarlo regenerando el informe.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPendingRemove(null)} disabled={removing} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={confirmRemove} disabled={removing} className="flex-1 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
              {removing ? 'Eliminando…' : 'Eliminar'}
            </button>
          </div>
        </div>
      </div>
    )}

    <div className={isPublic ? 'space-y-6 max-w-4xl mx-auto' : 'space-y-5'}>

      {/* Print CSS */}
      <style>{PRINT_STYLES}</style>

      {/* ── Header ── */}
      {isPublic && compactHero ? (
        /* Hero compacto: el portal de cliente ya muestra nombre del proyecto + logo/nombre
           de la agencia en su propio hero (ver PortalHero) — acá solo lo que no se repite. */
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-gray-400 dark:text-gray-500 text-[11px] font-semibold uppercase tracking-[0.18em] mb-0.5">Informe de marketing</p>
            <p className="text-gray-800 dark:text-gray-100 text-lg font-bold capitalize">{periodTitle}</p>
            {periodRange && <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">{periodRange}</p>}
          </div>
          <button
            onClick={() => window.print()}
            className="no-print flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shrink-0"
          >
            🖨️ PDF
          </button>
        </div>
      ) : isPublic ? (
        /* Hero de gradiente de marca (el banner de portada ahora vive a nivel de portal, ver PortalHero) */
        <div className="relative rounded-2xl overflow-hidden print-break-avoid shadow-sm">
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${brandPrimary}, ${brandSecondary})` }} />

          <div className="relative flex flex-col justify-end p-6 sm:p-8" style={{ minHeight: '12rem' }}>
            {/* fila superior: PDF */}
            <div className="absolute top-5 left-6 right-6 sm:left-8 sm:right-8 flex items-center justify-end gap-3">
              <button
                onClick={() => window.print()}
                className="no-print flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm transition-colors shrink-0"
              >
                🖨️ PDF
              </button>
            </div>

            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-white/75 text-[11px] font-semibold uppercase tracking-[0.18em] mb-1.5">Informe de marketing</p>
                <h1 className="text-white text-3xl sm:text-4xl font-bold leading-tight" style={{ textShadow: '0 2px 14px rgba(0,0,0,.35)' }}>{project.name}</h1>
                <p className="text-white/90 text-lg font-medium mt-1.5 capitalize">{periodTitle}</p>
                {periodRange && <p className="text-white/65 text-xs mt-1">{periodRange}</p>}
                {project.websiteUrl && (
                  <a href={project.websiteUrl} target="_blank" rel="noreferrer" className="inline-block text-white/80 hover:text-white text-xs mt-2 underline underline-offset-2">
                    {project.websiteUrl.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
              {/* logo de la agencia: abajo a la derecha del hero */}
              {workspace?.hasLogo && workspace?.slug ? (
                <img
                  src={`${import.meta.env.VITE_API_URL}/api/public/logo/${workspace.slug}`}
                  alt={agencyName}
                  className="h-10 max-w-[160px] object-contain shrink-0"
                  style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.45))' }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : agencyName ? (
                <span className="text-white/90 text-sm font-semibold shrink-0" style={{ textShadow: '0 1px 4px rgba(0,0,0,.4)' }}>{agencyName}</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        /* Header de edición (vista agencia) — el banner de portada ahora se administra
           una sola vez desde la config del portal de cliente (ClientPortalConfig), no por informe */
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden print-break-avoid">
          <div className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{project.name}</h1>
                <p className="text-gray-500 dark:text-gray-400 capitalize mt-0.5">Informe — {periodTitle}</p>
                {periodRange && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{periodRange}</p>}
                {project.websiteUrl && (
                  <a href={project.websiteUrl} target="_blank" rel="noreferrer" className="text-xs hover:underline mt-1 block" style={{ color: brandPrimary }}>
                    {project.websiteUrl.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
              <button
                onClick={() => window.print()}
                className="no-print flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shrink-0"
              >
                🖨️ Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 0. Scorecard ejecutivo ── */}
      {heroMetrics.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-6 py-5 print-break-avoid">
          <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: brandPrimary }}>Resumen del período</p>
          <div className={`grid gap-4 ${heroMetrics.length <= 3 ? 'grid-cols-3' : heroMetrics.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}>
            {heroMetrics.map((m, i) => (
              <div key={i} className="text-center min-w-0">
                <p className="text-2xl font-bold leading-tight [overflow-wrap:anywhere]" style={{ color: i === 0 ? brandPrimary : undefined }}>{m.value}</p>
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
                  <div className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed space-y-3">
                    {String(analysis.resumen).split(/\n+/).map(p => p.trim()).filter(Boolean).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                )
              ) : (
                <span className="text-gray-400 dark:text-gray-500 italic text-sm">Sin resumen todavía.</span>
              )}

              {(() => {
                const hls = analysis?.highlights
                const hasHighlights = Array.isArray(hls) ? hls.length > 0 : !!hls
                if (!hasHighlights && !canEdit) return null

                function openHighlightsEditor() {
                  let initial = ''
                  if (Array.isArray(hls) && hls.length > 0) initial = '<ul>' + hls.map(h => `<li>${h}</li>`).join('') + '</ul>'
                  else if (typeof hls === 'string') initial = hls
                  setHighlightsDraft(initial)
                  setEditingHighlights(true)
                }

                return (
                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Logros del mes</p>
                      {canEdit && !editingHighlights && (
                        <div className="no-print flex items-center gap-2">
                          <button onClick={openHighlightsEditor} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">✏️ Editar</button>
                          {hasHighlights && (
                            <button onClick={handleDeleteHighlights} className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">🗑 Eliminar</button>
                          )}
                        </div>
                      )}
                    </div>

                    {editingHighlights ? (
                      <div className="space-y-3 no-print">
                        <RichTextEditor
                          defaultContent={highlightsDraft}
                          onChange={setHighlightsDraft}
                          minHeight={140}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingHighlights(false)}
                            className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleSaveHighlights}
                            disabled={savingHighlights}
                            className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                          >
                            {savingHighlights ? 'Guardando…' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    ) : Array.isArray(hls) && hls.length > 0 ? (
                      hls.map((hl, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                          <span className="text-sm text-gray-700 dark:text-gray-300">{hl}</span>
                        </div>
                      ))
                    ) : typeof hls === 'string' && hls ? (
                      <div
                        className="situation-content text-sm text-gray-700 dark:text-gray-300"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(hls) }}
                      />
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 italic text-sm">Sin logros cargados.</span>
                    )}
                  </div>
                )
              })()}

              {(() => {
                const al = analysis?.alertas
                const hasAlertas = Array.isArray(al) ? al.length > 0 : !!al
                if (!hasAlertas && !canEdit) return null

                function openAlertasEditor() {
                  let initial = ''
                  if (Array.isArray(al) && al.length > 0) initial = '<ul>' + al.map(a => `<li>${a}</li>`).join('') + '</ul>'
                  else if (typeof al === 'string') initial = al
                  setAlertasDraft(initial)
                  setEditingAlertas(true)
                }

                return (
                  <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Oportunidades de mejora</p>
                      {canEdit && !editingAlertas && (
                        <div className="no-print flex items-center gap-2">
                          <button onClick={openAlertasEditor} className="text-xs text-amber-700/80 dark:text-amber-400/80 hover:text-amber-800 dark:hover:text-amber-300 transition-colors">✏️ Editar</button>
                          {hasAlertas && (
                            <button onClick={handleDeleteAlertas} className="text-xs text-amber-700/80 dark:text-amber-400/80 hover:text-red-600 dark:hover:text-red-400 transition-colors">🗑 Eliminar</button>
                          )}
                        </div>
                      )}
                    </div>

                    {editingAlertas ? (
                      <div className="space-y-3 no-print">
                        <RichTextEditor
                          defaultContent={alertasDraft}
                          onChange={setAlertasDraft}
                          minHeight={140}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingAlertas(false)}
                            className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleSaveAlertas}
                            disabled={savingAlertas}
                            className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                          >
                            {savingAlertas ? 'Guardando…' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    ) : Array.isArray(al) && al.length > 0 ? (
                      al.map((a, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-amber-500 mt-0.5 shrink-0">→</span>
                          <span className="text-sm text-amber-800 dark:text-amber-300">{a}</span>
                        </div>
                      ))
                    ) : typeof al === 'string' && al ? (
                      <div
                        className="situation-content text-sm text-amber-800 dark:text-amber-300"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(al) }}
                      />
                    ) : (
                      <span className="text-amber-700/60 dark:text-amber-300/60 italic text-sm">Sin oportunidades de mejora.</span>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </SectionCard>
      )}

      {/* ── Objetivos ── */}
      <ObjectivesResults objectives={objectives} />

      {/* ── 2. Redes Sociales ── */}
      <RRSSSection s={s} contextRRSS={contextRRSS} canEdit={canEdit} contextEditing={contextEditing} />

      {/* ── 3. Publicidad ── */}
      <PublicidadSection s={s} contextPublicidad={contextPublicidad} canEdit={canEdit} contextEditing={contextEditing} />

      {/* ── 4. SEO y GEO ── */}
      <SeoGeoSection s={s} contextSEO={contextSEO} canEdit={canEdit} contextEditing={contextEditing} />

      {/* ── 5. Sitio web ── */}
      <SitioWebSection s={s} contextSitio={contextSitio} brandPrimary={brandPrimary} brandSecondary={brandSecondary} canEdit={canEdit} contextEditing={contextEditing} />

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
              <div className="no-print flex items-center gap-2">
                <button
                  onClick={openNextStepsEditor}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
                >
                  ✏️ Editar
                </button>
                {hasNextSteps && (
                  <button
                    onClick={handleDeleteNextSteps}
                    className="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1 transition-colors"
                  >
                    🗑 Eliminar
                  </button>
                )}
              </div>
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
                  <li key={i} className="flex items-start gap-2 text-sm group">
                    <span className="text-primary-500 font-bold shrink-0">{i + 1}.</span>
                    <span className="text-gray-700 dark:text-gray-300 flex-1 min-w-0">{step}</span>
                    {canEdit && (
                      createdSteps[i] === 'done' ? (
                        <span className="no-print text-[11px] text-green-600 dark:text-green-400 shrink-0 whitespace-nowrap">✓ Tarea creada</span>
                      ) : (
                        <button
                          onClick={() => handleCreateTaskFromStep(step, i)}
                          disabled={createdSteps[i] === 'creating'}
                          title="Crear una tarea del proyecto con este próximo paso"
                          className="no-print text-[11px] text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 shrink-0 whitespace-nowrap opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-50"
                        >
                          {createdSteps[i] === 'creating' ? 'Creando…' : createdSteps[i] === 'error' ? '⚠ Reintentar' : '+ Crear tarea'}
                        </button>
                      )
                    )}
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
        <SectionCard title="Trabajo realizado en el mes" icon="🔧" sectionKey="tasks">
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
                  <span className="text-gray-700 dark:text-gray-300 flex-1 min-w-0 break-words">{linkify(task.description)}</span>
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

      {/* ── Footer público ── (se apaga dentro del portal de cliente, que ya
          muestra su propio footer institucional a nivel de página) */}
      {isPublic && showFooter && (
        <div className="text-center py-4 space-y-1">
          {workspace?.companyName && (
            <p className="text-xs font-semibold" style={{ color: brandPrimary }}>{workspace.companyName}</p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Informe de Marketing · {periodTitle}
          </p>
          <p className="text-xs text-gray-300 dark:text-gray-600">
            Generado con BlissTracker
          </p>
        </div>
      )}
    </div>
   </ReportEditContext.Provider>
  )
}
