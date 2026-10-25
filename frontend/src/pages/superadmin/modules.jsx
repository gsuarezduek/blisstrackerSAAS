import { useState, useEffect } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../../components/LoadingSpinner'

// Flags en stage='module': estables, forzados enabledGlobally=true en cada
// arranque del server (ver index.js) — por eso esta pantalla es de solo
// lectura. El único lugar donde un workspace puede apagar uno es su propio
// opt-out en Preferencias → Módulos adicionales (Workspace.disabledFeatureKeys).
export function SectionModules() {
  const [flags, setFlags]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/superadmin/feature-flags')
      .then(({ data }) => setFlags(data.filter(f => f.stage === 'module')))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-12"><LoadingSpinner size="lg" /></div>

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Módulos</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Funcionalidades estables, habilitadas por defecto para todos los workspaces.</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 inline-block">
          Se gestionan en código (<code>config/featureFlags.js</code>), no hay toggle acá. Si un workspace puntual no quiere usar uno, lo desactiva desde su propia Preferencias → Módulos adicionales.
        </p>
      </div>

      {flags.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-8 text-center">
          <p className="text-gray-400 dark:text-gray-500 text-sm">No hay módulos estables definidos todavía.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map(flag => (
            <div key={flag.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">{flag.key}</span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{flag.name}</span>
                <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">Habilitado para todos</span>
              </div>
              {flag.description && <p className="text-xs text-gray-400 dark:text-gray-500">{flag.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
