/**
 * Tracking dual: GA4 (gtag) + backend (POST /api/events).
 * Fire-and-forget: nunca rompe UX si falla. No requiere auth.
 *
 * Uso:
 *   import { trackEvent } from '../lib/analytics'
 *   trackEvent('landing_cta_click', { location: 'hero' })
 */
import api from '../api/client'

export function trackEvent(name, params = {}) {
  // GA4
  try {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', name, params)
    }
  } catch { /* noop */ }

  // Backend (ConversionEvent)
  try {
    api.post('/events', { name, params }).catch(() => {})
  } catch { /* noop */ }
}
