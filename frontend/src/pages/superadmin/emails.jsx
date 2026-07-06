import { useState, useEffect } from 'react'
import api from '../../api/client'
import { EMAIL_TYPE_LABELS, timeAgo } from './shared'

export function SectionEmails() {
  const [logs,       setLogs]       = useState([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState('all')
  const [typeFilter, setTypeFilter] = useState('')
  const PAGE = 50

  async function load(reset = true) {
    setLoading(true)
    try {
      const offset = reset ? 0 : logs.length
      const params = new URLSearchParams({ limit: PAGE, offset })
      if (filter !== 'all') params.set('status', filter)
      if (typeFilter)       params.set('type',   typeFilter)
      const { data } = await api.get(`/superadmin/email-logs?${params}`)
      setLogs(reset ? data.logs : prev => [...prev, ...data.logs])
      setTotal(data.total)
    } finally { setLoading(false) }
  }

  useEffect(() => { load(true) }, [filter, typeFilter])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-white">Emails enviados</h2>
          <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5">{total}</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="text-xs border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400">
            <option value="">Todos los tipos</option>
            {Object.entries(EMAIL_TYPE_LABELS).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <div className="flex gap-1">
            {[
              { id: 'all',    label: 'Todos' },
              { id: 'sent',   label: '✓ Enviados' },
              { id: 'failed', label: '✕ Fallidos' },
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  filter === f.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && logs.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
      ) : logs.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">No hay emails registrados todavía.</div>
      ) : (
        <>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {logs.map(log => {
              const typeInfo = EMAIL_TYPE_LABELS[log.type] || { label: log.type, color: 'bg-gray-100 text-gray-600' }
              return (
                <div key={log.id} className="px-5 py-3.5 flex items-start gap-3">
                  <span className={`flex-shrink-0 mt-0.5 text-xs font-bold w-4 ${log.status === 'sent' ? 'text-green-500' : 'text-red-500'}`}>
                    {log.status === 'sent' ? '✓' : '✕'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      {log.workspace && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
                          {log.workspace.name}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{log.subject}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[260px]">→ {log.to}</span>
                      {log.errorMsg && (
                        <span className="text-xs text-red-400 truncate max-w-[220px]" title={log.errorMsg}>
                          {log.errorMsg}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap mt-0.5">
                    {timeAgo(log.createdAt)}
                  </span>
                </div>
              )
            })}
          </div>
          {logs.length < total && (
            <div className="p-4 text-center border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => load(false)} disabled={loading}
                className="text-sm text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50">
                {loading ? 'Cargando...' : `Cargar más (${total - logs.length} restantes)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Section: Users (global, cross-workspace) ────────────────────────────────

