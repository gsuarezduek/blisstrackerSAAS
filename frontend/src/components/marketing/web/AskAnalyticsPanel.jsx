// "Preguntale a tus datos" — una pregunta en castellano sobre el GA4 del proyecto.
//
// La respuesta de la IA viene SIEMPRE con las consultas que la respaldan
// (`steps`: la receta y las filas que devolvió Google) y la tabla se puede abrir
// debajo de cada respuesta. Es deliberado: una frase generada con números
// adentro no se puede chequear, y acá el número de abajo es el que manda.
import { useState } from 'react'
import api from '../../../api/client'
import { Icon } from '../../ui/Icon'
import { MessageCircleQuestion, Sparkles, Table, TriangleAlert } from 'lucide-react'
import FunLoader from '../networks/FunLoader'
import { WEB_AI_LOADING_MESSAGES } from '../networks/loadingMessages'
import { fmt } from './webTabHelpers'
import {
  dimensionLabel, metricLabel, formatMetricValue, formatDimensionValue, queryPeriodLabel,
} from './ga4QueryCatalog'

const SUGGESTIONS = [
  '¿Cuántas visitas tuve desde Chile en el último año?',
  '¿De qué países vinieron más visitas este mes?',
  '¿Qué páginas tuvieron más visitas en los últimos 90 días?',
  '¿Qué canal trajo más eventos clave este mes?',
  '¿Cuántas visitas por mes tuve en el último año?',
  '¿Desde qué dispositivo me visitan más?',
]

const MAX_LEN = 500

/** La receta de la consulta en una línea, para ver de dónde salió el número. */
function QueryRecipe({ query }) {
  const mets = query.metrics.map(metricLabel).join(' + ')
  const dims = query.dimensions?.length ? ` por ${query.dimensions.map(dimensionLabel).join(' y ')}` : ''
  const filters = (query.filters ?? []).map(f =>
    `${dimensionLabel(f.dimension)} ${f.operator === 'exact' ? '=' : 'contiene'} ${f.values.join(' / ')}`
  ).join(' · ')
  return (
    <p className="text-[11px] text-gray-400 dark:text-gray-500">
      {mets}{dims} · {queryPeriodLabel(query.startDate, query.endDate)}
      {filters && <> · <span className="text-gray-500 dark:text-gray-400">{filters}</span></>}
    </p>
  )
}

function StepTable({ step }) {
  const dims = step.headers?.dimensions ?? []
  const mets = step.headers?.metrics ?? []
  if (!step.rows?.length) {
    return <p className="text-xs text-gray-400 italic py-2">Google Analytics no devolvió filas para esta consulta.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
            {dims.map(d => <th key={d} className="pb-1.5 pr-3 font-medium">{dimensionLabel(d)}</th>)}
            {mets.map(m => <th key={m} className="pb-1.5 font-medium text-right">{metricLabel(m)}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
          {step.rows.map((row, i) => (
            <tr key={i}>
              {row.dimensions.map((v, j) => (
                <td key={j} className="py-1.5 pr-3 text-gray-700 dark:text-gray-300 max-w-[260px] truncate" title={v}>
                  {formatDimensionValue(dims[j], v)}
                </td>
              ))}
              {row.metrics.map((v, j) => (
                <td key={j} className="py-1.5 text-right font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                  {formatMetricValue(mets[j], v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {step.totals && (
          <tfoot>
            <tr className="border-t border-gray-200 dark:border-gray-700">
              {dims.length > 0 && <td className="pt-1.5 text-gray-400" colSpan={dims.length}>Total del período</td>}
              {step.totals.map((v, j) => (
                <td key={j} className="pt-1.5 text-right font-bold text-gray-900 dark:text-white tabular-nums">
                  {formatMetricValue(mets[j], v)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {step.rowCount > step.rows.length && (
        <p className="text-[11px] text-gray-400 mt-1.5">
          Mostrando {fmt(step.rows.length)} de {fmt(step.rowCount)} filas.
        </p>
      )}
    </div>
  )
}

function AnswerCard({ item }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3.5">
      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
        <Icon as={MessageCircleQuestion} size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
        {item.question}
      </p>
      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed mt-2 whitespace-pre-line">
        {item.answer}
      </p>
      {item.truncated && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
          La pregunta necesitaba más consultas de las permitidas: la respuesta usa sólo las primeras.
        </p>
      )}
      {item.steps?.length > 0 && (
        <div className="mt-2.5">
          <button
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <Icon as={Table} size={13} />
            {open ? 'Ocultar los datos' : `Ver los datos (${item.steps.length} ${item.steps.length === 1 ? 'consulta' : 'consultas'})`}
          </button>
          {open && (
            <div className="mt-2 space-y-3">
              {item.steps.map((step, i) => (
                <div key={i} className="bg-gray-50 dark:bg-gray-900/40 rounded-lg p-3">
                  <QueryRecipe query={step.query} />
                  <div className="mt-2"><StepTable step={step} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AskAnalyticsPanel({ projectId }) {
  const [question, setQuestion] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [history,  setHistory]  = useState([])   // más reciente primero, sólo en esta visita

  async function ask(text) {
    const q = (text ?? question).trim()
    if (!q || loading) return
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/analytics/ask`, { question: q })
      setHistory(h => [{ ...data, at: Date.now() }, ...h].slice(0, 8))
      setQuestion('')
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo responder la pregunta. Probá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <Icon as={Sparkles} size={15} className="text-primary-500" />
          Preguntale a tus datos
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Preguntá en castellano sobre el Analytics de este proyecto. Cada respuesta viene con la tabla que la respalda.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          maxLength={MAX_LEN}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
          placeholder="¿Cuántas visitas tuve desde Chile en el último año?"
          className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          onClick={() => ask()}
          disabled={loading || question.trim().length < 5}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
        >
          {loading ? 'Buscando…' : 'Preguntar'}
        </button>
      </div>

      {!history.length && !loading && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {loading && <FunLoader messages={WEB_AI_LOADING_MESSAGES} spinnerSize="sm" className="py-2" />}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
          <Icon as={TriangleAlert} size={14} className="mt-0.5 flex-shrink-0" />
          {error}
        </p>
      )}

      {history.length > 0 && (
        <div className="space-y-2.5">
          {history.map(item => <AnswerCard key={item.at} item={item} />)}
        </div>
      )}

      {history.length > 0 && (
        <p className="text-[11px] text-gray-400">
          Las preguntas no se guardan: se pierden al salir de la pantalla.
        </p>
      )}
    </div>
  )
}
