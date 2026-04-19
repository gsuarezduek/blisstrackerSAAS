import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

const STATUS_LABELS = {
  trialing:  { label: 'Trial',      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  active:    { label: 'Activo',     color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  past_due:  { label: 'Vencido',    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  suspended: { label: 'Suspendido', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  cancelled: { label: 'Cancelado',  color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
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
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function WorkspaceDetailModal({ workspace, onClose, onStatusChange }) {
  const [detail, setDetail]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [newStatus, setNewStatus] = useState('')
  const [saving, setSaving]       = useState(false)
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
    } finally {
      setSaving(false)
    }
  }

  async function handleImpersonate() {
    setImpersonating(true)
    try {
      const { data } = await api.post('/superadmin/impersonate', { workspaceId: workspace.id })
      window.open(`https://${data.slug}.${appDomain}/auth?token=${data.token}`, '_blank')
    } catch (err) {
      alert(err.response?.data?.error || 'Error al impersonar')
    } finally {
      setImpersonating(false)
    }
  }

  const totalTokens = detail?.tokenStats?.reduce(
    (sum, s) => sum + (s._sum.inputTokens || 0) + (s._sum.outputTokens || 0), 0
  ) ?? 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
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
          {/* Acciones rápidas */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleImpersonate}
              disabled={impersonating}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {impersonating ? 'Entrando...' : '🔑 Entrar al workspace'}
            </button>

            <div className="flex items-center gap-2">
              <select
                value={newStatus}
                onChange={e => setNewStatus(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Cambiar estado...</option>
                {Object.entries(STATUS_LABELS).map(([val, { label }]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <button
                onClick={handleStatusChange}
                disabled={!newStatus || saving}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-700 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {saving ? '...' : 'Aplicar'}
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Cargando...</p>
          ) : detail ? (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Miembros activos" value={detail.members?.filter(m => m.active).length ?? 0} />
                <StatCard label="Proyectos" value={detail.projects?.length ?? 0} />
                <StatCard label="Tokens AI" value={totalTokens.toLocaleString()} sub="total acumulado" />
              </div>

              {/* Trial */}
              {detail.trialEndsAt && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 text-sm">
                  <span className="font-medium text-blue-700 dark:text-blue-300">Trial:</span>
                  <span className="text-blue-600 dark:text-blue-400 ml-2">
                    vence {new Date(detail.trialEndsAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
              )}

              {/* Miembros */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Miembros ({detail.members?.length ?? 0})
                </h3>
                <div className="space-y-2">
                  {detail.members?.map(m => (
                    <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                      <div className="flex items-center gap-3">
                        <img
                          src={`/perfiles/${m.avatar || 'bee.png'}`}
                          className="w-7 h-7 rounded-full object-cover"
                          alt={m.name}
                        />
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

              {/* Proyectos */}
              {detail.projects?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Proyectos ({detail.projects.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.projects.map(p => (
                      <span key={p.id} className={`text-xs px-3 py-1 rounded-full ${
                        p.active ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {p.name}
                      </span>
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

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60) return 'hace un momento'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function FeedbackPanel() {
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    api.get('/superadmin/feedback').then(r => setItems(r.data)).finally(() => setLoading(false))
  }, [])

  async function handleMarkRead(id) {
    await api.put(`/superadmin/feedback/${id}/read`)
    setItems(prev => prev.map(f => f.id === id ? { ...f, read: true } : f))
  }

  const unreadCount = items.filter(f => !f.read).length
  const filtered = items.filter(f => {
    if (filter === 'unread') return !f.read
    if (filter === 'SUGGESTION' || filter === 'BUG') return f.type === filter
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

export default function SuperAdmin() {
  const navigate = useNavigate()
  const [stats, setStats]             = useState(null)
  const [workspaces, setWorkspaces]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, wsRes] = await Promise.all([
        api.get('/superadmin/stats'),
        api.get('/superadmin/workspaces'),
      ])
      setStats(statsRes.data)
      setWorkspaces(wsRes.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleStatusChange(id, newStatus) {
    setWorkspaces(ws => ws.map(w => w.id === id ? { ...w, status: newStatus } : w))
    if (selected?.id === id) setSelected(s => ({ ...s, status: newStatus }))
  }

  const filtered = workspaces.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.slug.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            ← Volver
          </button>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Panel Super Admin</h1>
        </div>
        <span className="text-xs bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 px-3 py-1 rounded-full font-medium">
          BlissTracker
        </span>
      </div>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Stats globales */}
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

        {/* Feedback global */}
        <FeedbackPanel />

        {/* Lista de workspaces */}
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
            <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No hay workspaces.</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map(w => (
                <div
                  key={w.id}
                  className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                  onClick={() => setSelected(w)}
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
                    <div>
                      <p className="text-xs text-gray-400">
                        {new Date(w.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <span className="text-gray-400 text-sm">›</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

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
