import { SITE_URL, siteUrl } from '@/lib/urls'

/**
 * robots.txt del sitio público. Reemplaza al archivo estático de frontend/public, que
 * además listaba rutas (`Allow: /pricing`…) que no hacían falta: con `Allow: /` ya
 * está todo permitido.
 *
 * Los crawlers de IA quedan explícitamente permitidos, igual que antes: la idea es que
 * ChatGPT, Claude y Perplexity puedan citar el sitio.
 *
 * Lo que NO va acá: los subdominios. `app.blisstracker.app` y los workspaces de las
 * agencias los sirve el proyecto de la SPA, que tiene su propio robots.txt con
 * Disallow y manda X-Robots-Tag: noindex.
 */
const AI_CRAWLERS = ['GPTBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot', 'Google-Extended']

export default function robots() {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      ...AI_CRAWLERS.map(userAgent => ({ userAgent, allow: '/' })),
    ],
    sitemap: siteUrl('/sitemap.xml'),
    host: SITE_URL,
  }
}
