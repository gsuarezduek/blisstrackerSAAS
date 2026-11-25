'use client'

/**
 * Tracking dual: GA4 (gtag) + backend (POST /api/events), igual que
 * frontend/src/lib/analytics.js — mismos nombres de evento, para no cortar las
 * series históricas al mudar la landing.
 *
 * La diferencia con la versión de la app: acá se usa `fetch` crudo y no el cliente
 * de axios, porque el sitio público no tiene JWT ni workspace que mandar.
 * Fire-and-forget: si falla, el visitante no se entera.
 */
const API = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')

export function trackEvent(name, params = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', name, params)
    }
  } catch { /* noop */ }

  try {
    fetch(`${API}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, params }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* noop */ }
}
