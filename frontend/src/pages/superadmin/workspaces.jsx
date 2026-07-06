import { useState } from 'react'
import LoadingSpinner from '../../components/LoadingSpinner'
import { StatusBadge, fmtTokens } from './shared'

export function SectionWorkspaces({ workspaces, loading, onSelectWorkspace }) {
  const [search, setSearch] = useState('')
  const filtered = workspaces.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.slug.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Workspaces */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Workspaces</h2>
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 w-48"
          />
        </div>

        {loading ? (
          <LoadingSpinner size="sm" className="py-8" />
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No hay workspaces.</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filtered.map(w => (
              <div key={w.id}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                onClick={() => onSelectWorkspace(w)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{w.name}</p>
                    <StatusBadge status={w.status} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{w.slug}</p>
                </div>
                <div className="flex items-center gap-6 ml-4 text-right">
                  <div className="hidden sm:block">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{w.memberCount}</p>
                    <p className="text-xs text-gray-400">miembros</p>
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{w.projectCount}</p>
                    <p className="text-xs text-gray-400">proyectos</p>
                  </div>
                  <div className="hidden md:block text-right min-w-[80px]">
                    {(() => {
                      const used  = w.monthlyTokenUsed  ?? 0
                      const limit = w.monthlyTokenLimit  ?? 1000000
                      const pct   = limit > 0 ? Math.round((used / limit) * 100) : 0
                      const color = pct >= 100 ? 'text-red-500 dark:text-red-400'
                                  : pct >= 80  ? 'text-amber-500 dark:text-amber-400'
                                  : 'text-gray-700 dark:text-gray-300'
                      return (
                        <>
                          <p className={`text-sm font-medium ${color}`}>{fmtTokens(used)}</p>
                          <p className="text-xs text-gray-400">de {fmtTokens(limit)}</p>
                        </>
                      )
                    })()}
                  </div>
                  <p className="text-xs text-gray-400">
                    {new Date(w.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  <span className="text-gray-400 text-sm">›</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

