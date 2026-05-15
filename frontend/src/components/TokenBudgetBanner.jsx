import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

function fmtTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString()
}

/**
 * Banner global que aparece cuando el workspace se acerca o supera
 * su límite mensual de tokens de IA.
 *
 * - warning  (≥ 90% usado): amarillo
 * - critical (≥ 95% usado): rojo
 * - exceeded (100% usado):  rojo bloqueante
 */
export default function TokenBudgetBanner() {
  const { user } = useAuth()
  const [budget,    setBudget]    = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!user) return
    api.get('/workspaces/current/token-budget')
      .then(r => setBudget(r.data))
      .catch(() => {})
  }, [user])

  if (!budget || dismissed) return null
  if (budget.status === 'ok') return null

  const { used, limit, pct, status } = budget
  const isExceeded = status === 'exceeded'
  const isCritical = status === 'critical' || isExceeded
  const remaining  = Math.max(0, limit - used)

  return (
    <div className={`relative z-40 px-4 py-2.5 text-sm flex items-center justify-between gap-4 ${
      isCritical ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
    }`}>
      <span className="flex-1 text-center">
        {isExceeded ? (
          <>
            🚫 El workspace alcanzó el <strong>límite mensual de tokens de IA</strong>.
            Las funcionalidades de IA están deshabilitadas hasta el próximo mes.
            {user?.isAdmin && (
              <>{' '}<Link to="/preferences" className="underline font-semibold hover:opacity-80">Ver consumo</Link></>
            )}
          </>
        ) : isCritical ? (
          <>
            ⚠️ Solo quedan <strong>{fmtTokens(remaining)} tokens</strong> disponibles este mes ({pct}% usado).
            {user?.isAdmin && (
              <>{' '}<Link to="/preferences" className="underline font-semibold hover:opacity-80">Ver consumo</Link></>
            )}
          </>
        ) : (
          <>
            ⚠️ Se usó el <strong>{pct}% del límite mensual de IA</strong> — quedan {fmtTokens(remaining)} tokens.
            {user?.isAdmin && (
              <>{' '}<Link to="/preferences" className="underline font-semibold hover:opacity-80">Ver consumo</Link></>
            )}
          </>
        )}
      </span>
      {!isExceeded && (
        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity"
          aria-label="Cerrar"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
