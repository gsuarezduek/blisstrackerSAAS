import { useState, useEffect } from 'react'
import api from '../../../api/client'
import { CHECK_STATUS, shortHost, fmtDateShort } from './enlacesHelpers'

/**
 * El historial de verificación de un enlace. Es append-only, así que esta lista
 * contesta "¿cuándo desapareció y con qué anchor estaba?" — la pregunta que
 * ninguna herramienta de backlinks responde sobre TUS enlaces.
 */
export default function BacklinkChecksModal({ projectId, link, onClose }) {
  const [checks, setChecks] = useState(null)
  const [error, setError]   = useState(null)

  useEffect(() => {
    api.get(`/marketing/projects/${projectId}/backlinks/${link.id}/checks`)
      .then(r => setChecks(r.data))
      .catch(err => setError(err.response?.data?.error ?? 'No se pudo leer el historial.'))
  }, [projectId, link.id])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto p-5">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Historial de chequeos</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 break-all">{shortHost(link.sourceUrl)}</p>

        {error && <p className="text-xs text-red-600 dark:text-red-400 mt-3">{error}</p>}
        {!checks && !error && <p className="text-sm text-gray-400 mt-4">Cargando…</p>}

        {checks && !checks.length && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
            Este enlace todavía no se verificó. La verificación corre todos los lunes, o cuando la dispares a mano.
          </p>
        )}

        {checks?.length > 0 && (
          <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-700">
            {checks.map(c => {
              const meta = CHECK_STATUS[c.status] || { label: c.status, tone: 'text-gray-500' }
              return (
                <div key={c.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-sm font-medium ${meta.tone}`}>{meta.label}</span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">
                      {fmtDateShort(c.createdAt)}
                      {c.httpStatus != null && <> · HTTP {c.httpStatus}</>}
                    </span>
                  </div>
                  {(c.anchor || c.linkType || c.noindex || c.redirectedTo || c.errorMsg) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {c.anchor && <>«{c.anchor}»</>}
                      {c.linkType && <> · {c.linkType}</>}
                      {c.noindex && <> · la página está en noindex, así que no transmite autoridad</>}
                      {c.redirectedTo && <> · redirige a {shortHost(c.redirectedTo)}</>}
                      {c.errorMsg && <> · {c.errorMsg}</>}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
