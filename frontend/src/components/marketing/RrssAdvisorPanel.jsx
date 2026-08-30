import { useState } from 'react'
import api from '../../api/client'
import CreateTaskModal from './CreateTaskModal'

// Compartido entre las 5 tabs de RRSS — solo cambia el label/prefijo.
const PLATFORM_META = {
  instagram: { label: 'Instagram', prefix: 'Instagram' },
  tiktok:    { label: 'TikTok',    prefix: 'TikTok' },
  linkedin:  { label: 'LinkedIn',  prefix: 'LinkedIn' },
  facebook:  { label: 'Facebook',  prefix: 'Facebook' },
  youtube:   { label: 'YouTube',   prefix: 'YouTube' },
}

const PRIORITY_STYLES = {
  alta:  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  media: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  baja:  'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
}

const TYPE_ICON = { alerta: '⚠️', oportunidad: '💡', ajustar: '🔧', felicitar: '🎉' }

function DiagnosticoCard({ item, onCreateTask }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-base leading-none">{TYPE_ICON[item.tipo] ?? '•'}</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white flex-1 min-w-0">{item.titulo}</span>
        {item.prioridad && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${PRIORITY_STYLES[item.prioridad] ?? PRIORITY_STYLES.baja}`}>
            {item.prioridad}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">{item.detalle}</p>
      <button onClick={() => onCreateTask(item.titulo)} className="self-start text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
        + tarea
      </button>
    </div>
  )
}

/**
 * Panel de IA dentro de las pestañas de RRSS: diagnóstico accionable de la red
 * (tendencia vs el mes anterior disponible, comparación con competidores, objetivos y
 * el brief de contenido orgánico del cliente). Usa los snapshots ya guardados de cada
 * red (no pega en vivo a la API) — ver rrssAdvisor.service.js. On-demand, no persiste
 * más que el cache del backend — cada click a "Analizar" recalcula.
 */
export default function RrssAdvisorPanel({ projectId, projectName, platform }) {
  const meta = PLATFORM_META[platform]
  const [result,    setResult]    = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [taskModal, setTaskModal] = useState(null) // { defaultDescription } | null

  async function handleAnalyze() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.post(`/marketing/projects/${projectId}/rrss/${platform}/advisor`)
      setResult(res.data)
    } catch (err) {
      const code = err.response?.data?.code
      setError(
        code === 'TOKEN_BUDGET_EXCEEDED'
          ? 'Se alcanzó el límite mensual de tokens de IA del workspace. Probá de nuevo el próximo mes, o pedile a un admin que ajuste el límite desde Super Admin.'
          : (err.response?.data?.error || 'No se pudo generar el análisis.')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">🤖 Análisis con IA</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Diagnóstico de {meta.label} vs. el mes anterior, competencia, objetivos y el brief de contenido orgánico.
          </p>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? 'Analizando…' : result ? '🔄 Actualizar análisis' : 'Analizar'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4">
          {result.diagnostico.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Sin hallazgos para esta red por ahora.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {result.diagnostico.map((item, i) => (
                <DiagnosticoCard key={i} item={item} onCreateTask={titulo => setTaskModal({ defaultDescription: `${meta.prefix} - ${titulo}` })} />
              ))}
            </div>
          )}
        </div>
      )}

      {taskModal && (
        <CreateTaskModal
          defaultDescription={taskModal.defaultDescription}
          projectId={projectId}
          projectName={projectName}
          onClose={() => setTaskModal(null)}
        />
      )}
    </div>
  )
}
