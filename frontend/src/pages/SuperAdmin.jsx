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
