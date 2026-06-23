// Extracción de la lista de "slugs" a scrapear desde el input del actor.
// El backend de BlissTracker pasa input tolerante con muchas claves posibles
// (heredado de runApifyLinkedin en socialScrape.service.js). Aceptamos todas
// y devolvemos un array deduplicado de slugs limpios.

// Acepta string como "miempresa", "@miempresa", "https://www.linkedin.com/company/miempresa/",
// "/company/miempresa/", "linkedin.com/company/miempresa".
function extractSlug(input) {
    if (input == null) return null
    if (typeof input === 'object') {
        if (input.url)   return extractSlug(input.url)
        if (input.slug)  return extractSlug(input.slug)
        if (input.name)  return extractSlug(input.name)
        return null
    }
    const s = String(input).trim()
    if (!s) return null
    const urlMatch = s.match(/linkedin\.com\/(?:company|showcase|school)\/([^/?#]+)/i)
    let slug = urlMatch ? urlMatch[1] : s
    slug = slug.replace(/^@/, '').replace(/[/?#].*$/, '').trim()
    if (!/^[A-Za-z0-9\-._%]{1,120}$/.test(slug)) return null
    return slug.toLowerCase()
}

function collectSlugs(input = {}) {
    const candidates = []

    // Todas las claves que el backend manda (ver runApifyLinkedin en socialScrape.service.js)
    const arrayKeys  = ['identifier', 'companyName', 'company', 'companyUrls', 'urls', 'startUrls', 'slugs']
    const scalarKeys = ['company', 'companyUrl']

    for (const k of arrayKeys) {
        const v = input[k]
        if (Array.isArray(v)) candidates.push(...v)
    }
    for (const k of scalarKeys) {
        const v = input[k]
        if (typeof v === 'string') candidates.push(v)
    }

    const slugs = []
    const seen  = new Set()
    for (const c of candidates) {
        const slug = extractSlug(c)
        if (slug && !seen.has(slug)) {
            seen.add(slug)
            slugs.push(slug)
        }
    }
    return slugs
}

export { collectSlugs, extractSlug }
