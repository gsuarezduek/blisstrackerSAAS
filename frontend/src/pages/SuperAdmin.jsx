import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  trialing:  { label: 'Trial',      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  active:    { label: 'Activo',     color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  past_due:  { label: 'Vencido',    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  suspended: { label: 'Suspendido', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  cancelled: { label: 'Cancelado',  color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
}

const EMAIL_TYPE_LABELS = {
  passwordReset:   { label: 'Reset contraseña', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  welcome:         { label: 'Bienvenida',        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  weeklySummary:   { label: 'Resumen semanal',   color: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' },
  testSettings:    { label: 'Email de prueba',   color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  invitation:      { label: 'Invitación',        color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  deletionWarning: { label: 'Aviso eliminación', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)        return 'hace un momento'
  if (diff < 3600)      return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400)     return `hace ${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)} día${Math.floor(diff / 86400) > 1 ? 's' : ''}`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  )
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

// ─── Workspace Detail Modal ───────────────────────────────────────────────────

function WorkspaceDetailModal({ workspace, onClose, onStatusChange }) {
  const [detail,       setDetail]       = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [newStatus,    setNewStatus]    = useState('')
  const [saving,       setSaving]       = useState(false)
  const [impersonating, setImpersonating] = useState(false)
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'

  useEffect(() => {
    api.get(`/superadmin/workspaces/${workspace.id}`)
      .then(r => { setDetail(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [workspace.id])

  async function handleStatusChange() {
    if (!newStatus || newStatus === workspace.status) return
    setSaving(true)
    try {
      await api.patch(`/superadmin/workspaces/${workspace.id}/status`, { status: newStatus })
      onStatusChange(workspace.id, newStatus)
      setNewStatus('')
    } finally { setSaving(false) }
  }

  async function handleImpersonate() {
    setImpersonating(true)
    try {
      const { data } = await api.post('/superadmin/impersonate', { workspaceId: workspace.id })
      window.open(`https://${data.slug}.${appDomain}/auth?token=${data.token}`, '_blank')
    } catch (err) {
      alert(err.response?.data?.error || 'Error al impersonar')
    } finally { setImpersonating(false) }
  }

  const totalTokens = detail?.tokenStats?.reduce(
    (sum, s) => sum + (s._sum.inputTokens || 0) + (s._sum.outputTokens || 0), 0
  ) ?? 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{workspace.name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{workspace.slug}.{appDomain}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={workspace.status} />
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2">✕</button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-wrap gap-3">
            <button onClick={handleImpersonate} disabled={impersonating}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
              {impersonating ? 'Entrando...' : '🔑 Entrar al workspace'}
            </button>
            <div className="flex items-center gap-2">
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">Cambiar estado...</option>
                {Object.entries(STATUS_LABELS).map(([val, { label }]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <button onClick={handleStatusChange} disabled={!newStatus || saving}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-700 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors">
                {saving ? '...' : 'Aplicar'}
              </button>
            </div>
          </div>

          {loading ? (
            <LoadingSpinner size="sm" className="py-8" />
          ) : detail ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Miembros activos" value={detail.members?.filter(m => m.active).length ?? 0} />
                <StatCard label="Proyectos" value={detail.projects?.length ?? 0} />
                <StatCard label="Tokens AI" value={totalTokens.toLocaleString()} sub="total acumulado" />
              </div>
              {detail.trialEndsAt && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-sm">
                  <span className="font-medium text-blue-700 dark:text-blue-300">Trial:</span>
                  <span className="text-blue-600 dark:text-blue-400 ml-2">
                    vence {new Date(detail.trialEndsAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
              )}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Miembros ({detail.members?.length ?? 0})</h3>
                <div className="space-y-2">
                  {detail.members?.map(m => (
                    <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                      <div className="flex items-center gap-3">
                        <img src={`/perfiles/${m.avatar || '2bee.png'}`} className="w-7 h-7 rounded-full object-cover" alt={m.name} />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{m.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{m.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.teamRole && <span className="text-xs text-gray-500">{m.teamRole}</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          m.role === 'owner' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' :
                          m.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                          'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}>{m.role}</span>
                        {!m.active && <span className="text-xs text-gray-400">(inactivo)</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {detail.projects?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Proyectos ({detail.projects.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.projects.map(p => (
                      <span key={p.id} className={`text-xs px-3 py-1 rounded-full ${
                        p.active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500'
                      }`}>{p.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-red-400 text-center py-4">Error al cargar el detalle.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Secciones ────────────────────────────────────────────────────────────────

function SectionDashboard({ stats, workspaces, loading, onSelectWorkspace }) {
  const [search, setSearch] = useState('')
  const filtered = workspaces.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.slug.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Workspaces" value={stats.totalWorkspaces} />
          <StatCard
            label="Activos"
            value={(stats.byStatus?.active || 0) + (stats.byStatus?.trialing || 0)}
            sub={`${stats.byStatus?.trialing || 0} en trial`}
          />
          <StatCard label="Usuarios" value={stats.totalUsers} />
          <StatCard label="Tareas creadas" value={stats.totalTasks?.toLocaleString()} />
        </div>
      )}

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

function SectionFeedback() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all')

  useEffect(() => {
    api.get('/superadmin/feedback').then(r => setItems(r.data)).finally(() => setLoading(false))
  }, [])

  async function handleMarkRead(id) {
    await api.put(`/superadmin/feedback/${id}/read`)
    setItems(prev => prev.map(f => f.id === id ? { ...f, read: true } : f))
  }

  const unreadCount = items.filter(f => !f.read).length
  const filtered = items.filter(f => {
    if (filter === 'unread')                             return !f.read
    if (filter === 'SUGGESTION' || filter === 'BUG')     return f.type === filter
    return true
  })

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-gray-900 dark:text-white">Feedback</h2>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{unreadCount}</span>
          )}
        </div>
        <div className="flex gap-1.5">
          {[
            { id: 'all',        label: 'Todos' },
            { id: 'unread',     label: `Sin leer (${unreadCount})` },
            { id: 'SUGGESTION', label: '💡' },
            { id: 'BUG',        label: '🐛' },
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

      {loading ? (
        <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">
          {filter === 'unread' ? 'No hay mensajes sin leer' : 'No hay mensajes todavía'}
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {filtered.map(f => (
            <div key={f.id} className={`px-5 py-4 flex items-start justify-between gap-3 ${f.read ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${
                  f.type === 'BUG'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    : 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                }`}>
                  {f.type === 'BUG' ? '🐛 Error' : '💡 Sugerencia'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{f.message}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{f.user.name}</span>
                    {f.workspace && (
                      <>
                        <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                          {f.workspace.name}
                        </span>
                      </>
                    )}
                    <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                    <span className="text-xs text-gray-400">{timeAgo(f.createdAt)}</span>
                    {f.read && <span className="text-xs text-gray-300 dark:text-gray-600 ml-auto">Leído ✓</span>}
                  </div>
                </div>
              </div>
              {!f.read && (
                <button onClick={() => handleMarkRead(f.id)} title="Marcar como leído"
                  className="flex-shrink-0 text-gray-400 hover:text-primary-600 transition-colors mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SectionEmails() {
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

// ─── Coming Soon placeholder ──────────────────────────────────────────────────

function SectionComingSoon({ label, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-5">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-gray-400 dark:text-gray-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">{label}</h2>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs leading-relaxed">
        {description || 'Esta sección está en construcción. Estará disponible próximamente.'}
      </p>
      <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-3 py-1.5 rounded-full">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
          <path fillRule="evenodd" d="M6.701 2.25c.577-1 2.02-1 2.598 0l5.196 9a1.5 1.5 0 01-1.299 2.25H2.804a1.5 1.5 0 01-1.3-2.25l5.197-9zM8 4a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-3A.75.75 0 018 4zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        En construcción
      </span>
    </div>
  )
}

// ─── Brand Manual ─────────────────────────────────────────────────────────────

const PALETTE = [
  { hex: '#FFAE5C', name: 'Orange Light' },
  { hex: '#FF8C2E', name: 'Orange Primary' },
  { hex: '#E67A1F', name: 'Orange Deep' },
  { hex: '#8A4E1C', name: 'Amber Dark' },
  { hex: '#3B2618', name: 'Brown Text' },
  { hex: '#140E0A', name: 'Background Dark', border: true },
  { hex: '#FFF4E6', name: 'Cream Text', border: true },
  { hex: '#FFFFFF', name: 'Check / Highlight', border: true },
]

function LogoPreviewRow({ dark, sizes, src, label }) {
  return (
    <div className={`rounded-xl p-5 flex items-center gap-6 flex-wrap ${dark ? 'bg-[#140E0A]' : 'bg-[#F5EFE6]'}`}>
      {sizes.map(s => (
        <div key={s} className="flex flex-col items-center gap-2">
          <img src={src} width={s} height={s} alt={`${label} ${s}px`} className="block" />
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${dark ? 'text-[#B8A896]' : 'text-[#7A6B5E]'}`}>{s} px</span>
        </div>
      ))}
    </div>
  )
}

function BrandNote({ children, green }) {
  return (
    <div className={`border-l-2 pl-4 py-2 rounded-r-lg text-xs leading-relaxed ${
      green
        ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
        : 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-800 dark:text-primary-300'
    }`}>
      {children}
    </div>
  )
}

function BrandCard({ title, subtitle, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function CodeBlock({ children }) {
  return (
    <pre className="bg-[#1F1812] text-[#E8DFD3] rounded-xl p-5 overflow-x-auto text-xs leading-relaxed font-mono max-h-72 overflow-y-auto">
      {children}
    </pre>
  )
}

function SectionBrandManual() {
  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Manual de Marca</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Sistema de logo completo: variantes, tipografía, monocromas, design tokens y narrativa.
        </p>
      </div>

      {/* ── Variante A ── */}
      <BrandCard
        title="Variante A — Minimalista"
        subtitle="Hexágono único con check grueso. Fondo transparente — funciona sobre cualquier superficie."
      >
        <LogoPreviewRow src="/blisstracker_logo.svg" sizes={[16, 32, 64, 128, 256]} label="Variante A" />
        <LogoPreviewRow src="/blisstracker_logo.svg" sizes={[16, 32, 64, 128, 256]} label="Variante A" dark />
        <BrandNote>
          <strong>Por qué funciona:</strong> a 16 px el check sigue visible porque el trazo fue engrosado a 44 y se mantiene la silueta hexagonal reconocible. Ideal para favicon, badge de notificación y app icon. Si necesitás un "contenedor" para iOS/Android, la plataforma lo agrega automáticamente.
        </BrandNote>
      </BrandCard>

      {/* ── Variante B ── */}
      <BrandCard
        title="Variante B — Panal Sutil"
        subtitle="Panal completo con fondo transparente. Hexágonos exteriores en ámbar oscuro que funcionan sobre fondos claros y oscuros."
      >
        <LogoPreviewRow src="/logo-honeycomb.svg" sizes={[32, 64, 128, 256, 384]} label="Variante B" />
        <LogoPreviewRow src="/logo-honeycomb.svg" sizes={[32, 64, 128, 256, 384]} label="Variante B" dark />
        <BrandNote>
          <strong>Nota:</strong> no usar a menos de 48 px — a ese tamaño los detalles del panal exterior se pierden; usá la Variante A. Los hexágonos exteriores usan <code>#C46F29 → #8A4E1C</code> con suficiente contraste en claro y oscuro.
        </BrandNote>
      </BrandCard>

      {/* ── Variante B Loading ── */}
      <BrandCard
        title="Variante B — Loading Animation"
        subtitle="Los hexágonos exteriores se iluminan en secuencia rotativa para indicar que la app está procesando."
      >
        <div className="rounded-xl p-6 bg-[#F5EFE6] flex items-center gap-10 flex-wrap">
          {[['64', 'spinner inline'], ['128', 'loading modal'], ['192', 'splash screen']].map(([s, lbl]) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <img src="/logo-loading.svg" width={+s} height={+s} alt={`Loading ${s}px`} />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#7A6B5E]">{s} px · {lbl}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-6 bg-[#140E0A] flex items-center gap-10 flex-wrap">
          {[['64', 'spinner inline'], ['128', 'loading modal'], ['192', 'splash screen']].map(([s, lbl]) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <img src="/logo-loading.svg" width={+s} height={+s} alt={`Loading ${s}px`} />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#B8A896]">{s} px · {lbl}</span>
            </div>
          ))}
        </div>

        {/* En contexto */}
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 pt-2">En contexto</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Phone splash */}
          <div className="flex flex-col gap-2">
            <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(180deg,#1F1812 0%,#140E0A 100%)', aspectRatio: '9/16', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '24px' }}>
              <img src="/logo-loading.svg" width={80} height={80} alt="Loading" />
              <span style={{ color: '#FFF4E6', fontWeight: 700, fontSize: 16, letterSpacing: '-0.5px' }}>BlissTracker</span>
              <span style={{ color: '#B8A896', fontSize: 12 }}>Sincronizando tus tareas…</span>
            </div>
            <p className="text-xs text-center text-gray-400 dark:text-gray-500">Splash / carga inicial</p>
          </div>
          {/* Card inline */}
          <div className="flex flex-col gap-2 justify-center">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 pb-3 border-b border-gray-100 dark:border-gray-700 mb-4">Tareas de hoy</p>
              <div className="flex items-center gap-3">
                <img src="/logo-loading.svg" width={36} height={36} alt="Cargando" />
                <span className="text-sm text-gray-400 dark:text-gray-500">Cargando tus tareas…</span>
              </div>
            </div>
            <p className="text-xs text-center text-gray-400 dark:text-gray-500">Spinner inline en interfaz</p>
          </div>
          {/* Button */}
          <div className="flex flex-col gap-2 justify-center">
            <div className="flex justify-center">
              <button disabled className="flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-semibold text-white" style={{ background: '#E67A1F', boxShadow: '0 4px 12px rgba(230,122,31,0.3)', cursor: 'default' }}>
                <img src="/logo-loading.svg" width={18} height={18} alt="" />
                Guardando cambios
              </button>
            </div>
            <p className="text-xs text-center text-gray-400 dark:text-gray-500">Estado de botón activo</p>
          </div>
        </div>

        <BrandNote green>
          <strong>Archivo:</strong> <code>logo-loading.svg</code> — un único archivo autónomo con CSS inline. Funciona en &lt;img&gt;, &lt;object&gt;, inline SVG y como background-image. No requiere JavaScript.
        </BrandNote>
        <BrandNote>
          <strong>Especificaciones:</strong> ciclo de 1.6 s, easing <code>cubic-bezier(0.4, 0, 0.2, 1)</code>, delay incremental de 130 ms. Respeta <code>prefers-reduced-motion</code> — los usuarios con esa preferencia verán los hexágonos estáticos al 50% de opacidad.
        </BrandNote>
      </BrandCard>

      {/* ── Variante C ── */}
      <BrandCard
        title="Variante C — Lockup Horizontal (Isotipo + Wordmark)"
        subtitle='Para headers, material impreso, firmas de email y landing page. Incluye versión clara y oscura.'
      >
        <div className="rounded-xl p-8 bg-[#F5EFE6] flex items-center justify-center">
          <img src="/logo-lockup.svg" alt="BlissTracker lockup versión clara" className="h-14 w-auto" />
        </div>
        <div className="rounded-xl p-8 bg-[#140E0A] flex items-center justify-center">
          <img src="/logo-lockup-dark.svg" alt="BlissTracker lockup versión oscura" className="h-14 w-auto" />
        </div>
        <BrandNote>
          "Bliss" en bold y naranja da énfasis, "Tracker" en regular actúa como descriptor funcional. El isotipo y el wordmark comparten la misma altura visual. El espacio entre mark y texto equivale al ancho de una "o" — patrón clásico de lockup.
        </BrandNote>
      </BrandCard>

      {/* ── Tipografía ── */}
      <BrandCard
        title="Tipografía"
        subtitle="Fuente principal del wordmark en la Variante C. Inter es una sans-serif optimizada para interfaces."
      >
        <div className="rounded-xl p-4 bg-[#F5EFE6] flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#7A6B5E]">Font stack:</span>
          <code className="text-sm text-[#2A1F17]">'Inter', 'SF Pro Display', 'Segoe UI', system-ui, -apple-system, sans-serif</code>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="p-6 pb-4" style={{ fontFamily: "'Inter','SF Pro Display','Segoe UI',system-ui,sans-serif", fontSize: 64, fontWeight: 700, color: '#E67A1F', letterSpacing: -2, lineHeight: 1 }}>Bliss</div>
            <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-3 bg-gray-50 dark:bg-gray-900/50 space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
              <div className="flex gap-3"><span className="font-semibold w-14 text-gray-400">Peso</span><span>700 · Bold</span></div>
              <div className="flex gap-3"><span className="font-semibold w-14 text-gray-400">Uso</span><span>Primer tramo del wordmark</span></div>
              <div className="flex gap-3"><span className="font-semibold w-14 text-gray-400">Color</span><span><span className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{background:'#E67A1F'}}/>&#x200B;#E67A1F</span></div>
            </div>
          </div>
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="p-6 pb-4" style={{ fontFamily: "'Inter','SF Pro Display','Segoe UI',system-ui,sans-serif", fontSize: 64, fontWeight: 400, color: '#3B2618', letterSpacing: -2, lineHeight: 1 }}>Tracker</div>
            <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-3 bg-gray-50 dark:bg-gray-900/50 space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
              <div className="flex gap-3"><span className="font-semibold w-14 text-gray-400">Peso</span><span>400 · Regular</span></div>
              <div className="flex gap-3"><span className="font-semibold w-14 text-gray-400">Uso</span><span>Descriptor funcional</span></div>
              <div className="flex gap-3"><span className="font-semibold w-14 text-gray-400">Color</span>
                <span>
                  <span className="inline-block w-3 h-3 rounded-sm align-middle mr-1 border border-gray-200" style={{background:'#3B2618'}}/>&#x200B;#3B2618 claro &nbsp;·&nbsp;
                  <span className="inline-block w-3 h-3 rounded-sm align-middle mr-1 border border-gray-400" style={{background:'#FFF4E6'}}/>&#x200B;#FFF4E6 oscuro
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                {['Propiedad', 'Valor', 'Notas'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              {[
                ['font-family', 'Inter', 'Fallback a SF Pro Display, Segoe UI, system-ui'],
                ['font-size', '240 (viewBox)', 'Cap-height ≈ altura del hexágono (187 px)'],
                ['font-weight "Bliss"', '700', 'Énfasis principal de la marca'],
                ['font-weight "Tracker"', '400', 'Descriptor secundario, menos peso visual'],
                ['letter-spacing', '-6', '≈ -0.025em, tight spacing para lockup compacto'],
                ['Baseline', 'y = 253.53', 'Alineada al borde inferior del hexágono'],
              ].map(([prop, val, note]) => (
                <tr key={prop} className="border-b border-gray-50 dark:border-gray-700/50">
                  <td className="px-4 py-2.5 font-mono">{prop}</td>
                  <td className="px-4 py-2.5"><code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{val}</code></td>
                  <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <BrandNote>
          <strong>Por qué Inter:</strong> diseñada específicamente para pantallas, tiene un x-height alto, formas geométricas limpias que combinan bien con el hexágono, y es gratuita (SIL Open Font License). Disponible en <a href="https://fonts.google.com/specimen/Inter" target="_blank" rel="noreferrer" className="underline">Google Fonts</a>.
        </BrandNote>
        <BrandNote green>
          <strong>Alternativas:</strong> SF Pro Display en Apple, Segoe UI en Windows, Roboto/system-ui en Android. Todas comparten métricas similares y mantendrán el lockup equilibrado.
        </BrandNote>
      </BrandCard>

      {/* ── Paleta ── */}
      <BrandCard
        title="Paleta de colores"
        subtitle="Tokens coherentes entre las tres variantes."
      >
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
          {PALETTE.map(({ hex, name, border }) => (
            <div key={hex} className="flex flex-col items-center gap-1.5">
              <div
                className={`w-12 h-12 rounded-xl ${border ? 'border border-gray-200 dark:border-gray-600' : ''}`}
                style={{ background: hex }}
              />
              <code className="text-[10px] text-gray-500 dark:text-gray-400">{hex}</code>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 text-center leading-tight">{name}</span>
            </div>
          ))}
        </div>
      </BrandCard>

      {/* ── Narrativa ── */}
      <BrandCard
        title="Narrativa del Logo"
        subtitle="La historia que cuenta cada elemento — para que la marca se explique sola."
      >
        <BrandNote>
          <strong>BlissTracker</strong> ayuda a las personas a gestionar sus tareas sin perder el foco. El logo traduce esa idea en tres símbolos: un <strong>hexágono</strong> (foco), un <strong>check</strong> (logro) y un <strong>panal</strong> (sistema). Juntos comunican claridad, progreso visible y un entorno que se organiza a tu alrededor.
        </BrandNote>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { title: 'Hexágono', body: 'Es la forma más eficiente de la naturaleza para cubrir espacio sin desperdiciar nada — igual que una tarea bien definida. El flat-top refuerza estabilidad; no es una forma caprichosa, es una estructura.' },
            { title: 'Check', body: 'El símbolo universal del "hecho". Lo dejamos ligeramente grueso (stroke 44) y con caps redondeados para que se sienta amable, no burocrático. Es la recompensa visual que todo usuario persigue.' },
            { title: 'Panal (Variante B)', body: 'Cada tarea no vive sola — pertenece a un sistema mayor. Los seis hexágonos exteriores representan las otras piezas del día; el central es la que estás enfocando ahora. El loader anima esa idea.' },
            { title: 'Gradiente naranja', body: 'Del #FFAE5C al #E67A1F: un naranja cálido, no agresivo, que sugiere energía y optimismo. La intensidad crece hacia la base del hexágono, dando peso y tracción visual.' },
            { title: 'Wordmark bi-peso', body: '"Bliss" en bold, "Tracker" en regular. El nombre se acentúa en el lado emocional; "tracker" queda como descriptor funcional. Sin espacio entre palabras: una sola marca, una sola promesa.' },
            { title: 'Por qué funciona en 16 px', body: 'El hexágono + check es legible hasta 16 px porque no depende del color para funcionar: la silueta sola ya comunica. Es la prueba de un buen isotipo — sobrevive a la compresión extrema.' },
          ].map(({ title, body }) => (
            <div key={title} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">{title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </BrandCard>

      {/* ── Zona de exclusión ── */}
      <BrandCard
        title="Zona de Exclusión (Clear Space)"
        subtitle="El espacio mínimo que debe rodear al logo para que respire."
      >
        <BrandNote>
          <strong>Regla:</strong> deja un margen libre igual a <code>x = 0.25 × altura del isotipo</code> en cada uno de los cuatro lados. Ningún otro elemento puede invadir esa zona. El valor es el <strong>mínimo</strong>, no el objetivo.
        </BrandNote>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Tamaños mínimos</p>
        <div className="flex items-end gap-6 flex-wrap bg-[#F5EFE6] rounded-xl p-5">
          {[
            { src: '/blisstracker_logo.svg', w: 24, h: 24, label: 'Isotipo · Digital', sub: '24 × 24 px' },
            { src: '/blisstracker_logo.svg', w: 40, h: 40, label: 'Isotipo · Cómodo', sub: '40 × 40 px' },
            { src: '/logo-lockup.svg', w: null, h: 36, label: 'Lockup · Digital', sub: 'ancho ≥ 120 px' },
            { src: '/logo-lockup.svg', w: null, h: 52, label: 'Lockup · Impreso', sub: 'ancho ≥ 25 mm' },
          ].map(({ src, w, h, label, sub }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <img src={src} width={w ?? undefined} height={h} style={w ? {} : { height: h, width: 'auto' }} alt={label} />
              <span className="text-[10px] font-semibold text-[#7A6B5E]">{label}</span>
              <span className="text-[10px] text-[#7A6B5E] opacity-70">{sub}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">Debajo de estos tamaños el check empieza a romperse. Si necesitás ir más chico, usá solo el hexágono en silueta sólida.</p>
      </BrandCard>

      {/* ── Don'ts ── */}
      <BrandCard
        title="Usos Incorrectos (Don'ts)"
        subtitle="Cosas que rompen la marca. Evitalas incluso cuando 'quedan bien'."
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'No estires ni comprimas', sub: 'Mantené siempre las proporciones originales', style: { transform: 'scaleX(1.5)' } },
            { label: 'No rotes el isotipo', sub: 'El flat-top siempre horizontal', style: { transform: 'rotate(30deg)' } },
            { label: 'No agregues sombras', sub: 'El gradiente ya aporta dimensión', style: { filter: 'drop-shadow(4px 4px 8px rgba(0,0,0,0.6))' } },
            { label: 'No uses bajo contraste', sub: 'Elegí la variante apropiada al fondo', bg: '#E67A1F' },
          ].map(({ label, sub, style, bg }) => (
            <div key={label} className="flex flex-col gap-2">
              <div className={`rounded-xl flex items-center justify-center p-5 h-24 relative overflow-hidden ${!bg ? 'bg-[#F5EFE6]' : ''}`} style={bg ? { background: bg } : {}}>
                <div className="relative" style={{ border: '2px dashed #E67A1F', borderRadius: 8, padding: 6 }}>
                  <img src="/blisstracker_logo.svg" width={40} height={40} alt="" style={style || {}} />
                  <span className="absolute -top-2 -right-2 text-red-500 text-lg font-bold leading-none">✕</span>
                </div>
              </div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-tight">{label}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'No agregues contornos', sub: 'El logo tiene forma propia', style: { outline: '3px solid #E67A1F', outlineOffset: 4, borderRadius: 4 } },
            { label: 'No recompongás el lockup', sub: 'Usá siempre la Variante C oficial' },
          ].map(({ label, sub, style }) => (
            <div key={label} className="flex flex-col gap-2">
              <div className="rounded-xl flex items-center justify-center p-5 h-24 bg-[#F5EFE6] relative overflow-hidden">
                <div className="relative" style={{ border: '2px dashed #E67A1F', borderRadius: 8, padding: 6 }}>
                  <img src="/blisstracker_logo.svg" width={40} height={40} alt="" style={style || {}} />
                  <span className="absolute -top-2 -right-2 text-red-500 text-lg font-bold leading-none">✕</span>
                </div>
              </div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 leading-tight">{label}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{sub}</p>
            </div>
          ))}
        </div>
      </BrandCard>

      {/* ── Monocromas ── */}
      <BrandCard
        title="Variantes Monocromas"
        subtitle="Para impresión a una tinta, grabados, merchandising o interfaces con restricciones de color."
      >
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <div className="rounded-xl bg-[#F5EFE6] flex items-center justify-center p-6 h-28">
              <img src="/logo-mono-black.svg" className="h-16 w-auto" alt="Negro + check blanco" />
            </div>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">Negro + check blanco</p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="rounded-xl bg-[#140E0A] flex items-center justify-center p-6 h-28">
              <img src="/logo-mono-white.svg" className="h-16 w-auto" alt="Blanco + check negro" />
            </div>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">Blanco + check negro</p>
          </div>
          <div className="flex flex-col gap-2">
            <div className="rounded-xl bg-[#F5EFE6] flex items-center justify-center p-6 h-28">
              <img src="/logo-mono-orange.svg" className="h-16 w-auto" alt="Naranja + check blanco" />
            </div>
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">Naranja + check blanco</p>
          </div>
        </div>
        <BrandNote>
          <strong>Cuándo usar monocromas:</strong> merchandising a dos tintas, grabados, stamps, headers de documentos formales, o cualquier contexto donde el gradiente naranja no esté disponible. Cada versión está pensada para un tipo de fondo distinto.
        </BrandNote>
      </BrandCard>

      {/* ── Design Tokens ── */}
      <BrandCard
        title="Design Tokens"
        subtitle="Una sola fuente de verdad para colores, tipografía y espaciado — consumible desde código."
      >
        <BrandNote>
          <strong>Por qué importa:</strong> cuando la app crezca, vas a tener decenas de lugares donde aparece el naranja de marca. Con tokens, cambiás <code>--bt-color-brand-primary</code> una vez y todo se actualiza. Los tokens están disponibles en CSS (para el frontend) y en JSON (para Figma / Style Dictionary).
        </BrandNote>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a href="/brand-tokens.css" download className="flex items-center gap-3 bg-[#F5EFE6] dark:bg-gray-700/50 rounded-xl px-4 py-3 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
            <span className="w-9 h-9 rounded-lg bg-primary-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">CSS</span>
            <div><p className="text-sm font-semibold text-gray-800 dark:text-gray-200 font-mono">tokens.css</p><p className="text-xs text-gray-400">CSS Custom Properties · importable</p></div>
          </a>
          <a href="/brand-tokens.json" download className="flex items-center gap-3 bg-[#F5EFE6] dark:bg-gray-700/50 rounded-xl px-4 py-3 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
            <span className="w-9 h-9 rounded-lg bg-primary-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">JSON</span>
            <div><p className="text-sm font-semibold text-gray-800 dark:text-gray-200 font-mono">tokens.json</p><p className="text-xs text-gray-400">Formato DTCG · para Figma / Style Dictionary</p></div>
          </a>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Ejemplo — CSS</p>
        <CodeBlock>{`/* Importá una vez en tu hoja principal */
@import "./tokens/tokens.css";

/* Usalos en cualquier componente */
.btn-primary {
  background:    var(--bt-color-brand-primary);
  color:         var(--bt-color-white);
  font-family:   var(--bt-font-family-base);
  font-weight:   var(--bt-font-weight-semibold);
  padding:       var(--bt-space-3) var(--bt-space-6);
  border-radius: var(--bt-radius-lg);
  box-shadow:    var(--bt-shadow-md);
  transition:    all var(--bt-duration-base) var(--bt-easing-standard);
}
.btn-primary:hover {
  background: var(--bt-color-orange-400);
  box-shadow: var(--bt-shadow-glow-md);
}`}</CodeBlock>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Categorías incluidas</p>
        <div className="flex flex-wrap gap-2">
          {['--bt-color-*', '--bt-font-*', '--bt-space-*', '--bt-radius-*', '--bt-shadow-*', '--bt-duration-*', '--bt-easing-*', '--bt-z-*', '--bt-breakpoint-*'].map(t => (
            <code key={t} className="text-xs bg-[#F5EFE6] dark:bg-gray-700 text-[#2A1F17] dark:text-gray-300 px-3 py-1.5 rounded-lg">{t}</code>
          ))}
        </div>
        <BrandNote green>
          <strong>Dark mode incluido:</strong> el archivo CSS activa automáticamente los colores oscuros cuando el sistema está en dark (<code>@media (prefers-color-scheme: dark)</code>) o si ponés <code>data-theme="dark"</code> en <code>&lt;html&gt;</code>.
        </BrandNote>
      </BrandCard>

      {/* ── Guía de uso ── */}
      <BrandCard title="Recomendación de Uso por Variante">
        <div className="space-y-2">
          {[
            { variant: 'Variante A', uses: 'App icon, favicon, badges, redes sociales (avatar), usos ≤ 128 px', icon: '/blisstracker_logo.svg', square: true },
            { variant: 'Variante B', uses: 'Splash screen, about page, merchandising, usos ≥ 256 px con espacio narrativo', icon: '/logo-honeycomb.svg', square: true },
            { variant: 'Variante B (loading)', uses: 'Estados de carga, skeletons, transiciones entre pantallas', icon: '/logo-loading.svg', square: true },
            { variant: 'Variante C', uses: 'Headers web, documentos, firmas de email, material impreso, lockup horizontal', icon: '/logo-lockup.svg', square: false },
            { variant: 'Monocromas', uses: 'Merchandising a dos tintas, headers de documentos, contextos sin gradiente', icon: '/logo-mono-black.svg', square: true },
          ].map(row => (
            <div key={row.variant} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
              <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                <img src={row.icon} className={row.square ? 'w-9 h-9' : 'h-6 w-auto'} alt={row.variant} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{row.variant}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{row.uses}</p>
              </div>
            </div>
          ))}
        </div>
      </BrandCard>
    </div>
  )
}

// ─── Sidebar nav items ────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: 'Visión general',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        implemented: true,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'metrics',
        label: 'Métricas',
        implemented: false,
        description: 'DAU/MAU, retención, tasa de conversión de trials, actividad por workspace y tendencias de uso a lo largo del tiempo.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 003 0v-13A1.5 1.5 0 0015.5 2zM9.5 6A1.5 1.5 0 008 7.5v9a1.5 1.5 0 003 0v-9A1.5 1.5 0 009.5 6zM3.5 10A1.5 1.5 0 002 11.5v5a1.5 1.5 0 003 0v-5A1.5 1.5 0 003.5 10z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Tenants',
    items: [
      {
        id: 'workspaces',
        label: 'Workspaces',
        implemented: true,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M4 16.5v-13h-.25a.75.75 0 010-1.5h12.5a.75.75 0 010 1.5H16v13h.25a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75v-2.5a.75.75 0 00-.75-.75h-2.5a.75.75 0 00-.75.75v2.5a.75.75 0 01-.75.75h-3.5a.75.75 0 010-1.5H4zm3-11a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5A.75.75 0 017 5.5zm.75 1.75a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5zm-.75 3.75a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5a.75.75 0 01-.75-.75zm5.75-5.5a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5zm-.75 3.75a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5a.75.75 0 01-.75-.75zm.75 1.75a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'users',
        label: 'Usuarios',
        implemented: false,
        description: 'Lista global de todos los usuarios de la plataforma. Buscar por email, ver en qué workspaces participa cada uno y desactivar cuentas globalmente.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.569 1.175A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z" />
          </svg>
        ),
      },
      {
        id: 'billing',
        label: 'Billing',
        implemented: false,
        description: 'MRR, ARR y churn. Lista de suscripciones activas, trials próximos a vencer, pagos fallidos y acceso al portal de Stripe. Requiere integración con Stripe.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M1 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H2a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h16a1 1 0 011 1v6a1 1 0 01-1 1H2a1 1 0 01-1-1v-6zm8 4a1 1 0 100-2 1 1 0 000 2zm3 1a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      {
        id: 'feedback',
        label: 'Feedback',
        implemented: true,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'emails',
        label: 'Emails',
        implemented: true,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
            <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
          </svg>
        ),
      },
      {
        id: 'ai-tokens',
        label: 'IA & Tokens',
        implemented: false,
        description: 'Uso de tokens de IA por workspace y usuario, costo estimado acumulado, anomalías de consumo y configuración de límites por workspace.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.683a1 1 0 01-.633-.633L6.95 5.684z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Sistema',
    items: [
      {
        id: 'announcements',
        label: 'Anuncios',
        implemented: false,
        description: 'Publicar avisos o novedades que aparecen dentro de la app para todos los workspaces o para workspaces específicos. Ideal para comunicar nuevas funciones o mantenimientos.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M13.92 3.845a19.361 19.361 0 01-6.3 1.98C6.765 5.942 5.89 6 5 6a4 4 0 00-.504 7.969 15.974 15.974 0 001.271 3.341c.397.77 1.342 1 2.05.59l.867-.5c.726-.42.94-1.321.588-2.021-.166-.33-.315-.666-.448-1.004 1.8.358 3.511.964 5.096 1.78A17.964 17.964 0 0015 10c0-2.161-.381-4.234-1.08-6.155zM15.243 3.097A19.456 19.456 0 0116.5 10c0 2.431-.445 4.758-1.257 6.904l-.03.077a.75.75 0 001.401.537 20.902 20.902 0 001.312-5.745 1.999 1.999 0 000-3.545 20.902 20.902 0 00-1.312-5.745.75.75 0 00-1.4.538l.029.076z" />
          </svg>
        ),
      },
      {
        id: 'feature-flags',
        label: 'Feature Flags',
        implemented: false,
        description: 'Activar o desactivar funcionalidades de la app por workspace, plan o globalmente. Útil para rollouts graduales y acceso anticipado a nuevas features.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3.5 2.75a.75.75 0 00-1.5 0v14.5a.75.75 0 001.5 0v-4.392l1.657-.348a6.449 6.449 0 014.271.572 7.948 7.948 0 005.965.524l2.078-.64A.75.75 0 0018 12.25v-8.5a.75.75 0 00-.904-.734l-2.38.501a7.25 7.25 0 01-4.186-.363l-.502-.2a8.75 8.75 0 00-5.053-.439l-1.475.31V2.75z" />
          </svg>
        ),
      },
      {
        id: 'settings',
        label: 'Configuración',
        implemented: false,
        description: 'Ajustes globales de la plataforma: modo mantenimiento, duración del trial por defecto, límites de uso de IA, configuración de dominios y variables operativas.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.992 6.992 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'brand',
        label: 'Manual de Marca',
        implemented: true,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4zm3.5 4.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM5 12.5l2.5-3 2 2.5 2.5-3.5L15 13H5z" clipRule="evenodd" />
          </svg>
        ),
      },
    ],
  },
]

// Flatten for lookup (id → section info)
const NAV_ITEMS_FLAT = NAV_GROUPS.flatMap(g => g.items)

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SuperAdmin() {
  const navigate  = useNavigate()
  const [section,    setSection]    = useState('dashboard')
  const [stats,      setStats]      = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, wsRes] = await Promise.all([
        api.get('/superadmin/stats'),
        api.get('/superadmin/workspaces'),
      ])
      setStats(statsRes.data)
      setWorkspaces(wsRes.data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function handleStatusChange(id, newStatus) {
    setWorkspaces(ws => ws.map(w => w.id === id ? { ...w, status: newStatus } : w))
    if (selected?.id === id) setSelected(s => ({ ...s, status: newStatus }))
  }

  const currentNavItem = NAV_ITEMS_FLAT.find(n => n.id === section)

  function renderSection() {
    if (section === 'dashboard' || section === 'workspaces') {
      return (
        <SectionDashboard
          stats={stats}
          workspaces={workspaces}
          loading={loading}
          onSelectWorkspace={setSelected}
        />
      )
    }
    if (section === 'feedback')   return <SectionFeedback />
    if (section === 'emails')     return <SectionEmails />
    if (section === 'brand')      return <SectionBrandManual />

    // Not yet implemented
    return (
      <SectionComingSoon
        label={currentNavItem?.label || section}
        description={currentNavItem?.description}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">

      {/* Top bar */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
            ← Volver
          </button>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Super Admin</span>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">{currentNavItem?.label}</span>
        </div>
        <img src="/logo-lockup.svg" alt="BlissTracker" className="h-7 w-auto" />
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col py-4 overflow-y-auto">
          <nav className="flex-1 px-3 space-y-5">
            {NAV_GROUPS.map(group => (
              <div key={group.label}>
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map(item => {
                    const isActive = section === item.id ||
                      (item.id === 'workspaces' && section === 'dashboard')
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSection(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left ${
                          isActive
                            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                      >
                        <span className={isActive ? 'text-primary-600 dark:text-primary-400' : ''}>
                          {item.icon}
                        </span>
                        <span className="flex-1">{item.label}</span>
                        {!item.implemented && (
                          <span className="flex-shrink-0 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full leading-none">
                            Soon
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {renderSection()}
          </div>
        </main>
      </div>

      {selected && (
        <WorkspaceDetailModal
          workspace={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
