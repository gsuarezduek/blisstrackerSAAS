import { useState, useRef } from 'react'
import DOMPurify from 'dompurify'
import RichTextEditor from '../RichTextEditor'
import SocialIcon from './SocialIcon'
import api from '../../api/client'
import '../situation-editor.css'
import {
  PRINT_STYLES, ReportEditContext, fmt, fmtDuration, monthLabel, dataPeriodLabel,
  monthShort, DeltaChip, ScoreRing, BarChart, LineChart, SectionCard, GroupHeader,
  KpiGrid, BestInstagramPost, StoriesBlock, BestAd, BestTikTokVideo, BestYouTubeVideo,
  BestLinkedinPost, BestFacebookPost, LinkedinAudience, ObjectivesResults, CompetitorComparison,
} from './ReportViewerParts'

export default function ReportViewer({ data, isPublic = false, onSaveAnalysis, onBannerUpload, onBannerDelete, onRemoveSection, report = null, workspace = null }) {
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

  // Banner del informe (por informe individual, no por workspace)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [bannerKey,       setBannerKey]       = useState(0)   // fuerza recarga de img tras upload
  const [hasBanner,       setHasBanner]       = useState(report?.hasBanner ?? false)
  const bannerInputRef = useRef()

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

  // ── Banner upload ────────────────────────────────────────────────────────────
  async function handleBannerFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!onBannerUpload) return
    setBannerUploading(true)
    try {
      await onBannerUpload(file)
      setHasBanner(true)
      setBannerKey(k => k + 1)
    } catch (err) {
      alert(err.response?.data?.error || 'Error al subir la imagen')
    } finally {
      setBannerUploading(false)
      e.target.value = ''
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
  const contextRRSS       = analysis?.contextRRSS       || ''
  const contextPublicidad = analysis?.contextPublicidad || ''
  const contextSitio      = analysis?.contextSitio      || ''
  const contextSEO        = analysis?.contextSEO        || ''

  // Flags de disponibilidad por grupo
  const hasRRSS   = !!(s.instagram || s.tiktok || s.youtube || s.linkedin || s.facebook)
  const hasAds    = !!(s.metaAds || s.googleAds)
  const hasSeoGeo = !!(s.keywords || s.seo || s.geo || aiTrafficEntries)
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

  // ── "Agregar info" por grupo (bloque editorial, WYSIWYG) ──────────────────────
  // Va debajo del título del grupo y arriba de las tarjetas. Reemplaza al viejo
  // "Contexto del período". Reutiliza los campos analysis.context* ya guardados.
  function ContextNote({ sectionKey, analysisKey, contextValue }) {
    if (!contextValue && !canEdit) return null
    const isEditing = editingContext === sectionKey
    const isHtml = typeof contextValue === 'string' && contextValue.trim().startsWith('<')

    if (isEditing) {
      return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 no-print space-y-3">
          <RichTextEditor defaultContent={contextValue} onChange={setContextDraft} minHeight={120} />
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
      )
    }

    // Con contenido: bloque de info + acciones de admin
    if (contextValue) {
      return (
        <div className="bg-primary-50/60 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 rounded-2xl px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            {isHtml ? (
              <div className="situation-content text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(contextValue) }} />
            ) : (
              <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line flex-1 min-w-0">{contextValue}</p>
            )}
            {canEdit && (
              <div className="no-print flex items-center gap-2 shrink-0">
                <button onClick={() => { setContextDraft(contextValue); setEditingContext(sectionKey) }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">✏️ Editar</button>
                <button onClick={() => handleSaveContext(analysisKey, '')} className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">🗑</button>
              </div>
            )}
          </div>
        </div>
      )
    }

    // Vacío + admin: botón para agregar
    return (
      <button
        onClick={() => { setContextDraft(''); setEditingContext(sectionKey) }}
        className="no-print w-full text-left text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 transition-colors"
      >
        ➕ Agregar información a esta sección
      </button>
    )
  }

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
      {isPublic ? (
        /* Hero premium para el cliente: portada con overlay o gradiente de marca */
        <div className="relative rounded-2xl overflow-hidden print-break-avoid shadow-sm">
          {hasBanner && report?.token ? (
            <>
              <img
                key={bannerKey}
                src={`${import.meta.env.VITE_API_URL}/api/public/report-banner/${report?.token}?t=${bannerKey}`}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setHasBanner(false)}
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,.80), rgba(0,0,0,.28) 48%, rgba(0,0,0,.08))' }} />
            </>
          ) : (
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${brandPrimary}, ${brandSecondary})` }} />
          )}

          <div className="relative flex flex-col justify-end p-6 sm:p-8" style={{ minHeight: hasBanner ? '17rem' : '12rem' }}>
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
        /* Header de edición (vista agencia) */
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden print-break-avoid">
          {hasBanner && report?.token ? (
            <div className="relative w-full overflow-hidden group" style={{ height: '15rem' }}>
              <img
                key={bannerKey}
                src={`${import.meta.env.VITE_API_URL}/api/public/report-banner/${report?.token}?t=${bannerKey}`}
                alt="Banner"
                className="w-full h-full object-cover"
                onError={() => setHasBanner(false)}
              />
              <button
                onClick={() => bannerInputRef.current?.click()}
                disabled={bannerUploading}
                className="no-print absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/0 group-hover:bg-black/40 transition-all duration-200 opacity-0 group-hover:opacity-100"
              >
                <span className="text-white text-2xl">{bannerUploading ? '⏳' : '🖼️'}</span>
                <span className="text-white text-xs font-semibold drop-shadow">
                  {bannerUploading ? 'Subiendo...' : 'Cambiar imagen'}
                </span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => bannerInputRef.current?.click()}
              disabled={bannerUploading}
              className="no-print w-full flex flex-col items-center justify-center gap-2 border-b-2 border-dashed border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              style={{ height: '15rem' }}
            >
              <span className="text-3xl text-gray-300 dark:text-gray-500">{bannerUploading ? '⏳' : '🖼️'}</span>
              <span className="text-sm font-medium text-gray-400 dark:text-gray-500">
                {bannerUploading ? 'Subiendo...' : 'Agregar imagen de fondo al informe'}
              </span>
              <span className="text-xs text-gray-300 dark:text-gray-600">PNG, JPG o WebP · máx. 5 MB</span>
            </button>
          )}
          <input
            ref={bannerInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={handleBannerFile}
          />

          <div className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{project.name}</h1>
                <p className="text-gray-500 dark:text-gray-400 capitalize mt-0.5">Informe — {periodTitle}</p>
                {periodRange && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{periodRange}</p>}
                {project.websiteUrl && (
                  <a href={project.websiteUrl} target="_blank" rel="noreferrer" className="text-xs hover:underline mt-1 block" style={{ color: brandPrimary }}>
                    {project.websiteUrl}
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
      {hasRRSS && (
        <>
          <GroupHeader title="Redes Sociales" groupKeys={['instagram', 'tiktok', 'youtube', 'linkedin', 'facebook', 'competitors']} />
          <ContextNote sectionKey="rrss" analysisKey="contextRRSS" contextValue={contextRRSS} />
          <div className={`grid gap-5 ${[s.instagram, s.tiktok, s.youtube, s.linkedin, s.facebook].filter(Boolean).length >= 2 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
            {s.instagram && (
              <SectionCard title="Instagram" icon={<SocialIcon network="instagram" className="w-5 h-5" />} sectionKey="instagram">
                <KpiGrid items={[
                  { label: 'Seguidores',   value: fmt(s.instagram.followersCount), delta: s.instagram.deltaFollowers },
                  { label: 'Engagement',  value: s.instagram.engagementRate != null ? `${s.instagram.engagementRate.toFixed(2)}%` : '—', delta: s.instagram.deltaEngagement },
                  { label: 'Avg. likes',  value: fmt(s.instagram.avgLikes, 0) },
                  { label: 'Posts / mes', value: fmt(s.instagram.postsCount) },
                  ...(s.instagram.reach != null ? [{ label: 'Alcance', value: fmt(s.instagram.reach), delta: s.instagram.deltaReach }] : []),
                  ...(s.instagram.totalSaved != null ? [{ label: 'Guardados', value: fmt(s.instagram.totalSaved) }] : []),
                  ...(s.instagram.totalShares != null ? [{ label: 'Compartidos', value: fmt(s.instagram.totalShares) }] : []),
                ]} />
                {s.instagram.bestPost && <BestInstagramPost post={s.instagram.bestPost} />}
                {s.instagram.bestByReach && s.instagram.bestByReach.id !== s.instagram.bestPost?.id && (
                  <BestInstagramPost post={s.instagram.bestByReach} label="Mayor alcance del mes" medal="📡" />
                )}
                <StoriesBlock stories={s.instagram.stories} />
                {s.instagram._fallbackMonth && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center">
                    {s.instagram._fallbackMonth === 'live'
                      ? '⚡ Datos en tiempo real (aún no hay snapshot del mes anterior)'
                      : `📅 Datos más recientes disponibles: ${monthLabel(s.instagram._fallbackMonth)}`
                    }
                  </p>
                )}
              </SectionCard>
            )}

            {s.tiktok && (
              <SectionCard title="TikTok" icon={<SocialIcon network="tiktok" className="w-5 h-5" />} sectionKey="tiktok">
                <KpiGrid items={[
                  { label: 'Seguidores',   value: fmt(s.tiktok.followersCount), delta: s.tiktok.deltaFollowers },
                  { label: 'Engagement',  value: s.tiktok.engagementRate != null ? `${s.tiktok.engagementRate.toFixed(2)}%` : '—', delta: s.tiktok.deltaEngagement },
                  { label: 'Avg. views',  value: fmt(s.tiktok.avgViews, 0) },
                  { label: 'Posts / mes', value: fmt(s.tiktok.postsThisMonth) },
                ]} />
                {s.tiktok.bestVideo && <BestTikTokVideo video={s.tiktok.bestVideo} />}
                {s.tiktok._fallbackMonth && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center">
                    {s.tiktok._fallbackMonth === 'live'
                      ? '⚡ Datos en tiempo real (aún no hay snapshot del mes anterior)'
                      : `📅 Datos más recientes disponibles: ${monthLabel(s.tiktok._fallbackMonth)}`
                    }
                  </p>
                )}
              </SectionCard>
            )}

            {s.youtube && (
              <SectionCard title="YouTube" icon={<SocialIcon network="youtube" className="w-5 h-5" />} sectionKey="youtube">
                <KpiGrid items={[
                  { label: 'Suscriptores',  value: fmt(s.youtube.subscriberCount), delta: s.youtube.deltaSubscribers },
                  { label: 'Vistas del mes', value: fmt(s.youtube.monthViews, 0) },
                  { label: 'Videos / mes',  value: fmt(s.youtube.videosThisMonth) },
                  { label: 'Engagement',   value: s.youtube.engagementRate != null ? `${s.youtube.engagementRate.toFixed(2)}%` : '—' },
                  ...(s.youtube.shortsThisMonth != null || s.youtube.longsThisMonth != null
                    ? [{ label: 'Largos / Shorts', value: `${s.youtube.longsThisMonth ?? 0} / ${s.youtube.shortsThisMonth ?? 0}` }] : []),
                  ...(s.youtube.avgViews != null ? [{ label: 'Avg. views', value: fmt(s.youtube.avgViews, 0) }] : []),
                ]} />
                {s.youtube.bestVideo && <BestYouTubeVideo video={s.youtube.bestVideo} />}
                {s.youtube._fallbackMonth && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center">
                    {s.youtube._fallbackMonth === 'live'
                      ? '⚡ Datos en tiempo real (aún no hay snapshot del mes anterior)'
                      : `📅 Datos más recientes disponibles: ${monthLabel(s.youtube._fallbackMonth)}`
                    }
                  </p>
                )}
              </SectionCard>
            )}

            {s.linkedin && (
              <SectionCard title="LinkedIn" icon={<SocialIcon network="linkedin" className="w-5 h-5" />} sectionKey="linkedin">
                <KpiGrid items={[
                  { label: 'Seguidores',   value: fmt(s.linkedin.followersCount), delta: s.linkedin.deltaFollowers },
                  { label: 'Engagement',  value: s.linkedin.engagementRate != null ? `${s.linkedin.engagementRate.toFixed(2)}%` : '—', delta: s.linkedin.deltaEngagement },
                  { label: 'Posts / mes', value: fmt(s.linkedin.postsThisMonth) },
                  ...(s.linkedin.impressions != null ? [{ label: 'Impresiones', value: fmt(s.linkedin.impressions), delta: s.linkedin.deltaImpressions }] : []),
                  ...(s.linkedin.clicks      != null ? [{ label: 'Clics',       value: fmt(s.linkedin.clicks) }] : []),
                  ...(s.linkedin.ctr         != null ? [{ label: 'CTR',         value: `${s.linkedin.ctr.toFixed(2)}%` }] : []),
                ]} />
                {s.linkedin.topPosts?.[0] && <BestLinkedinPost post={s.linkedin.topPosts[0]} />}
                <LinkedinAudience demographics={s.linkedin.demographics} />
                {s.linkedin._fallbackMonth && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center">
                    {s.linkedin._fallbackMonth === 'live'
                      ? '⚡ Datos en tiempo real (aún no hay snapshot del mes anterior)'
                      : `📅 Datos más recientes disponibles: ${monthLabel(s.linkedin._fallbackMonth)}`
                    }
                  </p>
                )}
              </SectionCard>
            )}

            {s.facebook && (
              <SectionCard title="Facebook" icon={<SocialIcon network="facebook" className="w-5 h-5" />} sectionKey="facebook">
                <KpiGrid items={[
                  { label: 'Seguidores',   value: fmt(s.facebook.followersCount), delta: s.facebook.deltaFollowers },
                  { label: 'Engagement',  value: s.facebook.engagementRate != null ? `${s.facebook.engagementRate.toFixed(2)}%` : '—', delta: s.facebook.deltaEngagement },
                  { label: 'Posts / mes', value: fmt(s.facebook.postsThisMonth) },
                  ...(s.facebook.reach       != null ? [{ label: 'Alcance',     value: fmt(s.facebook.reach), delta: s.facebook.deltaReach }] : []),
                  ...(s.facebook.impressions != null ? [{ label: 'Impresiones', value: fmt(s.facebook.impressions) }] : []),
                ]} />
                {s.facebook.topPosts?.[0] && <BestFacebookPost post={s.facebook.topPosts[0]} />}
                {s.facebook._fallbackMonth && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center">
                    {s.facebook._fallbackMonth === 'live'
                      ? '⚡ Datos en tiempo real (aún no hay snapshot del mes anterior)'
                      : `📅 Datos más recientes disponibles: ${monthLabel(s.facebook._fallbackMonth)}`
                    }
                  </p>
                )}
              </SectionCard>
            )}
          </div>
          {s.competitors && <CompetitorComparison data={s.competitors} />}
        </>
      )}

      {/* ── 3. Publicidad ── */}
      {hasAds && (
        <>
          <GroupHeader title="Publicidad" groupKeys={['metaAds', 'googleAds']} />
          <ContextNote sectionKey="publicidad" analysisKey="contextPublicidad" contextValue={contextPublicidad} />
          <div className={`grid gap-5 ${s.metaAds && s.googleAds ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
            {s.metaAds && (
              <SectionCard title="Meta Ads" icon="📣" sectionKey="metaAds">
                <KpiGrid items={[
                  { label: 'Inversión',    value: s.metaAds.spend != null ? `$${fmt(s.metaAds.spend)}` : '—' },
                  ...(s.metaAds.reach != null && s.metaAds.reach > 0 ? [{ label: 'Alcance', value: fmt(s.metaAds.reach) }] : []),
                  { label: 'Impresiones', value: fmt(s.metaAds.impressions) },
                  { label: 'Clics',       value: fmt(s.metaAds.clicks) },
                  { label: 'CTR',         value: s.metaAds.ctr != null ? `${Number(s.metaAds.ctr).toFixed(2)}%` : '—' },
                ]} />
                <BestAd ad={s.metaAds.topAds?.[0]} accent="blue" />
              </SectionCard>
            )}
            {s.googleAds && (
              <SectionCard title="Google Ads" icon="🅖" sectionKey="googleAds">
                <KpiGrid items={[
                  { label: 'Inversión',    value: s.googleAds.cost != null ? `$${fmt(s.googleAds.cost)}` : '—' },
                  { label: 'Impresiones', value: fmt(s.googleAds.impressions) },
                  { label: 'Clics',       value: fmt(s.googleAds.clicks) },
                  { label: 'CTR',         value: s.googleAds.ctr != null ? `${Number(s.googleAds.ctr).toFixed(2)}%` : '—' },
                  ...(s.googleAds.conversions != null && s.googleAds.conversions > 0 ? [{ label: 'Conversiones', value: fmt(s.googleAds.conversions) }] : []),
                ]} />
                <BestAd ad={s.googleAds.topAds?.[0]} accent="green" />
              </SectionCard>
            )}
          </div>
        </>
      )}

      {/* ── 4. SEO y GEO ── */}
      {hasSeoGeo && (
        <>
          <GroupHeader title="SEO y GEO" groupKeys={['keywords', 'seo', 'geo']} />
          <ContextNote sectionKey="seo" analysisKey="contextSEO" contextValue={contextSEO} />

          {/* Keywords */}
          {s.keywords && (
            <SectionCard title="Posicionamiento SEO — Keywords objetivo" icon="🔑" sectionKey="keywords">
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2 mb-4">
                Cómo posicionan las keywords que elegimos seguir, y su variación mes a mes.
              </p>
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
            <SectionCard title="Rendimiento del sitio — Search Console" icon="🔍" sectionKey="seo">
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2 mb-4">
                Tráfico orgánico total del sitio y las consultas y páginas que más visitas traen.
              </p>
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
            <SectionCard title="Presencia en IAs (GEO)" icon="🌐" sectionKey="geo">
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

        </>
      )}

      {/* ── 5. Sitio web ── */}
      {hasSitio && (
        <>
          <GroupHeader title="Sitio web" groupKeys={['analytics', 'performance']} />
          <ContextNote sectionKey="sitio" analysisKey="contextSitio" contextValue={contextSitio} />

          {/* Analytics GA4 */}
          {s.analytics && (
            <SectionCard title="Analytics web" icon="📊" sectionKey="analytics">
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
                  <BarChart items={channels} color={brandPrimary} />
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
                    <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: brandPrimary }} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Sesiones</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: brandSecondary }} />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Usuarios nuevos</span>
                  </div>
                </div>
              )}
              <LineChart
                points={evolutionPoints}
                color={brandPrimary}
                height={80}
                secondPoints={evolutionNewUsers}
                secondColor={brandSecondary}
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
            <SectionCard title="Performance web" icon="⚡" sectionKey="performance">
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
