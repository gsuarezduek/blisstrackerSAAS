import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    trialing:  { label: 'Trial activo',   cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    active:    { label: 'Activo',          cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    past_due:  { label: 'Pago pendiente', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    suspended: { label: 'Suspendido',      cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
    cancelled: { label: 'Cancelado',       cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Billing() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()

  const [billing, setBilling]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [redirecting, setRedirecting] = useState(false)

  const justSucceeded  = searchParams.get('success') === '1'
  const justCancelled  = searchParams.get('cancelled') === '1'

  useEffect(() => {
    api.get('/billing/status')
      .then(r => setBilling(r.data))
      .catch(() => setError('No se pudo cargar la información de facturación'))
      .finally(() => setLoading(false))
  }, [])

  async function handleUpgrade() {
    setRedirecting(true)
    setError('')
    try {
      const { data } = await api.post('/billing/checkout')
      window.location.href = data.url
    } catch (e) {
      setError(e.response?.data?.error || 'Error al iniciar el proceso de pago')
      setRedirecting(false)
    }
  }

  async function handlePortal() {
    setRedirecting(true)
    setError('')
    try {
      const { data } = await api.post('/billing/portal')
      window.location.href = data.url
    } catch (e) {
      setError(e.response?.data?.error || 'Error al abrir el portal de facturación')
      setRedirecting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isAdmin = billing?.isAdmin
  const status  = billing?.status
  const sub     = billing?.subscription

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Facturación</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Gestioná tu plan y suscripción de BlissTracker.
        </p>
      </div>

      {/* Banner de retorno desde Stripe */}
      {justSucceeded && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-xl px-4 py-3 text-sm text-green-700 dark:text-green-300 font-medium">
          ¡Suscripción activada correctamente! Gracias por confiar en BlissTracker.
        </div>
      )}
      {justCancelled && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Proceso de pago cancelado. Tu trial sigue activo hasta su vencimiento.
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Tarjeta de estado */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 space-y-5">

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
              Estado del plan
            </p>
            <div className="flex items-center gap-3">
              <p className="text-lg font-bold text-gray-900 dark:text-white">Pro</p>
              {billing && <StatusBadge status={status} />}
            </div>
          </div>
          {billing && (
            <div className="text-right">
              <p className="text-xs text-gray-400 dark:text-gray-500">Seats activos</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{billing.seats}</p>
            </div>
          )}
        </div>

        <hr className="border-gray-100 dark:border-gray-700" />

        {/* Trial info */}
        {status === 'trialing' && (
          <div className="space-y-1">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <span className="font-semibold">Período de prueba gratuito</span> — incluye todas las funcionalidades Pro.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Vence el{' '}
              <span className="font-medium text-gray-700 dark:text-gray-200">
                {fmtDate(billing?.trialEndsAt)}
              </span>
              {billing?.trialDaysLeft != null && (
                <span className={` ml-1 font-semibold ${billing.trialDaysLeft <= 3 ? 'text-red-500' : billing.trialDaysLeft <= 7 ? 'text-amber-500' : 'text-gray-700 dark:text-gray-200'}`}>
                  ({billing.trialDaysLeft === 0 ? 'vence hoy' : `${billing.trialDaysLeft} día${billing.trialDaysLeft !== 1 ? 's' : ''} restante${billing.trialDaysLeft !== 1 ? 's' : ''}`})
                </span>
              )}
            </p>
          </div>
        )}

        {/* Suscripción activa */}
        {status === 'active' && sub && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Próxima facturación</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{fmtDate(sub.periodEnd)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-gray-500">Período actual</p>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {fmtDate(sub.periodStart)} → {fmtDate(sub.periodEnd)}
              </p>
            </div>
          </div>
        )}

        {/* Pago pendiente */}
        {status === 'past_due' && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            Hay un pago pendiente en tu cuenta. Regularizá tu método de pago para evitar la suspensión del workspace.
          </div>
        )}

        {/* Cancelado/Suspendido */}
        {(status === 'suspended' || status === 'cancelled') && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-300">
            Tu suscripción está inactiva. Renovála para recuperar el acceso completo.
          </div>
        )}

        {/* Acciones */}
        {isAdmin && (
          <div className="flex flex-wrap gap-3 pt-1">
            {/* Upgrade: trial, past_due o cancelled sin sub activa */}
            {(status === 'trialing' || status === 'past_due' || status === 'cancelled') && (
              <button
                onClick={handleUpgrade}
                disabled={redirecting}
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {redirecting ? 'Redirigiendo…' : status === 'trialing' ? 'Suscribirse ahora' : 'Reactivar suscripción'}
              </button>
            )}

            {/* Portal: tiene stripeCustomerId (ya pasó por Checkout al menos 1 vez) */}
            {(status === 'active' || status === 'past_due') && sub?.stripeSubId && (
              <button
                onClick={handlePortal}
                disabled={redirecting}
                className="px-5 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-50 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-xl transition-colors"
              >
                {redirecting ? 'Redirigiendo…' : 'Gestionar suscripción'}
              </button>
            )}
          </div>
        )}

        {/* Mensaje para no-owners */}
        {!isAdmin && (status === 'trialing' || status === 'past_due') && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Solo el owner del workspace puede gestionar la suscripción.
          </p>
        )}
      </div>

      {/* Precios */}
      {status !== 'active' && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Plan Pro · Precio por persona</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900 dark:text-white">$10</span>
            <span className="text-sm text-gray-400">USD / seat / mes</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            {[
              'Proyectos y tareas ilimitadas',
              'Reportes e insights con IA',
              'Marketing GEO y más módulos',
              'Invitaciones a miembros del equipo',
              'Soporte prioritario',
            ].map(f => (
              <li key={f} className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  )
}
