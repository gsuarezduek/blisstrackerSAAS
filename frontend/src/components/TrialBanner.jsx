import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'

/**
 * Banner global que aparece cuando:
 *   - El trial vence en ≤ 7 días (status: trialing)
 *   - El pago está pendiente (status: past_due)
 *
 * Se monta en App.jsx, dentro de las rutas privadas.
 */
export default function TrialBanner() {
  const { workspace } = useWorkspace()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || !workspace) return null

  const status       = workspace.status
  const trialDaysLeft = workspace.trialDaysLeft

  // Solo mostrar en estados relevantes
  const showTrial   = status === 'trialing' && trialDaysLeft != null && trialDaysLeft <= 7
  const showPastDue = status === 'past_due'

  if (!showTrial && !showPastDue) return null

  const isPastDue = showPastDue
  const isUrgent  = isPastDue || (trialDaysLeft != null && trialDaysLeft <= 3)

  return (
    <div className={`relative z-40 px-4 py-2.5 text-sm flex items-center justify-between gap-4 ${
      isUrgent
        ? 'bg-red-600 text-white'
        : 'bg-amber-500 text-white'
    }`}>
      <span className="flex-1 text-center">
        {isPastDue ? (
          <>
            ⚠️ Tu suscripción tiene un <strong>pago pendiente</strong>.{' '}
            <Link to="/billing" className="underline font-semibold hover:opacity-80">
              Regularizá tu cuenta
            </Link>{' '}
            para evitar la suspensión.
          </>
        ) : trialDaysLeft === 0 ? (
          <>
            🕐 Tu trial <strong>vence hoy</strong>.{' '}
            <Link to="/billing" className="underline font-semibold hover:opacity-80">
              Suscribite ahora
            </Link>{' '}
            para no perder el acceso.
          </>
        ) : (
          <>
            🕐 Tu trial vence en{' '}
            <strong>{trialDaysLeft} día{trialDaysLeft !== 1 ? 's' : ''}</strong>.{' '}
            <Link to="/billing" className="underline font-semibold hover:opacity-80">
              Ver planes
            </Link>
          </>
        )}
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity"
        aria-label="Cerrar"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
