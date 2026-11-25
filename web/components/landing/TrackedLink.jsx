'use client'

import { trackEvent } from '@/lib/analytics'

/**
 * Link que además registra el click (GA4 + ConversionEvent del backend). Existe porque
 * un onClick obliga a client component y no tiene sentido arrastrar una sección entera
 * al cliente por un evento de analítica: se aísla en este envoltorio mínimo.
 *
 * Es <a> y no next/link a propósito: casi todos estos CTA van a la app, que es otro
 * dominio, donde no hay navegación de cliente posible.
 */
export default function TrackedLink({ href, event, params = {}, children, ...props }) {
  return (
    <a href={href} onClick={() => trackEvent(event, params)} {...props}>
      {children}
    </a>
  )
}
