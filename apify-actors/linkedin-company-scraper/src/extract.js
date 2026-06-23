// Extracción de datos de Company Pages de LinkedIn (sin login).
//
// Estrategia: privilegiar campos estables (meta tags, JSON-LD, label-value pairs
// con selectores quirúrgicos) sobre selectors amplios. LinkedIn cambia el HTML
// cada 3-6 meses pero los <dt>/<dd> del bloque About y los meta tags son
// relativamente estables.

// ─────────────────────────────────────────────────────────────────────────────
// Helpers numéricos / temporales
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
function relativeToIso(rel, now = Date.now()) {
    if (!rel) return null
    const s = String(rel).trim().toLowerCase()
    const m = s.match(/^(\d+)\s*(s|sec|min|m|h|hr|hour|d|day|w|wk|week|mo|mon|month|y|yr|year)s?\b/)
    if (!m) return null
    const n = parseInt(m[1], 10)
    const u = m[2]
    const ms = {
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

// Activity URN → ISO timestamp aproximado (los primeros 41 bits del ID son ms epoch).
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

// Normaliza whitespace y limpia un texto: "Industry\n      Beverages" → "Beverages"
// Útil cuando el label viene pegado al valor en el mismo nodo (sin <dd> hijo).
function cleanText(s, stripLabel = null) {
    if (!s) return null
    let t = String(s).replace(/\s+/g, ' ').trim()
    if (stripLabel) {
        const re = new RegExp(`^\\s*${stripLabel}\\s*[:\\-]?\\s*`, 'i')
        t = t.replace(re, '').trim()
    }
    return t || null
}

// ─────────────────────────────────────────────────────────────────────────────
// Página de overview: extrae profile + posts visibles (sin visitar /posts/).
// ─────────────────────────────────────────────────────────────────────────────

async function extractCompanyProfile(page, slug) {
    // 1. Meta tags (siempre disponibles, hasta detrás del modal de login)
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

    // 2. JSON-LD (LinkedIn lo embebe en algunas vistas)
    const jsonLd = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        const items = []
        for (const s of scripts) {
            try { items.push(JSON.parse(s.textContent || '{}')) }
            catch { /* ignorar */ }
        }
        return items
    })

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

    // 3. DOM scraping — extractor robusto de label/value pairs
    const dom = await page.evaluate(() => {
        // ── 3a. Label-value pairs del bloque "About"/"Overview" ────────────
        //
        // LinkedIn estructura los detalles con varios patrones según el render:
        //   (i)  <dt>Industry</dt><dd>Beverages</dd>
        //   (ii) <h3>Industry</h3><p>Beverages</p>  (envuelto en <div>)
        //   (iii) <div class="...">Industry</div><div class="...">Beverages</div>
        //
        // Bug que tuvimos en v1: usar selector amplio `dt, h3, h4, div, p, span`
        // matcheaba elementos PADRE cuyo textContent incluía el label, y devolvía
        // el siguiente PADRE (siguiente sección entera) en vez del valor. Fix:
        // (a) sólo dt/h3/h4 (no div/span), (b) restringir a textContent corto
        // (label puro, no padre concatenado), (c) match EXACTO contra el label.
        const fields = {}
        const candidates = Array.from(document.querySelectorAll('dt, h3, h4'))
        for (const el of candidates) {
            const rawLabel = (el.textContent || '').replace(/\s+/g, ' ').trim()
            if (!rawLabel || rawLabel.length > 30) continue   // Demasiado largo = es un padre
            const label = rawLabel.toLowerCase()
            // El value es el siguiente sibling (dt→dd típicamente, o h3→p/div)
            const next = el.nextElementSibling
            if (!next) continue
            // Skip si el sibling también es un header (no es un valor)
            if (/^(h[1-6]|dt)$/i.test(next.tagName)) continue
            const value = (next.textContent || '').replace(/\s+/g, ' ').trim()
            // Filtrar valores ruidosos: vacíos, sólo whitespace, demasiado largos (probablemente texto irrelevante)
            if (!value || value.length > 300) continue
            // Si ya tenemos un value para este label (otro candidato), nos quedamos con el más corto (suele ser el valor real, no un padre con extra)
            if (!fields[label] || value.length < fields[label].length) fields[label] = value
        }

        const findVal = (keys) => {
            for (const k of keys) {
                if (fields[k]) return fields[k]
            }
            return null
        }

        // Soportar labels en español, inglés y francés
        const industry     = findVal(['industry', 'industria', 'industrie', 'sector'])
        const companySize  = findVal(['company size', 'tamaño de la empresa', 'tamano de la empresa', "taille de l'entreprise", 'size'])
        const headquarters = findVal(['headquarters', 'sede', 'siège', 'sede principal'])
        const founded      = findVal(['founded', 'fundada', 'fondée', 'fundación', 'year founded'])
        const type         = findVal(['type', 'tipo'])
        const specialties  = findVal(['specialties', 'especialidades', 'spécialités'])

        // Website: link saliente con tracking de "website"
        const websiteLink  = document.querySelector('a[data-tracking-control-name*="website" i], a.org-about-us-company-module__website, dd a[href*="redir/redirect"]')
        const websiteUrl   = websiteLink?.getAttribute('href') ?? null

        // ── 3b. Followers ───────────────────────────────────────────────────
        // Aparece en el header como "1.234 followers" / "1,234 seguidores".
        // Buscamos el primer nodo "small" que matchee, no nodos padre concatenados.
        let followersText = null
        const followerCandidates = Array.from(document.querySelectorAll('h3, p, span, a, div, dd'))
            .filter(el => {
                const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
                return t.length < 80 && /^[\d.,KkMm]+\s*(followers?|seguidores?|abonn[ée]s?)\b/i.test(t)
            })
        if (followerCandidates.length > 0) {
            // El primero suele ser el del header (más cerca del top)
            followersText = followerCandidates[0].textContent.replace(/\s+/g, ' ').trim()
        } else {
            // Fallback: buscar en todo el header con regex acotado a inicio de número
            const header = document.querySelector('section.top-card-layout, section[class*="top-card"], main') || document.body
            const m = (header.textContent || '').match(/([\d.,]+[KkMm]?)\s*(followers?|seguidores?|abonn[ée]s?)/i)
            if (m) followersText = m[0]
        }

        // ── 3c. About / descripción ─────────────────────────────────────────
        const aboutEl = document.querySelector(
            'section.about-us p, ' +
            'section[data-test-id="about-us"] p, ' +
            'div[data-test-id="about-us__description"], ' +
            'p[data-test-id="about-us__description"], ' +
            'section.org-about-module p'
        )
        const aboutText = aboutEl ? (aboutEl.textContent || '').replace(/\s+/g, ' ').trim() : null

        // ── 3d. Logo ─────────────────────────────────────────────────────────
        const logoImg = document.querySelector(
            'img.org-top-card-primary-content__logo, ' +
            'img[data-delayed-url*="company-logo"], ' +
            'section img[alt*="logo" i], ' +
            'img.top-card-layout__icon'
        )
        const logoSrc = logoImg?.getAttribute('src') || logoImg?.getAttribute('data-delayed-url') || null

        // ── 3e. Posts visibles en el overview ───────────────────────────────
        // Sin login, LinkedIn muestra 2-3 posts "destacados" en el overview.
        // Capturamos lo que esté visible — el actor configura postsLimit pero
        // sin login no podemos pasar de los que LinkedIn renderiza por default.
        const postCards = Array.from(document.querySelectorAll(
            'li[data-urn^="urn:li:activity:"], ' +
            'article[data-urn^="urn:li:activity:"], ' +
            'div[data-urn^="urn:li:activity:"], ' +
            'div.feed-shared-update-v2[data-urn], ' +
            'li.profile-creator-shared-feed-update__container, ' +
            'article.main-feed-card'
        ))

        const seenUrns = new Set()
        const posts = []
        for (const card of postCards) {
            const urn = card.getAttribute('data-urn')
                || card.closest('[data-urn]')?.getAttribute('data-urn')
                || card.querySelector('[data-urn]')?.getAttribute('data-urn')
                || null
            if (urn && seenUrns.has(urn)) continue
            if (urn) seenUrns.add(urn)

            const textEl = card.querySelector(
                '.feed-shared-update-v2__description, ' +
                '.update-components-text, ' +
                '.attributed-text-segment-list__content, ' +
                'p.attributed-text-segment-list__content, ' +
                '[data-test-id="main-feed-activity-card__commentary"], ' +
                '.entity-result__primary-subtitle'
            )
            const text = textEl?.textContent?.trim() ?? ''

            // Reacciones / likes
            const reactEl = card.querySelector(
                '[data-test-id*="reactions"], ' +
                'button[aria-label*="reaction" i], ' +
                'button[data-tracking-control-name*="reactions"], ' +
                '.social-details-social-counts__reactions-count, ' +
                'span[data-test-id="social-actions__reaction-count"]'
            )
            const reactText = reactEl?.textContent?.trim() ?? reactEl?.getAttribute('aria-label') ?? ''

            // Comments
            const commEl = card.querySelector(
                '[data-test-id*="comments"], ' +
                'button[aria-label*="comment" i], ' +
                '.social-details-social-counts__comments, ' +
                'span[data-test-id="social-actions__comments-count"], ' +
                'a[data-test-id*="comments"]'
            )
            const commText = commEl?.textContent?.trim() ?? commEl?.getAttribute('aria-label') ?? ''

            // Shares / reposts
            const shareEl = card.querySelector(
                '[data-test-id*="reposts"], ' +
                '[data-test-id*="shares"], ' +
                'button[aria-label*="repost" i], ' +
                'button[aria-label*="share" i], ' +
                'span[data-test-id="social-actions__shares-count"]'
            )
            const shareText = shareEl?.textContent?.trim() ?? shareEl?.getAttribute('aria-label') ?? ''

            // Fecha (relativa o datetime)
            const timeEl = card.querySelector('time, span.update-components-actor__sub-description, [data-test-id*="time"]')
            const timeText = timeEl?.textContent?.trim() ?? null
            const datetime = timeEl?.getAttribute('datetime') ?? null

            // Imagen
            const imgEl = card.querySelector(
                'img.feed-shared-image__image, ' +
                'img.update-components-image__image, ' +
                'div.update-components-image img, ' +
                'figure img'
            )
            const imgSrc = imgEl?.getAttribute('src') ?? imgEl?.getAttribute('data-delayed-url') ?? null

            // URL al post
            const linkEl = card.querySelector('a[href*="/feed/update/"], a[href*="/posts/"], a[data-tracking-control-name*="public_post_feed"]')
            const url    = linkEl?.getAttribute('href') ?? (urn ? `https://www.linkedin.com/feed/update/${urn}/` : null)

            posts.push({ urn, text, reactText, commText, shareText, timeText, datetime, imgSrc, url })
        }

        return {
            fields, industry, companySize, headquarters, founded, type, specialties,
            websiteUrl, followersText, aboutText, logoSrc, posts,
        }
    })

    const followerCount = toCount((dom.followersText || '').match(/[\d.,KkMm]+/)?.[0])

    const profile = {
        slug,
        name:           org?.name        ?? meta.ogTitle?.replace(/\s*\|\s*LinkedIn\s*$/i, '') ?? slug,
        vanityName:     slug,
        url:            org?.url         ?? meta.ogUrl ?? `https://www.linkedin.com/company/${slug}/`,
        description:    dom.aboutText    ?? meta.ogDescription ?? meta.description ?? org?.description ?? null,
        industry:       cleanText(dom.industry,     'industry|industria|industrie|sector') ?? null,
        companySize:    cleanText(dom.companySize,  'company size|tamaño de la empresa|size') ?? null,
        headquarters:   cleanText(dom.headquarters, 'headquarters|sede|siège') ?? null,
        founded:        cleanText(dom.founded,      'founded|fundada|year founded') ?? null,
        companyType:    cleanText(dom.type,         'type|tipo') ?? null,
        specialties:    cleanText(dom.specialties,  'specialties|especialidades') ?? null,
        websiteUrl:     dom.websiteUrl   ?? org?.sameAs?.[0] ?? null,
        logoUrl:        meta.ogImage     ?? dom.logoSrc ?? org?.logo ?? null,
        followerCount,
    }

    const posts = (dom.posts || []).map(p => ({
        urn:       p.urn,
        text:      (p.text || '').replace(/\s+/g, ' ').trim().slice(0, 1000),
        likes:     toCount((p.reactText.match(/[\d.,KkMm]+/) || [])[0]),
        comments:  toCount((p.commText.match(/[\d.,KkMm]+/)  || [])[0]),
        shares:    toCount((p.shareText.match(/[\d.,KkMm]+/) || [])[0]),
        timestamp: p.datetime ?? urnToTimestamp(p.urn) ?? relativeToIso(p.timeText),
        url:       p.url ? (p.url.startsWith('http') ? p.url : `https://www.linkedin.com${p.url}`) : null,
        imgSrc:    p.imgSrc,
    }))

    return { profile, posts }
}

export { extractCompanyProfile, toCount, urnToTimestamp, relativeToIso, cleanText }
