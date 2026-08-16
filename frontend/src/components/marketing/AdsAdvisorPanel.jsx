import { useState } from 'react'
import api from '../../api/client'
import CreateTaskModal from './CreateTaskModal'

// Compartido entre MetaAdsTab y GoogleAdsTab — solo cambia el path del endpoint y el
// prefijo de las tareas creadas ("Meta Ads - " / "Google Ads - ").
const PLATFORM_META = {
  meta_ads:   { label: 'Meta Ads',   prefix: 'Meta Ads',   path: 'meta-ads' },
  google_ads: { label: 'Google Ads', prefix: 'Google Ads', path: 'google-ads' },
}

const PRIORITY_STYLES = {
  alta:  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  media: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  baja:  'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
}

const TYPE_ICON = {
  pausar: '⏸️', escalar: '📈', ajustar: '🔧', alerta: '⚠️', oportunidad: '💡',
}

const AMBITO_LABEL = { campania: 'Campaña', anuncio: 'Anuncio', cuenta: 'Cuenta' }

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
      {item.referencia && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {AMBITO_LABEL[item.ambito] ?? 'Cuenta'}: <span className="font-medium text-gray-600 dark:text-gray-300">{item.referencia}</span>
        </p>
      )}
      <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">{item.detalle}</p>
      <button onClick={() => onCreateTask(item.titulo)} className="self-start text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
        + tarea
      </button>
    </div>
  )
}

function CopyCard({ item, onCreateTask }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-2">
      <p className="text-xs font-semibold text-primary-600 dark:text-primary-400">{item.angulo}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.headline}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400 flex-1">{item.texto}</p>
      {item.motivo && <p className="text-xs text-gray-400 dark:text-gray-500 italic">{item.motivo}</p>}
      <button onClick={() => onCreateTask(item.angulo)} className="self-start text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
        + tarea
      </button>
    </div>
  )
}

/**
 * Panel de IA dentro de las pestañas de Meta Ads / Google Ads: diagnóstico accionable
 * (qué pausar/escalar/ajustar, priorizado) + ideas de anuncios nuevos, usando los datos
 * ya visibles en la pestaña + historial + objetivos + el brief comercial del cliente.
 * On-demand, no persiste — cada click a "Analizar" recalcula (mismo criterio que
 * generateSchemaOrg/generateLlmsTxt de GEO).
 */
export default function AdsAdvisorPanel({ projectId, projectName, platform, datePreset }) {
  const meta = PLATFORM_META[platform]
  const [result,    setResult]    = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [taskModal, setTaskModal] = useState(null) // { defaultDescription } | null

  async function handleAnalyze() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.post(`/marketing/projects/${projectId}/${meta.path}/advisor`, null, { params: { datePreset } })
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
            Diagnóstico de campañas/anuncios e ideas de anuncios nuevos, con el brief y los objetivos del proyecto.
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
        <div className="mt-4 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Diagnóstico</p>
            {result.diagnostico.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin hallazgos para el período analizado.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {result.diagnostico.map((item, i) => (
                  <DiagnosticoCard key={i} item={item} onCreateTask={titulo => setTaskModal({ defaultDescription: `${meta.prefix} - ${titulo}` })} />
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Ideas de anuncios nuevos</p>
            {result.nuevosCopys.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin ideas generadas.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {result.nuevosCopys.map((item, i) => (
                  <CopyCard key={i} item={item} onCreateTask={angulo => setTaskModal({ defaultDescription: `${meta.prefix} - ${angulo}` })} />
                ))}
              </div>
            )}
          </div>
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
