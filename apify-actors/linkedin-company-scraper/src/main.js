// LinkedIn Company Page Scraper — entry point.
//
// Scrapea Company Pages PÚBLICAS de LinkedIn sin login. Devuelve, por empresa,
// un único item con el shape esperado por `normalizeApifyCompany` del backend
// de BlissTracker (variante "A": detalle con posts anidados).

import { Actor, log } from 'apify'
import { PlaywrightCrawler } from 'crawlee'

import { collectSlugs } from './parseInput.js'
import { extractCompanyProfile, extractCompanyPosts } from './extract.js'

await Actor.init()

try {
    const input = (await Actor.getInput()) ?? {}
    const slugs = collectSlugs(input)
    const maxPosts          = Number.isFinite(input.maxPosts)        ? input.maxPosts        : Number(input.limit) || 30
    const minRequestDelayMs = Number.isFinite(input.minRequestDelayMs) ? input.minRequestDelayMs : 2000
    const proxyConfig = await Actor.createProxyConfiguration(input.proxy ?? {
        useApifyProxy:     true,
        apifyProxyGroups:  ['RESIDENTIAL'],
    })

    if (slugs.length === 0) {
        log.warning('No se proveyeron empresas para scrapear. Input recibido: ' + JSON.stringify(input))
        await Actor.pushData({ error: 'No se proveyeron empresas. Pasá `identifier: ["slug1", "slug2"]` o `companyUrls: ["https://..."]`.' })
        await Actor.exit()
    }

    log.info(`Scrapeando ${slugs.length} empresa(s) de LinkedIn (postsLimit=${maxPosts})`)

    // ─── Resultados por slug ─────────────────────────────────────────────────
    // El crawler visita 2 URLs por empresa (overview + posts) y vamos
    // acumulando datos en este map; al final pusheamos un item por empresa.
    const bySlug = new Map()
    for (const slug of slugs) {
        bySlug.set(slug, {
            slug,
            profile: null,
            posts:   [],
            errors:  [],
        })
    }

    const requestList = []
    for (const slug of slugs) {
        requestList.push({
            url:       `https://www.linkedin.com/company/${slug}/`,
            userData:  { slug, kind: 'overview' },
            uniqueKey: `overview-${slug}`,
        })
        if (maxPosts > 0) {
            requestList.push({
                url:       `https://www.linkedin.com/company/${slug}/posts/?feedView=all`,
                userData:  { slug, kind: 'posts' },
                uniqueKey: `posts-${slug}`,
            })
        }
    }

    const crawler = new PlaywrightCrawler({
        proxyConfiguration: proxyConfig,
        maxRequestRetries:  3,
        requestHandlerTimeoutSecs: 90,
        navigationTimeoutSecs:     60,
        maxConcurrency:            Math.max(1, Math.min(4, slugs.length)),
        // Estilo "humano": delays aleatorios entre 1x y 2x el mínimo
        sessionPoolOptions: {
            maxPoolSize: 50,
            sessionOptions: { maxUsageCount: 8 },
        },
        useSessionPool: true,
        persistCookiesPerSession: true,
        // Headers realistas (Chrome estable)
        preNavigationHooks: [
            async ({ request, page }) => {
                await page.setExtraHTTPHeaders({
                    'Accept-Language':  'en-US,en;q=0.9,es;q=0.8',
                    'Accept':           'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Sec-Fetch-Dest':   'document',
                    'Sec-Fetch-Mode':   'navigate',
                    'Sec-Fetch-Site':   'none',
                    'Sec-Fetch-User':   '?1',
                    'Upgrade-Insecure-Requests': '1',
                })
                // Delay aleatorio antes de cada navegación
                const delay = minRequestDelayMs + Math.random() * minRequestDelayMs
                log.debug(`Esperando ${Math.round(delay)}ms antes de pegarle a ${request.url}`)
                await new Promise(r => setTimeout(r, delay))
            },
        ],
        // Anti-detección básica: ocultar `navigator.webdriver`
        browserPoolOptions: {
            useFingerprints: true,
            fingerprintOptions: {
                fingerprintGeneratorOptions: {
                    browsers: [{ name: 'chrome', minVersion: 120 }],
                    devices:  ['desktop'],
                    operatingSystems: ['windows', 'macos'],
                    locales: ['en-US', 'en'],
                },
            },
        },
        launchContext: {
            launchOptions: {
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=IsolateOrigins,site-per-process',
                ],
            },
        },
        async requestHandler({ request, page, response, log: rlog }) {
            const { slug, kind } = request.userData
            const acc = bySlug.get(slug)
            const status = response?.status() ?? 0

            // LinkedIn a veces responde 999 (rate limit / bot detection) o 429.
            if (status === 429 || status === 999) {
                rlog.warning(`${slug}/${kind}: status ${status}, retry programado`)
                throw new Error(`LinkedIn rate-limited (${status})`)
            }
            if (status >= 400) {
                if (status === 404) {
                    acc.errors.push(`${kind}: 404 — empresa no encontrada`)
                    return
                }
                rlog.warning(`${slug}/${kind}: HTTP ${status}`)
                throw new Error(`HTTP ${status}`)
            }

            // Cerrar overlay de login modal si aparece (no bloquea lectura del DOM
            // pero a veces confunde a los selectors).
            try {
                const dismissBtn = page.locator('button[aria-label="Dismiss"], button.modal__dismiss').first()
                if (await dismissBtn.count() > 0) await dismissBtn.click({ timeout: 1500 }).catch(() => {})
            } catch { /* ignorar */ }

            // Esperar a que el contenido principal esté presente (no bloquea si timeout)
            try {
                await page.waitForLoadState('domcontentloaded', { timeout: 15000 })
            } catch { /* ignorar */ }

            try {
                if (kind === 'overview') {
                    const profile = await extractCompanyProfile(page, slug)
                    acc.profile = profile
                    rlog.info(`${slug}/overview: name="${profile.name}" followers=${profile.followerCount}`)
                } else if (kind === 'posts') {
                    const posts = await extractCompanyPosts(page, slug, maxPosts)
                    acc.posts = posts
                    rlog.info(`${slug}/posts: ${posts.length} post(s) extraídos`)
                }
            } catch (err) {
                acc.errors.push(`${kind}: ${err.message}`)
                rlog.exception(err, `${slug}/${kind} failed`)
            }
        },
        failedRequestHandler({ request, log: rlog }, error) {
            const { slug, kind } = request.userData ?? {}
            if (slug) {
                const acc = bySlug.get(slug)
                if (acc) acc.errors.push(`${kind}: falló tras retries — ${error?.message ?? 'unknown'}`)
            }
            rlog.error(`Request falló: ${request.url} — ${error?.message ?? 'unknown'}`)
        },
    })

    await crawler.run(requestList)

    // ─── Push de un item por empresa, con shape A esperado por el backend ───
    let pushed = 0
    for (const slug of slugs) {
        const acc = bySlug.get(slug)
        const profile = acc.profile ?? { slug, name: slug, vanityName: slug, followerCount: 0 }

        // Si no obtuvimos ni profile ni posts, devolvemos un item de error explícito.
        // El backend lo detecta (`item.error` string) y lo surfacea como
        // SCRAPE_PROVIDER_ERROR en vez de "0 datos".
        if (!acc.profile && acc.posts.length === 0) {
            await Actor.pushData({
                error: `No se pudo scrapear LinkedIn/company/${slug}/ — ${acc.errors.join(' | ') || 'sin datos'}`,
                slug,
            })
            continue
        }

        await Actor.pushData({
            // Campos canónicos esperados por normalizeApifyCompany (shape A)
            name:            profile.name,
            companyName:     profile.name,
            vanityName:      profile.vanityName,
            universalName:   profile.vanityName,
            url:             profile.url,
            description:     profile.description,
            industry:        profile.industry,
            companySize:     profile.companySize,
            headquarters:    profile.headquarters,
            founded:         profile.founded,
            websiteUrl:      profile.websiteUrl,
            logoUrl:         profile.logoUrl,
            followerCount:   profile.followerCount,
            followersCount:  profile.followerCount,
            postsCount:      acc.posts.length,
            posts:           acc.posts.map(p => ({
                urn:        p.urn,
                text:       p.text,
                likes:      p.likes,
                comments:   p.comments,
                shares:     p.shares,
                reactionsCount: p.likes,
                commentsCount:  p.comments,
                sharesCount:    p.shares,
                timestamp:  p.timestamp,
                postedAt:   p.timestamp,
                url:        p.url,
                postUrl:    p.url,
                image:      p.imgSrc,
                imageUrl:   p.imgSrc,
            })),
            // Diagnóstico — útil para debugScrapeLinkedin del backend
            scrapeNotes: acc.errors.length > 0 ? acc.errors : undefined,
        })
        pushed++
    }

    log.info(`Listo. ${pushed}/${slugs.length} empresa(s) con datos.`)
} catch (err) {
    log.exception(err, 'Actor falló')
    await Actor.pushData({ error: err.message ?? 'Actor failure' })
    throw err
} finally {
    await Actor.exit()
}
