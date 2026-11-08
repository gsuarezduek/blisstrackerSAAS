// ─── Sugerencias IA (modo live) ────────────────────────────────────────────────
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Icon } from '../../ui/Icon'
import { fmtCreatedAt, createdAtTitle } from '../../../utils/format'

const IMPACT_COLOR = { alto: 'text-red-500', medio: 'text-orange-500', bajo: 'text-blue-500' }

// Resumen de una línea para cuando la sección está cerrada: cuántas sugerencias
// hay esperando, sin obligar a abrirla para saberlo.
function collapsedSummary(aiData) {
  if (!aiData) return 'Sin generar'
  const n = [
    aiData.oportunidades?.length ? `${aiData.oportunidades.length} oportunidades` : null,
    aiData.quickWins?.length     ? `${aiData.quickWins.length} quick wins`       : null,
  ].filter(Boolean)
  return n.length ? n.join(' · ') : 'Sin sugerencias'
}

export default function AiInsightsPanel({ aiData, aiLoading, aiError, aiCooldown, aiGeneratedAt, onGenerate, onCreateTask }) {
  // Arranca cerrada: es el bloque más alto de la pantalla y no es lo primero que
  // se viene a mirar. No se recuerda la elección a propósito — cada visita a SEO
  // vuelve a empezar por los datos, y abrirla es un click.
  const [open, setOpen] = useState(false)

  // Generar desde la sección cerrada la abre: si no, el resultado llega y no se ve.
  function handleGenerate() {
    setOpen(true)
    onGenerate()
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <div className={`flex items-center justify-between gap-3 ${open ? 'mb-3' : ''}`}>
        <button
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex items-center gap-2 min-w-0 text-left group"
        >
          <Icon as={open ? ChevronDown : ChevronRight} size={16}
            className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sugerencias IA</h3>
          {aiData && aiGeneratedAt && (
            <span className="text-xs text-gray-400 truncate" title={createdAtTitle(aiGeneratedAt)}>
              · generado {fmtCreatedAt(aiGeneratedAt)}
            </span>
          )}
          {!open && (
            <span className="text-xs text-gray-400 truncate">· {collapsedSummary(aiData)}</span>
          )}
        </button>
        <button onClick={handleGenerate} disabled={aiLoading || aiCooldown > 0}
          className="flex-shrink-0 text-xs text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed">
          {aiLoading ? 'Generando…' : aiCooldown > 0 ? `Disponible en ${aiCooldown} min` : aiData ? 'Regenerar' : 'Generar análisis IA'}
        </button>
      </div>
      {!open ? null : <>
      {aiError && <p className="text-xs text-orange-500 mb-3">{aiError}</p>}
      {!aiData && !aiLoading && (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Generá un análisis IA para obtener sugerencias accionables basadas en tus datos de Search Console.
        </p>
      )}
      {aiLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
          Analizando datos con IA…
        </div>
      )}
      {aiData && !aiLoading && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{aiData.titulo}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{aiData.resumen}</p>
          </div>
          {aiData.oportunidades?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Oportunidades</p>
              <div className="space-y-2">
                {aiData.oportunidades.map((op, i) => (
                  <div key={i} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3">
                    <span className={`text-xs font-bold mt-0.5 ${IMPACT_COLOR[op.impacto] ?? 'text-gray-500'}`}>
                      {op.impacto?.toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">{op.pagina}</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{op.accion}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{op.razon}</p>
                    </div>
                    <button onClick={() => onCreateTask({ title: op.accion })}
                      className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all">
                      + tarea
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {aiData.quickWins?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Quick wins</p>
              <div className="space-y-2">
                {aiData.quickWins.map((qw, i) => (
                  <div key={i} className="flex items-start gap-3 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/40 rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{qw.titulo}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{qw.descripcion}</p>
                    </div>
                    <button onClick={() => onCreateTask({ title: qw.tarea })}
                      className="flex-shrink-0 text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-gray-200 dark:border-gray-600 hover:border-primary-400 rounded-lg px-2 py-0.5 transition-all">
                      + tarea
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      </>}
    </div>
  )
}
