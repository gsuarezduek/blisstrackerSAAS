// Helpers, constantes y componentes COMPARTIDOS entre secciones del panel SuperAdmin.
// Extraído de SuperAdmin.jsx (antes 4183 líneas en un solo archivo).
import { useState, useEffect } from 'react'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'
import LoadingSpinner from '../../components/LoadingSpinner'

export const STATUS_LABELS = {
  trialing:  { label: 'Trial',      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  active:    { label: 'Activo',     color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  past_due:  { label: 'Vencido',    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  suspended: { label: 'Suspendido', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  cancelled: { label: 'Cancelado',  color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
}

export const EMAIL_TYPE_LABELS = {
  passwordReset:   { label: 'Reset contraseña', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  welcome:         { label: 'Bienvenida',        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  weeklySummary:   { label: 'Resumen semanal',   color: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' },
  testSettings:    { label: 'Email de prueba',   color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  invitation:      { label: 'Invitación',        color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  deletionWarning: { label: 'Aviso eliminación', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  adminAlert:      { label: 'Aviso admin',       color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
}

export function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)        return 'hace un momento'
  if (diff < 3600)      return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400)     return `hace ${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)} día${Math.floor(diff / 86400) > 1 ? 's' : ''}`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtBytes(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let val = n / 1024
  let i = 0
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++ }
  return `${val.toFixed(val >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || { label: status, color: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  )
}

export function StatCard({ label, value, sub, valueColor }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueColor || 'text-gray-900 dark:text-white'}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

// ─── Workspace Detail Modal ───────────────────────────────────────────────────

export function WorkspaceDetailModal({ workspace, onClose, onStatusChange }) {
  const [detail,        setDetail]        = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [newStatus,     setNewStatus]     = useState('')
  const [saving,        setSaving]        = useState(false)
  const [impersonating, setImpersonating] = useState(false)
  const [tokenLimit,    setTokenLimit]    = useState('')
  const [savingLimit,   setSavingLimit]   = useState(false)
  const [savingExempt,  setSavingExempt]  = useState(false)
  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'

  useEffect(() => {
    api.get(`/superadmin/workspaces/${workspace.id}`)
      .then(r => {
        setDetail(r.data)
        setTokenLimit(String(r.data.monthlyTokenLimit ?? 1000000))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [workspace.id])

  async function handleSaveTokenLimit() {
    const limit = parseInt(tokenLimit, 10)
    if (isNaN(limit) || limit < 0) return alert('Ingresá un número válido (0 = ilimitado)')
    setSavingLimit(true)
    try {
      await api.patch(`/superadmin/workspaces/${workspace.id}/token-limit`, { monthlyTokenLimit: limit })
      setDetail(prev => ({ ...prev, monthlyTokenLimit: limit }))
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar')
    } finally { setSavingLimit(false) }
  }

  async function handleToggleExempt() {
    const next = !detail?.billingExempt
    if (next && !confirm('Eximir este workspace de billing. Quedará activo de forma permanente y el cron de free tier nunca lo pasará a vencido. ¿Continuar?')) return
    setSavingExempt(true)
    try {
      const { data } = await api.patch(`/superadmin/workspaces/${workspace.id}/billing-exempt`, { billingExempt: next })
      setDetail(prev => ({ ...prev, billingExempt: data.billingExempt, status: data.status }))
      if (data.status !== workspace.status) onStatusChange(workspace.id, data.status)
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar')
    } finally { setSavingExempt(false) }
  }

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
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Tokens/mes:</label>
              <input
                type="number"
                min="0"
                value={tokenLimit}
                onChange={e => setTokenLimit(e.target.value)}
                placeholder="1000000"
                className="w-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button onClick={handleSaveTokenLimit} disabled={savingLimit}
                className="px-3 py-2 bg-gray-600 hover:bg-gray-700 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors">
                {savingLimit ? '...' : 'Guardar'}
              </button>
            </div>
            <button onClick={handleToggleExempt} disabled={savingExempt || loading}
              title="Un workspace exento queda activo de forma permanente y nunca es marcado como vencido por el cron de free tier."
              className={`px-3 py-2 text-sm font-medium rounded-xl transition-colors disabled:opacity-40 ${
                detail?.billingExempt
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
              }`}>
              {savingExempt ? '...' : detail?.billingExempt ? '✓ Exento de billing' : 'Eximir de billing'}
            </button>
          </div>

          {loading ? (
            <LoadingSpinner size="sm" className="py-8" />
          ) : detail ? (
            <>
              {/* Métricas rápidas */}
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Miembros activos" value={detail.members?.filter(m => m.active).length ?? 0} />
                <StatCard label="Proyectos" value={detail.projects?.length ?? 0} />
                {(() => {
                  const used  = detail.monthlyTokenUsed  ?? 0
                  const limit = detail.monthlyTokenLimit  ?? 1000000
                  const pct   = limit > 0 ? Math.round((used / limit) * 100) : 0
                  const valColor = pct >= 100 ? 'text-red-500' : pct >= 80 ? 'text-amber-500' : undefined
                  return (
                    <StatCard
                      label="Tokens IA (mes)"
                      value={fmtTokens(used)}
                      sub={`de ${fmtTokens(limit)} (${pct}%)`}
                      valueColor={valColor}
                    />
                  )
                })()}
              </div>

              {/* Suscripción / Billing */}
              <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Suscripción</h3>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={detail.status} />
                    {detail.stripeCustomerId && (
                      <a
                        href={`https://dashboard.stripe.com/customers/${detail.stripeCustomerId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                        title="Ver customer en Stripe"
                      >
                        Stripe ↗
                      </a>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {/* Trial — solo cuando está en trialing */}
                  {detail.status === 'trialing' && detail.trialEndsAt && (
                    <>
                      <span className="text-gray-500 dark:text-gray-400">Vencimiento del trial</span>
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {new Date(detail.trialEndsAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </>
                  )}

                  {/* Suscripción activa */}
                  {detail.subscription && (
                    <>
                      <span className="text-gray-500 dark:text-gray-400">Seats facturados</span>
                      <span className="font-medium text-gray-800 dark:text-gray-200">{detail.subscription.seats}</span>

                      {detail.subscription.periodEnd && (
                        <>
                          <span className="text-gray-500 dark:text-gray-400">
                            {detail.status === 'active' ? 'Próxima facturación' : 'Vencimiento'}
                          </span>
                          <span className="font-medium text-gray-800 dark:text-gray-200">
                            {new Date(detail.subscription.periodEnd).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                        </>
                      )}

                      {detail.subscription.stripeSubId && (
                        <>
                          <span className="text-gray-500 dark:text-gray-400">Suscripción Stripe</span>
                          <a
                            href={`https://dashboard.stripe.com/subscriptions/${detail.subscription.stripeSubId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono text-primary-600 dark:text-primary-400 hover:underline truncate"
                            title={detail.subscription.stripeSubId}
                          >
                            {detail.subscription.stripeSubId}
                          </a>
                        </>
                      )}
                    </>
                  )}

                  {/* Sin suscripción ni trial info */}
                  {!detail.subscription && detail.status !== 'trialing' && (
                    <>
                      <span className="text-gray-500 dark:text-gray-400">Sin suscripción</span>
                      <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                    </>
                  )}
                </div>

                {/* Info adicional del workspace */}
                <div className="pt-2 border-t border-gray-200 dark:border-gray-600 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-400 dark:text-gray-500">
                  <span>Timezone: <span className="text-gray-600 dark:text-gray-300">{detail.timezone}</span></span>
                  <span>Creado: <span className="text-gray-600 dark:text-gray-300">
                    {new Date(detail.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span></span>
                </div>
              </div>

              {/* Miembros */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Miembros ({detail.members?.length ?? 0})</h3>
                <div className="space-y-2">
                  {detail.members?.map(m => (
                    <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                      <div className="flex items-center gap-3">
                        <img src={avatarUrl(m.avatar)} className="w-7 h-7 rounded-full object-cover" alt={m.name} />
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

              {/* Uso de tokens por servicio */}
              {detail.tokenStats?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Uso de IA por servicio</h3>
                  <div className="space-y-1.5">
                    {detail.tokenStats.map(s => (
                      <div key={s.service} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-xs">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{s.service}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {((s._sum.inputTokens || 0) + (s._sum.outputTokens || 0)).toLocaleString()} tokens
                          <span className="ml-2 text-gray-400">
                            ({(s._sum.inputTokens || 0).toLocaleString()} in / {(s._sum.outputTokens || 0).toLocaleString()} out)
                          </span>
                        </span>
                      </div>
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

// Tarjeta-resumen clickable que lleva a otra sección del panel.
export function OverviewCard({ title, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{title}</h3>
        <span className="text-gray-300 dark:text-gray-600 group-hover:text-primary-500 dark:group-hover:text-primary-400 text-sm transition-colors">→</span>
      </div>
      {children}
    </button>
  )
}

export const OverviewSkeleton = () => (
  <div className="space-y-2 animate-pulse">
    <div className="h-7 w-20 bg-gray-100 dark:bg-gray-700 rounded" />
    <div className="h-3 w-32 bg-gray-100 dark:bg-gray-700 rounded" />
  </div>
)

// Dashboard: resumen global de la plataforma con atajos a cada sección.
export function SectionComingSoon({ label, description }) {
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

export function fmtTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export function fmtCost(usd) {
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1)    return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

