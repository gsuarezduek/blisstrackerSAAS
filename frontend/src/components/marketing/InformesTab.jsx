import { useState, useEffect } from 'react'
import api from '../../api/client'
import ReportViewer from './ReportViewer'
import ObjectivesManager from './ObjectivesManager'
import useObjectiveProgress from './useObjectiveProgress'
import ObjectiveProgressBars from './ObjectiveProgressBars'
import { currentMonthStr, prevMonthStr, nextMonthStr, monthLabel } from './InformesTabParts'
import { GenerateModal, SectionsConfigModal, PublishNotifyModal } from './InformesTabModals'
import { AllReportsPanel, ClientFeedbackPanel, GenerationLogPanel } from './InformesTabPanels'

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
  const [portalConfig, setPortalConfig] = useState(null) // { active, publicUrl, ... } | null
  const [showNotifyModal, setShowNotifyModal] = useState(false)
  const [objRefreshKey, setObjRefreshKey] = useState(0)
  const liveObjectives = useObjectiveProgress(projectId, objRefreshKey)

  const isGenerated = !!reportMeta?.isGenerated

  // Portal del Cliente del proyecto (si tiene uno configurado) — determina si "Link del
  // cliente" manda al portal (con login) o al link directo de siempre. Independiente del
  // mes que se esté viendo, solo depende del proyecto.
  useEffect(() => {
    if (!projectId) { setPortalConfig(null); return }
    api.get(`/projects/${projectId}/client-portal`)
      .then(res => setPortalConfig(res.data.portal))
      .catch(() => setPortalConfig(null))
  }, [projectId])

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
      if (next === 'published') setShowNotifyModal(true)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar el estado del informe')
    }
  }


  async function handleSaveAnalysis(updatedAnalysis) {
    await api.patch(`/marketing/projects/${projectId}/reports/${month}`, { analysis: updatedAnalysis })
    setReportData(prev => prev ? { ...prev, analysis: updatedAnalysis } : prev)
  }

  function handleCopyLink() {
    if (!reportMeta?.token) return
    // Si el proyecto tiene Portal del Cliente activo, mandamos ahí (con login por email
    // autorizado) directo a este informe en particular; si no, el link directo de siempre.
    const url = portalConfig?.active
      ? `${portalConfig.publicUrl}?report=${reportMeta.token}`
      : `${window.location.origin}/report/${reportMeta.token}`
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

      {/* ── Objetivos en vivo del mes en curso — mismos datos que la vista "En vivo"
          del hub sin proyecto seleccionado, acá recortados a este proyecto. No depende
          de que el informe del mes ya esté generado. ── */}
      {liveObjectives.length > 0 && (
        <ObjectiveProgressBars objectives={liveObjectives} title="🎯 Objetivos del mes en curso" />
      )}

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
            Secciones
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
              title={
                reportMeta?.status !== 'published'
                  ? 'Publicá el informe para habilitar el link del cliente'
                  : portalConfig?.active
                    ? 'Copia el link del Portal del Cliente, con acceso directo a este informe (pide login con el email autorizado)'
                    : 'Copia el link directo al informe, sin login'
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-40"
            >
              {copied ? '✓ Copiado' : '📋 Link del cliente'}
            </button>
          )}
        </div>
      </div>

      {/* ── Feedback del cliente + historial de intentos ── */}
      {isGenerated && <ClientFeedbackPanel feedback={reportMeta?.feedback} />}
      {isGenerated && <GenerationLogPanel projectId={projectId} month={month} />}

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

      {!loading && !error && reportData?.dataWarnings?.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
          <span className="text-lg leading-none mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Algunas secciones no se pudieron traer en vivo
            </p>
            <ul className="text-sm text-amber-700 dark:text-amber-400 mt-0.5 space-y-0.5">
              {reportData.dataWarnings.map((w, i) => (
                <li key={i}>• {w.label}: {w.message}</li>
              ))}
            </ul>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1.5">
              Esas secciones no se guardaron como definitivas — volvé a entrar en unos minutos (probablemente se resuelva solo) o regenerá para reintentar ahora.
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
          onClose={() => { setShowObjModal(false); setObjRefreshKey(k => k + 1) }}
        />
      )}

      {/* ── Popup tras publicar: ofrece avisar al cliente por email ── */}
      {showNotifyModal && (
        <PublishNotifyModal
          projectId={projectId}
          month={month}
          contacts={portalConfig?.contacts}
          onClose={() => setShowNotifyModal(false)}
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
