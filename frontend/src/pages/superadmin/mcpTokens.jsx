import { useState, useEffect, useMemo } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../../components/LoadingSpinner'
import { timeAgo } from './shared'

// Visibilidad global (todos los workspaces) de los tokens de MCP/Agentes IA — solo
// lectura. El alta/baja la gestiona cada usuario desde su propio perfil (Preferencias
// → Agentes IA) o, para casos puntuales, los scripts backend/scripts/mcp-*-token.js.

// Dirección con la que arranca cada columna al clickearla por primera vez: las
// fechas y el estado interesan "lo más reciente / lo activo primero", los textos
// alfabético.
const SORT_DEFAULT_DIR = {
  label: 'asc', user: 'asc', workspace: 'asc', createdAt: 'desc', lastUsedAt: 'desc', status: 'asc',
}

// `lastUsedAt` devuelve null para los agentes que nunca se usaron: "nunca" no es
// una fecha, así que esas filas van al final en las dos direcciones (ver el
// comparador abajo), no mezcladas con las más viejas.
function sortValue(t, col) {
  switch (col) {
    case 'label':      return (t.label || '').toLowerCase()
    case 'user':       return (t.user?.name || t.user?.email || '').toLowerCase()
    case 'workspace':  return (t.workspace?.name || t.workspace?.slug || '').toLowerCase()
    case 'createdAt':  return new Date(t.createdAt).getTime()
    case 'lastUsedAt': return t.lastUsedAt ? new Date(t.lastUsedAt).getTime() : null
    case 'status':     return t.revokedAt ? 1 : 0 // activos primero en asc
    default:           return 0
  }
}

// Encabezado de columna ordenable — mismo patrón que ProductivityTab.jsx.
function SortTh({ label, col, sortBy, sortDir, onSort }) {
  const active = sortBy === col
  return (
    <th className="px-4 py-2.5 font-medium">
      <button
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 transition-colors ${
          active ? 'text-gray-700 dark:text-gray-200' : 'hover:text-gray-600 dark:hover:text-gray-300'
        }`}
      >
        {label}
        <span className={active ? 'opacity-100' : 'opacity-0'}>{sortDir === 'asc' ? '▲' : '▼'}</span>
      </button>
    </th>
  )
}

export function SectionMcpTokens() {
  const [tokens,  setTokens]  = useState([])
  const [loading, setLoading] = useState(true)
  const [q,       setQ]       = useState('')
  const [sortBy,  setSortBy]  = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')

  function handleSort(col) {
    if (col === sortBy) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(col); setSortDir(SORT_DEFAULT_DIR[col] || 'desc') }
  }

  useEffect(() => {
    api.get('/superadmin/mcp-tokens')
      .then(({ data }) => setTokens(data))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const matches = tokens.filter(t => (
      !needle || [t.label, t.user?.name, t.user?.email, t.workspace?.name, t.workspace?.slug]
        .filter(Boolean)
        .some(v => v.toLowerCase().includes(needle))
    ))
    return matches.sort((a, b) => {
      const va = sortValue(a, sortBy), vb = sortValue(b, sortBy)
      if (va === null || vb === null) return va === vb ? 0 : (va === null ? 1 : -1)
      const cmp = typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [tokens, q, sortBy, sortDir])

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
                <SortTh label="Agente"     col="label"      sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Persona"    col="user"       sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Workspace"  col="workspace"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Creado"     col="createdAt"  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Último uso" col="lastUsedAt" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Estado"     col="status"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
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
