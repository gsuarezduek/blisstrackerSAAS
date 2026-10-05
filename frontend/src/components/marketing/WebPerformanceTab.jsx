import { useState, useEffect } from 'react'
import api from '../../api/client'
import ObjectiveProgressBars from './ObjectiveProgressBars'
import useObjectiveProgress from './useObjectiveProgress'
import PageSpeedSection from './web/PageSpeedSection'
import { CrossProjectPerformancePanel } from './web/CrossProjectPanels'

// Subtab "Performance" de la pestaña Web — PageSpeed Insights (score, Core Web
// Vitals, oportunidades/diagnósticos) + objetivos de performance del proyecto.
// Separado de WebAnalyticsTab (Google Analytics) porque no comparten estado:
// cada subtab de WebTab.jsx tenía su propio bloque de hooks sin cruces reales
// entre sí, solo el early-return de "sin proyecto" y la barra de controles
// (vacía en Performance — ver abajo) vivían en el componente padre.
export default function WebPerformanceTab({ projectId, projects, onSelectProject }) {
  const allObjectives = useObjectiveProgress(projectId)
  const objectives = allObjectives.filter(o => o.metric === 'performance')

  const [psStrategy, setPsStrategy] = useState('mobile')
  const [psResult,   setPsResult]   = useState(null) // último resultado done
  const [psHistory,  setPsHistory]  = useState([])   // historial de scores
  const [psRunning,  setPsRunning]  = useState(false)
  const [psPollId,   setPsPollId]   = useState(null)

  // Cargar último resultado PageSpeed + historial cuando cambia proyecto o estrategia
  useEffect(() => {
    if (!projectId) return
    const controller = new AbortController()
    setPsResult(null)
    setPsHistory([])
    api.get(`/marketing/projects/${projectId}/pagespeed?strategy=${psStrategy}&limit=6`, { signal: controller.signal })
      .then(r => {
        setPsHistory(r.data)
        if (r.data.length > 0) {
          api.get(`/marketing/projects/${projectId}/pagespeed/${r.data[0].id}`, { signal: controller.signal })
            .then(r2 => setPsResult(r2.data))
            .catch(e => { if (e.name !== 'CanceledError' && e.code !== 'ERR_CANCELED') console.error('[PageSpeed] Error al cargar último resultado:', e.message) })
        }
      })
      .catch(e => { if (e.name !== 'CanceledError' && e.code !== 'ERR_CANCELED') console.error('[PageSpeed] Error al cargar historial:', e.message) })
    return () => controller.abort()
  }, [projectId, psStrategy])

  // Limpiar polling al desmontar
  useEffect(() => () => { if (psPollId) clearInterval(psPollId) }, [psPollId])

  async function handleRunPageSpeed() {
    if (!projectId || psRunning) return
    setPsRunning(true)
    setPsResult(null)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/pagespeed`, { strategy: psStrategy })
      const resultId = data.resultId
      // Polling cada 3s hasta que el análisis termine
      const intervalId = setInterval(async () => {
        try {
          const { data: res } = await api.get(`/marketing/projects/${projectId}/pagespeed/${resultId}`)
          if (res.status === 'done') {
            clearInterval(intervalId)
            setPsPollId(null)
            setPsResult(res)
            setPsRunning(false)
            setPsHistory(prev => [{ id: res.id, performanceScore: res.performanceScore, strategy: res.strategy, createdAt: res.createdAt }, ...prev].slice(0, 6))
          } else if (res.status === 'error') {
            clearInterval(intervalId)
            setPsPollId(null)
            setPsRunning(false)
            alert(res.errorMsg || 'Error en el análisis de PageSpeed')
          }
        } catch { /* continuar polling */ }
      }, 3000)
      setPsPollId(intervalId)
    } catch (e) {
      setPsRunning(false)
      alert(e.response?.data?.error || 'Error al iniciar el análisis')
    }
  }

  // Vista global cuando no hay proyecto seleccionado
  if (!projectId) return <CrossProjectPerformancePanel onSelectProject={onSelectProject} />

  const selectedProject = projects.find(p => String(p.id) === projectId)

  return (
    <div className="space-y-5">
      {/* Controles — vacío en Performance (el toggle mobile/desktop vive dentro
          de PageSpeedSection); se mantiene por fidelidad visual con Analytics. */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap gap-4 items-end" />

      <ObjectiveProgressBars objectives={objectives} title="Objetivos de performance" />
      <PageSpeedSection
        websiteUrl={selectedProject?.websiteUrl}
        strategy={psStrategy}
        onStrategyChange={s => setPsStrategy(s)}
        result={psResult}
        history={psHistory}
        running={psRunning}
        onRun={handleRunPageSpeed}
        projectId={projectId}
        projectName={selectedProject?.name ?? ''}
      />
    </div>
  )
}
