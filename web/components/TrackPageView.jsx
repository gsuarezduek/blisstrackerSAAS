'use client'

import { useEffect } from 'react'
import { trackEvent } from '@/lib/analytics'

/**
 * Registra una vista de página (GA4 + ConversionEvent). Componente vacío: existe sólo
 * para que un `useEffect` no obligue a convertir en client component la página entera.
 */
export default function TrackPageView({ event, params = {} }) {
  useEffect(() => {
    trackEvent(event, params)
    // Una sola vez por montaje; `params` es un literal nuevo en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event])
  return null
}
