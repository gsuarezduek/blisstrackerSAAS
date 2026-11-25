import { apiGet } from '@/lib/api'
import { siteUrl } from '@/lib/urls'
import { PRICING_DEFAULTS } from '@/lib/landingDefaults'
import { fetchAllPosts, postPath } from '@/lib/blog'

export const revalidate = 3600

/**
 * llms.txt generado. Es el mismo documento que estaba a mano en frontend/public, con
 * dos diferencias: los precios salen de /api/public/pricing (antes quedaban viejos cada
 * vez que se tocaba el pricing real) y la lista de páginas incluye los artículos del
 * blog, que es justo lo que un modelo querría citar.
 *
 * Es un route handler y no un archivo estático porque tiene datos que cambian. Se sirve
 * como text/plain en /llms.txt.
 */
export async function GET() {
  const [pricing, posts] = await Promise.all([
    apiGet('/api/public/pricing', { fallback: PRICING_DEFAULTS, revalidate: 3600, tags: ['pricing'] }),
    fetchAllPosts({ max: 100 }),
  ])
  const { pricingTiers, freeSeatLimit, trialDays } = { ...PRICING_DEFAULTS, ...pricing }
  const proPrice   = pricingTiers[0].pricePerSeat
  const scalePrice = pricingTiers[pricingTiers.length - 1].pricePerSeat
  const scaleFrom  = (pricingTiers[0].upTo ?? 0) + 1

  const body = `# BlissTracker

> El sistema operativo de tu agencia. Un dashboard unificado para gestión de equipo + marketing (GEO, SEO, Ads, Social) + reportes para clientes, con coaching de IA contextual.

BlissTracker es un SaaS B2B argentino que reemplaza Asana + SEMrush + 6 spreadsheets para agencias de marketing. Combina task management con foco forzado (una tarea activa a la vez), un toolkit de marketing completo (GEO audits para AI Overviews, SEO con Google Search Console, keyword tracking + SERP snapshots, GA4, Meta Ads, Google Ads, Instagram, TikTok), y reportes mensuales con URL pública para entregar a clientes sin que se loguen.

## Diferenciadores únicos

- **GEO Audit (Generative Engine Optimization)**: análisis de 23 crawlers de IA (Perplexity, Claude, ChatGPT, Gemini), llms.txt generation, JSON-LD schema sugerido. Primero en mercado en optimizar para AI Overviews.
- **Reportes públicos con token UUID**: cada informe mensual tiene URL shareable sin login para que los clientes vean métricas sin fricción.
- **AI Coaching contextual**: Claude Haiku genera insights diarios con memoria semanal del perfil del usuario + expectativas de rol. No es coaching genérico.
- **EOS / Traction nativo**: módulos Visión, Personas, Datos, Asuntos, Procesos, Tracción y Evaluación integrados al mismo task tracker.
- **Foco forzado**: solo una tarea IN_PROGRESS por persona, auto-pausa por inactividad, bloqueos con razón y notificación.

## Pricing

- **Gratis**: hasta ${freeSeatLimit} usuarios, sin tarjeta de crédito, todas las funcionalidades core.
- **Pro**: USD ${proPrice} por usuario / mes. Marketing toolkit, reportes públicos, RRHH, integraciones ilimitadas.
- **Scale**: USD ${scalePrice} por usuario / mes desde ${scaleFrom} usuarios. Onboarding personalizado.

Trial: ${trialDays} días sin tarjeta.

## Para quién es

- **Agencias de marketing**: el toolkit GEO+SEO+Ads+Social+Reportes públicos es el caso de uso primario.
- **Equipos con sistema EOS (Traction)**: implementación EOS nativa, alternativa más barata a Ninety.io.
- **Equipos técnicos**: foco forzado + AI coaching contextual.

## Páginas

- Landing: ${siteUrl('/')}
- Pricing: ${siteUrl('/pricing')}
- Marketing (GEO/SEO/Ads): ${siteUrl('/soluciones/marketing')}
- EOS / Traction: ${siteUrl('/soluciones/eos')}
- Ventas (CRM): ${siteUrl('/soluciones/ventas')}
- Blog: ${siteUrl('/blog')}
- Contacto: ${siteUrl('/contacto')}
- Términos: ${siteUrl('/condiciones')}
- Privacidad: ${siteUrl('/privacidad')}
- Eliminación de datos: ${siteUrl('/eliminar-datos')}

## Artículos del blog
${posts.length === 0
  ? '\n(todavía no hay artículos publicados)'
  : posts.map(p => `\n- [${p.title}](${siteUrl(postPath(p.slug))}): ${p.excerpt || 'Artículo del blog de BlissTracker.'}`).join('')}

## Empresa

- Hecho en Argentina por Gastón Suárez Duek.
- Contacto: gaston@blissmkt.ar
- Sitio del creador: https://blissmkt.ar
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
