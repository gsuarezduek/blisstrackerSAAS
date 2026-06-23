// Extracción de datos de Company Pages de LinkedIn.
// Estrategia: privilegiar campos estables (meta tags, JSON-LD) sobre selectors
// de DOM (que LinkedIn cambia cada 3-6 meses). El DOM sólo se usa para datos
// que no están en metadata (followers, posts).

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toCount(v) {
    if (v == null) return 0
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0
    const s = String(v).trim().replace(/,/g, '').replace(/\s+/g, '')
    const m = s.match(/^([\d.]+)\s*([KkMm])?/)
    if (!m) return 0
    let n = parseFloat(m[1])
    if (!Number.isFinite(n)) return 0
    const suffix = m[2]?.toLowerCase()
    if (suffix === 'k') n *= 1e3
    if (suffix === 'm') n *= 1e6
    return Math.round(n)
}

// Saca un timestamp ISO desde un string "2h", "3d", "1mo", "1w", "1yr" relativo a now.
// LinkedIn muestra esos formatos en posts sin login. Devuelve null si no parsea.
function relativeToIso(rel, now = Date.now()) {
    if (!rel) return null
    const s = String(rel).trim().toLowerCase()
    const m = s.match(/^(\d+)\s*(s|sec|min|m|h|hr|hour|d|day|w|wk|week|mo|mon|month|y|yr|year)s?\b/)
    if (!m) return null
    const n   = parseInt(m[1], 10)
    const u   = m[2]
    const ms  = {
        s: 1e3, sec: 1e3,
        min: 60e3, m: 60e3,
        h: 3600e3, hr: 3600e3, hour: 3600e3,
        d: 86400e3, day: 86400e3,
        w: 7 * 86400e3, wk: 7 * 86400e3, week: 7 * 86400e3,
        mo: 30 * 86400e3, mon: 30 * 86400e3, month: 30 * 86400e3,
        y: 365 * 86400e3, yr: 365 * 86400e3, year: 365 * 86400e3,
    }[u]
    if (!ms) return null
    return new Date(now - n * ms).toISOString()
}

// Convierte el ID de un activity URN ("7012345678") a un timestamp ISO aproximado.
// Los activity URNs de LinkedIn embeden un timestamp en los primeros 41 bits
// (epoch en ms). Es el dato más preciso que tenemos para fechas de posts.
// Ver: https://www.linkedin.com/help/linkedin/answer/a522537
function urnToTimestamp(urn) {
    if (!urn) return null
    const m = String(urn).match(/(\d{19,})$/)
    if (!m) return null
    try {
        const big = BigInt(m[1])
        const epochMs = Number(big >> 22n)
        if (epochMs < 1_000_000_000_000 || epochMs > Date.now() + 86400_000) return null
        return new Date(epochMs).toISOString()
    } catch {
        return null
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Página de overview de la empresa — extrae profile completo
// ─────────────────────────────────────────────────────────────────────────────

async function extractCompanyProfile(page, slug) {
    // 1. Meta tags estables (siempre disponibles, hasta detrás del modal de login)
    const meta = await page.evaluate(() => {
        const get = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null
        return {
            ogTitle:       get('meta[property="og:title"]'),
            ogDescription: get('meta[property="og:description"]'),
            ogImage:       get('meta[property="og:image"]'),
            ogUrl:         get('meta[property="og:url"]'),
            description:   get('meta[name="description"]'),
        }
    })

    // 2. JSON-LD si está presente (LinkedIn lo embebe en algunas vistas)
    const jsonLd = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        const items = []
        for (const s of scripts) {
            try {
                const obj = JSON.parse(s.textContent || '{}')
                items.push(obj)
            } catch { /* ignorar */ }
        }
        return items
    })

    // Buscar un nodo @type=Organization en el JSON-LD
    let org = null
    for (const item of jsonLd) {
        const arr = Array.isArray(item) ? item : (item['@graph'] ? item['@graph'] : [item])
        for (const node of arr) {
            const type = node?.['@type']
            const isOrg = type === 'Organization' || (Array.isArray(type) && type.includes('Organization'))
            if (isOrg) { org = node; break }
        }
        if (org) break
    }

    // 3. DOM scraping para campos que sólo están en HTML
    const dom = await page.evaluate(() => {
        const get = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null

        // Followers: el header muestra "1,234 followers" o "1,234 seguidores"
        // Buscamos cualquier elemento cuyo texto matchee número + followers/seguidores.
        let followersText = null
        const followerNode = Array.from(document.querySelectorAll('h3, p, div, span, a'))
            .find(el => {
                const t = (el.textContent || '').trim()
                return /^[\d.,]+\s*(followers?|seguidores?|abonn[ée]s?|follower)$/i.test(t)
            })
        if (followerNode) followersText = followerNode.textContent.trim()

        // Fallback: buscar "X followers" en todo el texto visible del header
        if (!followersText) {
            const header = document.querySelector('section, header, main') || document.body
            const m = (header.textContent || '').match(/([\d.,]+)\s*(followers?|seguidores?|abonn[ée]s?)/i)
            if (m) followersText = m[0]
        }

        // Industria, tamaño, HQ: viven en una "definition list" del about preview
        // Las claves vienen en distintos idiomas; matcheamos por keyword.
        const lines = Array.from(document.querySelectorAll('dt, h3, h4, div, p, span'))
            .map(el => ({ key: (el.textContent || '').trim().toLowerCase(), next: el.nextElementSibling?.textContent?.trim() ?? null }))
            .filter(x => x.next)

        const findVal = (keywords) => {
            const hit = lines.find(l => keywords.some(k => l.key === k || l.key.startsWith(k)))
            return hit?.next ?? null
        }

        const industry     = findVal(['industry', 'industria', 'industrie', 'sector'])
        const companySize  = findVal(['company size', 'tamaño de la empresa', 'tamano de la empresa', 'taille de l\'entreprise'])
        const headquarters = findVal(['headquarters', 'sede', 'siège', 'sede principal'])
        const founded      = findVal(['founded', 'fundada', 'fondée', 'fundación'])
        const websiteUrl   = document.querySelector('a[data-tracking-control-name="public_jobs_topcard-website"], a[data-tracking-control-name*="website"]')?.getAttribute('href') ?? null

        const aboutText = get('section.about-us p, section[data-test-id="about-us"] p, div[data-test-id="about-us__description"]')

        // Logo: og:image normalmente, pero también lo intenta capturar del DOM
        const logoImg = document.querySelector('img.org-top-card-primary-content__logo, img[data-delayed-url*="company-logo"], section img[alt*="logo" i]')
        const logoSrc = logoImg?.getAttribute('src') || logoImg?.getAttribute('data-delayed-url') || null

        return { followersText, industry, companySize, headquarters, founded, websiteUrl, aboutText, logoSrc }
    })

    const followerCount = toCount((dom.followersText || '').match(/[\d.,KkMm]+/)?.[0])

    return {
        slug,
        name:           org?.name        ?? meta.ogTitle?.replace(/\s*\|\s*LinkedIn\s*$/i, '') ?? slug,
        vanityName:     slug,
        url:            org?.url         ?? meta.ogUrl ?? `https://www.linkedin.com/company/${slug}/`,
        description:    dom.aboutText    ?? meta.ogDescription ?? meta.description ?? org?.description ?? null,
        industry:       dom.industry     ?? null,
        companySize:    dom.companySize  ?? null,
        headquarters:   dom.headquarters ?? null,
        founded:        dom.founded      ?? null,
        websiteUrl:     dom.websiteUrl   ?? org?.sameAs?.[0] ?? null,
        logoUrl:        meta.ogImage     ?? dom.logoSrc ?? org?.logo ?? null,
        followerCount,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Página de posts — extrae los N más recientes con engagement
// ─────────────────────────────────────────────────────────────────────────────

async function extractCompanyPosts(page, slug, maxPosts) {
    // Sin login, LinkedIn muestra los primeros ~5-10 posts. Hacemos un poco de
    // scroll para gatillar lazy-load (si está habilitado para visitantes anónimos).
    try {
        for (let i = 0; i < Math.min(6, Math.ceil(maxPosts / 5)); i++) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5))
            await page.waitForTimeout(800 + Math.random() * 400)
        }
    } catch { /* ignorar — algunos browsers throw si la página se cerró */ }

    const raw = await page.evaluate(() => {
        // Los posts de empresa en /posts/ son <li> o <article> con data-urn.
        // Probamos varios selectors porque LinkedIn los cambia.
        const cards = Array.from(document.querySelectorAll(
            'li[data-urn^="urn:li:activity:"],' +
            'article[data-urn^="urn:li:activity:"],' +
            'div[data-urn^="urn:li:activity:"],' +
            'div.feed-shared-update-v2[data-urn],' +
            'div.update-components-actor__container'
        ))

        const seen = new Set()
        const out = []
        for (const card of cards) {
            const urn = card.getAttribute('data-urn')
                    || card.closest('[data-urn]')?.getAttribute('data-urn')
                    || null
            if (urn && seen.has(urn)) continue
            if (urn) seen.add(urn)

            // Texto del post
            const textEl = card.querySelector(
                '.feed-shared-update-v2__description, ' +
                '.update-components-text, ' +
                '.attributed-text-segment-list__content, ' +
                '[data-test-id="main-feed-activity-card__commentary"]'
            )
            const text = textEl?.textContent?.trim() ?? ''

            // Reacciones — el botón muestra "N likes" / "N reacciones" / "N reactions"
            const reactionsEl = card.querySelector(
                '[data-test-id*="reactions"], ' +
                'button[aria-label*="reaction" i], ' +
                'button[data-tracking-control-name*="reactions"], ' +
                '.social-details-social-counts__reactions-count, ' +
                'span.v-align-middle.social-details-social-counts__reactions-count'
            )
            const reactionsText = reactionsEl?.textContent?.trim() ?? reactionsEl?.getAttribute('aria-label') ?? ''

            // Comentarios
            const commentsEl = card.querySelector(
                '[data-test-id*="comments"], ' +
                'button[aria-label*="comment" i], ' +
                '.social-details-social-counts__comments, ' +
                'li.social-details-social-counts__comments'
            )
            const commentsText = commentsEl?.textContent?.trim() ?? commentsEl?.getAttribute('aria-label') ?? ''

            // Reposts / shares
            const sharesEl = card.querySelector(
                '[data-test-id*="reposts"], ' +
                '[data-test-id*="shares"], ' +
                'button[aria-label*="repost" i], ' +
                'button[aria-label*="share" i], ' +
                '.social-details-social-counts__item--with-social-proof'
            )
            const sharesText = sharesEl?.textContent?.trim() ?? sharesEl?.getAttribute('aria-label') ?? ''

            // Fecha relativa visible (ej. "2d", "3h", "1mo")
            const timeEl = card.querySelector(
                'time, ' +
                'span.update-components-actor__sub-description, ' +
                'a[data-test-id="main-feed-activity-card__entity-lockup"] time, ' +
                'span[data-test-id*="time"]'
            )
            const timeText = timeEl?.textContent?.trim() ?? null
            const datetime = timeEl?.getAttribute('datetime') ?? null

            // Imagen principal del post
            const imgEl = card.querySelector(
                'img.feed-shared-image__image, ' +
                'img.update-components-image__image, ' +
                'div.update-components-image img, ' +
                'figure img'
            )
            const imgSrc = imgEl?.getAttribute('src') ?? imgEl?.getAttribute('data-delayed-url') ?? null

            // URL al post
            const linkEl = card.querySelector('a[href*="/feed/update/"], a[href*="/posts/"]')
            const url    = linkEl?.getAttribute('href') ?? (urn ? `https://www.linkedin.com/feed/update/${urn}/` : null)

            out.push({ urn, text, reactionsText, commentsText, sharesText, timeText, datetime, imgSrc, url })
        }
        return out
    })

    return raw.slice(0, maxPosts).map(p => ({
        urn:       p.urn,
        text:      (p.text || '').replace(/\s+/g, ' ').trim().slice(0, 1000),
        likes:     toCount((p.reactionsText.match(/[\d.,KkMm]+/) || [])[0]),
        comments:  toCount((p.commentsText.match(/[\d.,KkMm]+/)  || [])[0]),
        shares:    toCount((p.sharesText.match(/[\d.,KkMm]+/)    || [])[0]),
        // Prioridad de fecha: datetime exacto del DOM > timestamp embebido en el URN > parseo del label relativo
        timestamp: p.datetime ?? urnToTimestamp(p.urn) ?? relativeToIso(p.timeText),
        url:       p.url ? (p.url.startsWith('http') ? p.url : `https://www.linkedin.com${p.url}`) : null,
        imgSrc:    p.imgSrc,
    }))
}

export { extractCompanyProfile, extractCompanyPosts, toCount, urnToTimestamp, relativeToIso }
