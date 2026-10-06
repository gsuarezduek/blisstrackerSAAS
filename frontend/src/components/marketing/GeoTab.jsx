import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'
import SetupHintCard from '../SetupHintCard'
import { Globe } from 'lucide-react'
import CreateTaskModal from './geo/CreateTaskModal'
import CrossProjectPanel from './geo/CrossProjectPanel'
import GeoAuditResults from './geo/GeoAuditResults'
import AuditHistoryPanel from './geo/AuditHistoryPanel'
import GeoModals from './geo/GeoModals'
import { SEVERITY_ORDER } from './geo/geoHelpers'

// Techo del polling de auditorías async: si el job no terminó en este tiempo, se
// asume colgado y se deja de pollear en vez de reintentar indefinidamente.
const MAX_POLL_MS = 5 * 60 * 1000

export default function GeoTab({ projectId, projects, onSelectProject }) {
  const [audits, setAudits]         = useState([])
  const [activeAudit, setActive]    = useState(null)
  const [running, setRunning]       = useState(false)
  const [error, setError]           = useState('')
  const [loadingAudits, setLoadingAudits] = useState(false)
  const [taskModal, setTaskModal]   = useState(null) // { title }
  const [llmsModal, setLlmsModal]   = useState(null) // { content } | 'loading'
  const [schemaModal, setSchemaModal] = useState(null) // { schemas } | 'loading'
  const [deleteModal, setDeleteModal] = useState(null) // { id } | null
  const [deleting, setDeleting]     = useState(false)
  const pollRef = useRef(null)
  const pollStartRef = useRef(null)

  const selectedProject = projects.find(p => String(p.id) === projectId)

  async function loadAuditDetail(id) {
    try {
      const r = await api.get(`/marketing/geo/audits/${id}`)
      setActive(r.data)
    } catch {}
  }

  // Cargar historial cuando cambia el proyecto
  const loadAudits = useCallback((pid) => {
    if (!pid) return
    setLoadingAudits(true)
    api.get(`/marketing/geo/audits?projectId=${pid}`)
      .then(r => {
        setAudits(r.data)
        const latest = r.data[0]
        if (latest?.status === 'running') {
          setActive(latest)
          setRunning(true)
          startPolling(latest.id, latest.createdAt)
        } else if (latest?.status === 'completed') {
          loadAuditDetail(latest.id)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAudits(false))
  }, []) // eslint-disable-line

  useEffect(() => {
    stopPolling()
    setActive(null)
    setRunning(false)
    setError('')
    if (projectId) loadAudits(projectId)
    return stopPolling
  }, [projectId]) // eslint-disable-line

  function startPolling(auditId, startedAt) {
    stopPolling()
    pollStartRef.current = startedAt ? new Date(startedAt).getTime() : Date.now()
    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > MAX_POLL_MS) {
        stopPolling()
        setRunning(false)
        setError('El análisis está tardando más de lo esperado. Volvé a intentar en unos minutos.')
        return
      }
      try {
        const r = await api.get(`/marketing/geo/audits/${auditId}`)
        if (r.data.status !== 'running') {
          stopPolling()
          setRunning(false)
          setActive(r.data)
          // Recargar historial
          setAudits(prev => [r.data, ...prev.filter(a => a.id !== r.data.id)])
        }
      } catch {
        stopPolling()
        setRunning(false)
      }
    }, 3000)
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function handleRunAudit() {
    if (!selectedProject?.websiteUrl || running) return
    setError('')
    setRunning(true)
    try {
      const r = await api.post('/marketing/geo/audit', {
        projectId: selectedProject.id,
        url: selectedProject.websiteUrl,
      })
      const newAudit = { id: r.data.auditId, status: 'running', projectId: selectedProject.id, url: selectedProject.websiteUrl, createdAt: new Date().toISOString() }
      setActive(newAudit)
      setAudits(prev => [newAudit, ...prev])
      startPolling(r.data.auditId)
    } catch (e) {
      setRunning(false)
      setError(e.response?.data?.error || 'Error al iniciar el análisis')
    }
  }

  async function handleDeleteAudit() {
    if (!deleteModal) return
    setDeleting(true)
    try {
      await api.delete(`/marketing/geo/audits/${deleteModal.id}`)
      setAudits(prev => prev.filter(a => a.id !== deleteModal.id))
      if (activeAudit?.id === deleteModal.id) setActive(null)
      setDeleteModal(null)
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar la auditoría')
    } finally {
      setDeleting(false)
    }
  }

  async function handleGenerateLlmsTxt() {
    if (!activeAudit?.id) return
    setLlmsModal('loading')
    try {
      const { data } = await api.get(`/marketing/geo/audits/${activeAudit.id}/llms-txt`)
      setLlmsModal({ content: data.content })
    } catch (err) {
      alert(err.response?.data?.error || 'Error al generar llms.txt')
      setLlmsModal(null)
    }
  }

  async function handleGenerateSchema() {
    if (!activeAudit?.id) return
    setSchemaModal('loading')
    try {
      const { data } = await api.post(`/marketing/geo/audits/${activeAudit.id}/schema`)
      setSchemaModal({ schemas: data.schemas })
    } catch (err) {
      alert(err.response?.data?.error || 'Error al generar schemas')
      setSchemaModal(null)
    }
  }

  function parseField(val) {
    if (!val) return []
    if (Array.isArray(val)) return val
    try { return JSON.parse(val) } catch { return [] }
  }
  const items = parseField(activeAudit?.findings)
  const negativeSignals = parseField(activeAudit?.recommendations)
  const sortedFindings = [...items].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))

  const noUrl = selectedProject && !selectedProject.websiteUrl
  const hasLlmsFinding  = sortedFindings.some(f =>
    f.title?.toLowerCase().includes('llms') || f.description?.toLowerCase().includes('llms')
  )
  const schemaScoreLow  = activeAudit?.schema != null && activeAudit.schema < 70

  return (
    <div className="space-y-6">

      {/* Sin URL configurada → invitación a completarla */}
      {noUrl && (
        <SetupHintCard
          icon={Globe}
          label="Este proyecto no tiene una URL configurada"
          hint="Agregá la URL del sitio para correr la auditoría GEO y medir la visibilidad en buscadores con IA."
          to={`/my-projects/${selectedProject.id}?infoTab=info`}
          ctaLabel="Agregar URL en Info →"
        />
      )}

      {/* Panel de auditoría */}
      {selectedProject && !noUrl && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                URL analizada
              </p>
              <p className="text-sm text-primary-600 dark:text-primary-400 mt-0.5 break-all">
                {selectedProject.websiteUrl}
              </p>
            </div>
            <button
              onClick={handleRunAudit}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
            >
              {running ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analizando…
                </>
              ) : (
                <>
                  {activeAudit?.status === 'completed' ? 'Re-analizar' : 'Analizar'}
                </>
              )}
            </button>
          </div>

          {running && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                {activeAudit?.errorMsg || 'Iniciando análisis…'}
              </div>
              <div className="flex gap-1">
                {['Conectando', 'Extrayendo', 'Analizando con IA', 'Guardando'].map((step, i) => {
                  const msg = activeAudit?.errorMsg ?? ''
                  const active = i === 0 ? msg.includes('Conectando')
                    : i === 1 ? msg.includes('Extrayendo')
                    : i === 2 ? msg.includes('Analizando')
                    : msg.includes('Guardando')
                  const done = i === 0 ? !msg.includes('Conectando')
                    : i === 1 ? (msg.includes('Analizando') || msg.includes('Guardando'))
                    : i === 2 ? msg.includes('Guardando')
                    : false
                  return (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                      done   ? 'bg-blue-400 dark:bg-blue-500' :
                      active ? 'bg-blue-300 dark:bg-blue-600 animate-pulse' :
                               'bg-blue-100 dark:bg-blue-900/40'
                    }`} />
                  )
                })}
              </div>
              <p className="text-xs text-blue-500 dark:text-blue-500">
                Podés cerrar esta pestaña — el análisis continúa en segundo plano.
              </p>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {activeAudit?.status === 'failed' && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl text-sm text-red-700 dark:text-red-400">
              El análisis falló: {activeAudit.errorMsg || 'Error desconocido'}
            </div>
          )}
        </div>
      )}

      {/* Resultados */}
      {activeAudit?.status === 'completed' && (
        <GeoAuditResults
          activeAudit={activeAudit}
          sortedFindings={sortedFindings}
          negativeSignals={negativeSignals}
          selectedProject={selectedProject}
          projectId={projectId}
          hasLlmsFinding={hasLlmsFinding}
          schemaScoreLow={schemaScoreLow}
          onGenerateLlmsTxt={handleGenerateLlmsTxt}
          onGenerateSchema={handleGenerateSchema}
          onCreateTask={setTaskModal}
        />
      )}

      {/* Historial de audits */}
      {projectId && audits.length > 0 && (
        <AuditHistoryPanel
          audits={audits}
          loadingAudits={loadingAudits}
          onSelectAudit={loadAuditDetail}
          onDeleteAudit={setDeleteModal}
        />
      )}

      {/* Estado vacío */}
      {taskModal && selectedProject && (
        <CreateTaskModal
          title={taskModal.title}
          projectId={selectedProject.id}
          projectName={selectedProject.name}
          onClose={() => setTaskModal(null)}
        />
      )}

      {!projectId && <CrossProjectPanel onSelectProject={onSelectProject} />}

      <GeoModals
        deleteModal={deleteModal}
        deleting={deleting}
        onCancelDelete={() => setDeleteModal(null)}
        onConfirmDelete={handleDeleteAudit}
        llmsModal={llmsModal}
        onCloseLlms={() => setLlmsModal(null)}
        schemaModal={schemaModal}
        onCloseSchema={() => setSchemaModal(null)}
      />
    </div>
  )
}
