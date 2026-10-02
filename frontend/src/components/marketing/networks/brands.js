// Identidad visual de cada fuente de Marketing: color de acento (líneas, barras,
// spinners) y fondo del "sello" de la red (cuadrado/círculo con el logo).
// `network` = clave de SocialIcon; las de anuncios usan un emoji como glyph.
export const BRANDS = {
  instagram: {
    label: 'Instagram', network: 'instagram', color: '#a855f7',
    mark: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
    bar:  'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)',
    integrationType: 'instagram',
  },
  tiktok: {
    label: 'TikTok', network: 'tiktok', color: '#69C9D0',
    mark: 'linear-gradient(135deg, #000 50%, #69C9D0 100%)',
    bar:  'linear-gradient(90deg, #000 0%, #69C9D0 100%)',
    integrationType: 'tiktok',
  },
  linkedin: {
    label: 'LinkedIn', network: 'linkedin', color: '#0A66C2',
    mark: '#0A66C2', bar: '#0A66C2', square: true,
    integrationType: 'linkedin',
  },
  facebook: {
    label: 'Facebook', network: 'facebook', color: '#1877F2',
    mark: '#1877F2', bar: '#1877F2', square: true,
    integrationType: 'facebook',
  },
  youtube: {
    label: 'YouTube', network: 'youtube', color: '#FF0000',
    mark: '#FF0000', bar: 'linear-gradient(90deg, #c00 0%, #FF0000 100%)',
    integrationType: 'google_youtube',
  },
  meta_ads: {
    label: 'Meta Ads', glyph: '📘', color: '#1877F2',
    mark: 'linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)', square: true,
    integrationType: 'meta_ads',
  },
  google_ads: {
    label: 'Google Ads', glyph: '🔍', color: '#4285F4',
    mark: '#ffffff', markBorder: true, square: true,
    integrationType: 'google_ads',
  },
}
