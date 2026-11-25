import { SITE_URL, siteUrl } from './urls'

export const SITE_NAME = 'BlissTracker'
export const OG_IMAGE  = siteUrl('/og-image.png')

/**
 * Metadata de una página pública. Centraliza lo que antes estaba repetido en cada
 * <Helmet> de la SPA — y, sobre todo, lo que NO estaba: el canonical propio.
 * En la SPA el canonical de index.html apuntaba a la home en TODAS las rutas.
 *
 *   path        ruta sin dominio ('/pricing'); define el canonical absoluto.
 *   description 150–160 caracteres. `tests/metadata.test.js` lo verifica para
 *               todas las páginas: Google corta alrededor de los 160 y una
 *               description de más no se lee completa en el resultado.
 */
export function buildMetadata({ title, description, path = '/', image = OG_IMAGE, type = 'website', robots }) {
  const url = siteUrl(path)
  return {
    title,
    description,
    alternates: { canonical: url },
    ...(robots ? { robots } : {}),
    openGraph: {
      type,
      siteName: SITE_NAME,
      title,
      description,
      url,
      images: [{ url: image, width: 1200, height: 630 }],
      locale: 'es_AR',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

// ─── JSON-LD ──────────────────────────────────────────────────────────────────
// Se inyectan con <script type="application/ld+json"> en el server, así viajan en
// el HTML inicial (en la SPA sólo aparecían después de que corría React).

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: siteUrl('/logo-512.png'),
    description: 'Sistema de gestión para agencias de marketing: tareas con foco, EOS/Traction, CRM y marketing (GEO/SEO/Ads) en un solo lugar.',
    sameAs: [],
  }
}

export function softwareApplicationSchema({ freeSeatLimit, pricePerSeat, trialDays } = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: 'Gestión de equipo, marketing y reportes para clientes en un solo sistema, pensado para agencias.',
    offers: {
      '@type': 'Offer',
      price: String(pricePerSeat ?? 3),
      priceCurrency: 'USD',
      description: freeSeatLimit
        ? `Gratis hasta ${freeSeatLimit} usuarios. Prueba de ${trialDays ?? 14} días sin tarjeta.`
        : undefined,
    },
  }
}

export function blogPostingSchema(post, { url, image }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.metaDescription || post.excerpt || undefined,
    image: image ? [image] : undefined,
    datePublished: post.publishedAt || undefined,
    dateModified: post.updatedAt || post.publishedAt || undefined,
    author: { '@type': 'Organization', name: post.authorName || `Equipo ${SITE_NAME}` },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: siteUrl('/logo-512.png') },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }
}

/** `items`: [{ name, path }] — el último es la página actual. */
export function breadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: siteUrl(item.path),
    })),
  }
}
