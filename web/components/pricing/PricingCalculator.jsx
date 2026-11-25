'use client'

import { useState, useMemo, useEffect } from 'react'
import { calcMonthly, priceForSeats } from '@/lib/pricingData'
import { trackEvent } from '@/lib/analytics'

/**
 * Calculadora de costo por cantidad de miembros. Es la única parte interactiva de
 * /pricing, así que es lo único que se manda al cliente: los tres planes, la tabla
 * comparativa y el FAQ los arma el server.
 */
export default function PricingCalculator({ pricingTiers, freeSeatLimit, scaleThreshold }) {
  const [seats, setSeats] = useState(5)

  const monthly     = useMemo(() => calcMonthly(seats, pricingTiers), [seats, pricingTiers])
  const annualPrice = useMemo(() => monthly * 12 * 0.85, [monthly]) // 15% de descuento anual
  const savings     = useMemo(() => Math.round(monthly * 12 - annualPrice), [monthly, annualPrice])
  const perSeat     = useMemo(() => priceForSeats(seats, pricingTiers), [seats, pricingTiers])

  // Uso real de la calculadora: 5 es el valor inicial, y se espera 1,5 s a que deje de
  // moverse para no mandar un evento por cada paso del deslizador.
  useEffect(() => {
    if (seats === 5) return
    const t = setTimeout(() => trackEvent('pricing_calc_used', { seats }), 1500)
    return () => clearTimeout(t)
  }, [seats])

  return (
    <div className="mt-10 bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
      <div className="flex items-center justify-between gap-6">
        <div className="flex-1 text-left">
          <label htmlFor="seats-range" className="text-sm text-gray-500">Cantidad de miembros</label>
          <div className="flex items-center gap-4 mt-2">
            <input
              id="seats-range"
              type="range" min="1" max="100" value={seats}
              onChange={e => setSeats(parseInt(e.target.value, 10) || 1)}
              className="flex-1 accent-primary-500"
            />
            <input
              type="number" min="1" max="500" value={seats}
              aria-label="Cantidad de miembros"
              onChange={e => setSeats(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-20 text-center border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 text-left">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-500">Plan recomendado</p>
          <p className="text-xl font-bold mt-1">
            {seats <= freeSeatLimit ? 'Gratis' : seats >= scaleThreshold ? 'Scale' : 'Pro'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {seats <= freeSeatLimit ? 'Sin costo' : `$${perSeat}/seat/mes`}
          </p>
        </div>
        <div className="bg-primary-50 rounded-xl p-4 border border-primary-100">
          <p className="text-xs text-primary-700">Costo mensual</p>
          <p className="text-3xl font-bold text-primary-700 mt-1">${monthly}</p>
          <p className="text-xs text-primary-600 mt-1">
            {seats <= freeSeatLimit ? 'Para siempre' : 'USD / mes'}
          </p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-500">Pagando anual</p>
          <p className="text-xl font-bold mt-1">${Math.round(annualPrice)}</p>
          <p className="text-xs text-green-600 mt-1">
            {seats > freeSeatLimit ? `Ahorrás $${savings}/año` : '—'}
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-6">
        Los precios son en USD. Stripe convierte automáticamente a tu moneda al momento del cobro.
      </p>
    </div>
  )
}
