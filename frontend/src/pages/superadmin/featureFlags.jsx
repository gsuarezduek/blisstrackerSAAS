import { useState, useEffect } from 'react'
import api from '../../api/client'

export function SectionFeatureFlags() {
  const [flags, setFlags]         = useState([])
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/superadmin/feature-flags'),
      api.get('/superadmin/workspaces'),
    ]).then(([ff, ws]) => {
      setFlags(ff.data)
      setWorkspaces(ws.data)
    }).finally(() => setLoading(false))
  }, [])

  async function toggleGlobal(flag) {
    const { data } = await api.patch(`/superadmin/feature-flags/${flag.id}`, {
      enabledGlobally: !flag.enabledGlobally,
      // Si se activa globalmente, limpiar la lista de workspaces específicos
      ...(!flag.enabledGlobally ? { enabledWorkspaceIds: [] } : {}),
    })
    setFlags(prev => prev.map(f => f.id === data.id ? data : f))
  }

  async function toggleWorkspace(flag, wsId) {
    const ids = flag.enabledWorkspaceIds.includes(wsId)
      ? flag.enabledWorkspaceIds.filter(id => id !== wsId)
      : [...flag.enabledWorkspaceIds, wsId]
    const { data } = await api.patch(`/superadmin/feature-flags/${flag.id}`, { enabledWorkspaceIds: ids })
    setFlags(prev => prev.map(f => f.id === data.id ? data : f))
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Feature Flags</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Activá o desactivá funcionalidades por workspace o globalmente.</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 inline-block">
          Los flags se definen en el código del servidor — aparecen aquí automáticamente al deployar.
        </p>
      </div>

      {/* Lista de flags */}
      {flags.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-8 text-center">
          <p className="text-gray-400 dark:text-gray-500 text-sm">No hay feature flags definidos todavía.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map(flag => (
            <div key={flag.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4">
              {/* Header del flag */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">{flag.key}</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{flag.name}</span>
                    {flag.enabledGlobally && (
                      <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">Global</span>
                    )}
                    {!flag.enabledGlobally && flag.enabledWorkspaceIds.length > 0 && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                        {flag.enabledWorkspaceIds.length} workspace{flag.enabledWorkspaceIds.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {!flag.enabledGlobally && flag.enabledWorkspaceIds.length === 0 && (
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 px-2 py-0.5 rounded-full">Desactivado</span>
                    )}
                  </div>
                  {flag.description && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{flag.description}</p>}
                </div>
              </div>

              {/* Toggle global */}
              <div className="flex items-center justify-between py-2 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Activar para todos los workspaces</p>
                  {flag.enabledGlobally && <p className="text-xs text-gray-400 dark:text-gray-500">Desactiva el control por workspace</p>}
                </div>
                <button
                  onClick={() => toggleGlobal(flag)}
                  className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ml-4 ${flag.enabledGlobally ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${flag.enabledGlobally ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Control por workspace (solo si no es global) */}
              {!flag.enabledGlobally && (
                <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Acceso por workspace</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {workspaces.map(ws => {
                      const active = flag.enabledWorkspaceIds.includes(ws.id)
                      return (
                        <button
                          key={ws.id}
                          onClick={() => toggleWorkspace(flag, ws.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left ${
                            active
                              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 border border-primary-300 dark:border-primary-700'
                              : 'bg-gray-50 dark:bg-gray-900/40 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                          <span className="truncate">{ws.slug}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Section: IA & Tokens ─────────────────────────────────────────────────────

