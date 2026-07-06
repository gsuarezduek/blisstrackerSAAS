import { useState, useEffect } from 'react'
import api from '../../api/client'

export const STATUS_BILLING_LABELS = {
  active:    { label: 'Activo',          cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  trialing:  { label: 'Trial',           cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  past_due:  { label: 'Pago pendiente',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  suspended: { label: 'Suspendido',      cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  cancelled: { label: 'Cancelado',       cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
}

export function BillingStatusBadge({ status }) {
  const { label, cls } = STATUS_BILLING_LABELS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

export function fmtBillingDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SectionBilling() {
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState('all') // all | active | trialing | past_due | attention
  const [payments, setPayments]     = useState([])
  const [pLoading, setPLoading]     = useState(true)
  const [pHasMore, setPHasMore]     = useState(false)
  const [pCursor, setPCursor]       = useState(null)  // id del último item para paginación

  const appDomain = import.meta.env.VITE_APP_DOMAIN || 'blisstracker.app'

  useEffect(() => {
    api.get('/superadmin/billing')
      .then(r => setData(r.data))
      .finally(() => setLoading(false))

    api.get('/superadmin/payments?limit=25')
      .then(r => {
        setPayments(r.data.payments)
        setPHasMore(r.data.has_more)
        if (r.data.payments.length) setPCursor(r.data.payments.at(-1).id)
      })
      .finally(() => setPLoading(false))
  }, [])

  async function loadMorePayments() {
    if (!pCursor) return
    const r = await api.get(`/superadmin/payments?limit=25&starting_after=${pCursor}`)
    setPayments(prev => [...prev, ...r.data.payments])
    setPHasMore(r.data.has_more)
    if (r.data.payments.length) setPCursor(r.data.payments.at(-1).id)
  }

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  if (!data)   return <p className="text-sm text-red-500">Error cargando datos de billing.</p>

  const filtered = data.workspaces.filter(w => {
    if (filter === 'active')   return w.status === 'active'
    if (filter === 'trialing') return w.status === 'trialing'
    if (filter === 'past_due') return w.status === 'past_due'
    if (filter === 'attention') return w.status === 'past_due' || (w.status === 'trialing' && w.trialDaysLeft != null && w.trialDaysLeft <= 7)
    return true
  })

  const kpis = [
    { label: 'MRR', value: `$${data.mrr.toLocaleString()}`, sub: 'USD / mes', color: 'text-green-600 dark:text-green-400' },
    { label: 'ARR', value: `$${data.arr.toLocaleString()}`, sub: 'USD / año', color: 'text-green-600 dark:text-green-400' },
    { label: 'Activos', value: data.activeCount, sub: 'workspaces', color: 'text-gray-900 dark:text-white' },
    { label: 'En trial', value: data.trialingCount, sub: 'workspaces', color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Trials vencen ≤7d', value: data.trialingSoon, sub: 'requieren atención', color: data.trialingSoon > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white' },
    { label: 'Pago pendiente', value: data.pastDueCount, sub: 'workspaces', color: data.pastDueCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white' },
  ]

  const filterTabs = [
    { id: 'all',       label: `Todos (${data.workspaces.length})` },
    { id: 'active',    label: `Activos (${data.activeCount})` },
    { id: 'trialing',  label: `Trial (${data.trialingCount})` },
    { id: 'past_due',  label: `Pago pendiente (${data.pastDueCount})` },
    { id: 'attention', label: `⚠ Atención (${data.trialingSoon + data.pastDueCount})` },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Billing</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Resumen de suscripciones, trials y facturación estimada.{' '}
          {data.pricingTiers?.map((t, i) => (
            <span key={i} className="font-medium text-gray-600 dark:text-gray-300">
              {i > 0 && ' · '}
              ${t.pricePerSeat}/seat {t.upTo ? `(1–${t.upTo})` : `(${data.pricingTiers[i-1]?.upTo + 1}+)`}
            </span>
          ))}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {kpis.map(k => (
          <div key={k.label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {filterTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              filter === t.id
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tabla de workspaces */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No hay workspaces en este filtro.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Workspace</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Seats</th>
                <th className="px-4 py-3 text-right">MRR</th>
                <th className="px-4 py-3 text-left">Trial / Próx. cobro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map(w => (
                <tr key={w.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 dark:text-gray-200">{w.name}</p>
                    <p className="text-xs text-gray-400">{w.slug}.{appDomain}</p>
                  </td>
                  <td className="px-4 py-3">
                    <BillingStatusBadge status={w.status} />
                    {w.status === 'trialing' && w.trialDaysLeft != null && w.trialDaysLeft <= 7 && (
                      <span className={`ml-1.5 text-xs font-semibold ${w.trialDaysLeft <= 3 ? 'text-red-500' : 'text-amber-500'}`}>
                        {w.trialDaysLeft === 0 ? '¡vence hoy!' : `${w.trialDaysLeft}d`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{w.seats}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800 dark:text-gray-200">
                    {w.mrr > 0
                      ? <span title={`${w.pricePerSeat}/seat`}>${w.mrr}</span>
                      : <span className="text-gray-300 dark:text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                    {w.status === 'trialing'
                      ? (w.trialEndsAt ? `Vence ${fmtBillingDate(w.trialEndsAt)}` : '—')
                      : (w.subscription?.periodEnd ? fmtBillingDate(w.subscription.periodEnd) : '—')
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagos recibidos ─────────────────────────────────────────────── */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Pagos recibidos</h3>

        {pLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : payments.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-8 text-center text-sm text-gray-400">
            No hay pagos registrados todavía.
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-left">Fecha</th>
                    <th className="px-4 py-3 text-left">Workspace</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3 text-left">Período</th>
                    <th className="px-4 py-3 text-center">Factura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {payments.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {fmtBillingDate(p.date)}
                      </td>
                      <td className="px-4 py-3">
                        {p.workspace ? (
                          <>
                            <p className="font-medium text-gray-800 dark:text-gray-200">{p.workspace.name}</p>
                            <p className="text-xs text-gray-400">{p.workspace.slug}.{appDomain}</p>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">{p.customerEmail || p.id}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency }).format(p.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                        {p.periodStart && p.periodEnd
                          ? `${fmtBillingDate(p.periodStart)} → ${fmtBillingDate(p.periodEnd)}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-3">
                          {p.pdfUrl && (
                            <a
                              href={p.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                              title="Descargar PDF"
                            >
                              PDF
                            </a>
                          )}
                          {p.hostedUrl && (
                            <a
                              href={p.hostedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:underline"
                              title="Ver en Stripe"
                            >
                              Ver
                            </a>
                          )}
                          {p.number && (
                            <span className="text-xs text-gray-300 dark:text-gray-600 font-mono">
                              {p.number}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pHasMore && (
              <div className="flex justify-center mt-3">
                <button
                  onClick={loadMorePayments}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:underline font-medium"
                >
                  Cargar más pagos
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Section: Feature Flags ───────────────────────────────────────────────────

