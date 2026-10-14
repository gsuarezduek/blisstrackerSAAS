import { useState, useEffect } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../../components/LoadingSpinner'
import { timeAgo } from './shared'

// Visibilidad global (todos los workspaces) de los tokens de MCP/Agentes IA — solo
// lectura. El alta/baja la gestiona cada usuario desde su propio perfil (Preferencias
// → Agentes IA) o, para casos puntuales, los scripts backend/scripts/mcp-*-token.js.
export function SectionMcpTokens() {
  const [tokens,  setTokens]  = useState([])
  const [loading, setLoading] = useState(true)
  const [q,       setQ]       = useState('')

  useEffect(() => {
    api.get('/superadmin/mcp-tokens')
      .then(({ data }) => setTokens(data))
      .finally(() => setLoading(false))
  }, [])

  const filtered = tokens.filter(t => {
    if (!q.trim()) return true
    const needle = q.trim().toLowerCase()
    return [t.label, t.user?.name, t.user?.email, t.workspace?.name, t.workspace?.slug]
      .filter(Boolean)
      .some(v => v.toLowerCase().includes(needle))
  })

  const activeCount = tokens.filter(t => !t.revokedAt).length

  if (loading) return <LoadingSpinner size="sm" className="py-12" />

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Agentes IA conectados</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Tokens de MCP generados desde Preferencias → Agentes IA (o por script de ops) en todos los workspaces. {activeCount} activo{activeCount !== 1 ? 's' : ''} de {tokens.length}.
        </p>
      </div>

      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Buscar por persona, email, workspace o nombre del agente..."
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Sin resultados.</p>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs text-gray-400 dark:text-gray-500">
                <th className="px-4 py-2.5 font-medium">Agente</th>
                <th className="px-4 py-2.5 font-medium">Persona</th>
                <th className="px-4 py-2.5 font-medium">Workspace</th>
                <th className="px-4 py-2.5 font-medium">Creado</th>
                <th className="px-4 py-2.5 font-medium">Último uso</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                  <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{t.label || '(sin nombre)'}</td>
                  <td className="px-4 py-2.5">
                    <p className="text-gray-800 dark:text-gray-200">{t.user?.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{t.user?.email}</p>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{t.workspace?.name} <span className="text-gray-400 dark:text-gray-500">({t.workspace?.slug})</span></td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">{timeAgo(t.createdAt)}</td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">{t.lastUsedAt ? timeAgo(t.lastUsedAt) : 'nunca'}</td>
                  <td className="px-4 py-2.5">
                    {t.revokedAt ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Revocado</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">Activo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
