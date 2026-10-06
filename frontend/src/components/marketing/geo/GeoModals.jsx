import { Trash2 } from 'lucide-react'
import { Icon } from '../../ui/Icon'
import { fmtDate } from './geoHelpers'

// ─── Modales de confirmación / generación de GeoTab ───────────────────────────

export default function GeoModals({
  deleteModal, deleting, onCancelDelete, onConfirmDelete,
  llmsModal, onCloseLlms,
  schemaModal, onCloseSchema,
}) {
  return (
    <>
      {/* Modal de confirmación de eliminación */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onCancelDelete()}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <span className="text-red-600 dark:text-red-400"><Icon as={Trash2} size={18} className="inline-block" /></span>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Eliminar análisis</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {deleteModal.score != null
                    ? `Score ${deleteModal.score}/100 · ${fmtDate(deleteModal.date)}`
                    : fmtDate(deleteModal.date)
                  }
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              Esta acción es permanente. El análisis se eliminará del historial y no se tendrá en cuenta en el gráfico de evolución de score ni en los informes.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancelDelete}
                className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirmDelete}
                disabled={deleting}
                className="flex-1 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal llms.txt */}
      {llmsModal && llmsModal !== 'loading' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">llms.txt generado</h2>
              <button onClick={onCloseLlms} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
            </div>
            <textarea
              readOnly
              value={llmsModal.content}
              rows={14}
              className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-xs font-mono resize-none focus:outline-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { navigator.clipboard.writeText(llmsModal.content); alert('Copiado al portapapeles') }}
                className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl">
                Copiar
              </button>
              <button onClick={onCloseLlms} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {llmsModal === 'loading' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-600 dark:text-gray-300">Generando llms.txt…</span>
          </div>
        </div>
      )}

      {/* Modal Schema.org */}
      {schemaModal && schemaModal !== 'loading' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Schema.org JSON-LD</h2>
              <button onClick={onCloseSchema} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
            </div>
            {schemaModal.schemas.length === 0
              ? <p className="text-sm text-gray-500">No se generaron schemas. El sitio podría ya tenerlos todos.</p>
              : (
                <div className="flex-1 overflow-y-auto space-y-4">
                  {schemaModal.schemas.map((s, i) => (
                    <div key={i}>
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{s.type}</p>
                      <textarea readOnly value={s.jsonLd} rows={6}
                        className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-xs font-mono resize-none focus:outline-none" />
                      <button onClick={() => { navigator.clipboard.writeText(s.jsonLd); alert(`${s.type} copiado`) }}
                        className="mt-1 text-xs text-primary-600 dark:text-primary-400 hover:underline">
                        Copiar {s.type}
                      </button>
                    </div>
                  ))}
                </div>
              )
            }
            <div className="flex justify-end mt-4">
              <button onClick={onCloseSchema} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {schemaModal === 'loading' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-600 dark:text-gray-300">Generando Schema.org…</span>
          </div>
        </div>
      )}
    </>
  )
}
