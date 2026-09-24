// Documento estructurado de una propuesta comercial (Proposal.doc).
//
// La IA NO devuelve HTML: devuelve una lista de bloques tipados que un único renderer
// (frontend/src/components/ventas/proposalDocHtml.js) dibuja igual en la vista previa, el
// link público y el PDF. Este módulo define el catálogo de bloques y normaliza cualquier
// JSON entrante (de la IA o del editor) a un shape seguro y acotado: tipos desconocidos
// se descartan, los strings se recortan y los arrays se topean.
//
// Bloques (todos con `heading` opcional = título de sección):
//   text          { subheading?, paragraphs[] }
//   callout       { label?, text }
//   before_after  { fromLabel, from, toLabel, to, note? }
//   cards         { subheading?, intro?, variant: plain|funnel, columns 2-4, items[{ tag?, title, text }], outro? }
//   bars          { intro?, items[{ label, value 0-100 }], outro? }
//   pills         { subheading?, intro?, items[] }
//   steps         { intro?, variant: timeline|numbered, items[{ title, text }], outro? }
//   services      { intro?, items[{ name, intro?, bullets[] }] }   ← el badge de planes se calcula desde `plans`
//   pricing       { intro?, note? }                                 ← la tabla sale de `plans`, nunca de la IA
//   closing       { label?, quote, text? }
//
// Texto: soporta **negrita** (el renderer escapa todo lo demás).

const BLOCK_TYPES = ['text', 'callout', 'before_after', 'cards', 'bars', 'pills', 'steps', 'services', 'pricing', 'closing']

const MAX_BLOCKS = 24
const MAX_ITEMS = 12
const MAX_BULLETS = 8

function str(v, max = 600) {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
}

function strList(v, { maxItems = MAX_ITEMS, maxLen = 600 } = {}) {
  if (!Array.isArray(v)) return []
  return v.map(x => str(x, maxLen)).filter(Boolean).slice(0, maxItems)
}

function objList(v, mapItem, maxItems = MAX_ITEMS) {
  if (!Array.isArray(v)) return []
  return v.map(x => (x && typeof x === 'object' ? mapItem(x) : null)).filter(Boolean).slice(0, maxItems)
}

function oneOf(v, allowed, fallback) {
  return allowed.includes(v) ? v : fallback
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

const NORMALIZERS = {
  text: b => ({
    subheading: str(b.subheading, 120),
    paragraphs: strList(b.paragraphs, { maxItems: 8, maxLen: 1500 }),
  }),
  callout: b => ({ label: str(b.label, 80), text: str(b.text, 800) }),
  before_after: b => ({
    fromLabel: str(b.fromLabel, 40) || 'Hoy',
    from: str(b.from, 200),
    toLabel: str(b.toLabel, 40) || 'Hacia dónde vamos',
    to: str(b.to, 200),
    note: str(b.note, 600),
  }),
  cards: b => ({
    subheading: str(b.subheading, 120),
    intro: str(b.intro, 600),
    variant: oneOf(b.variant, ['plain', 'funnel'], 'plain'),
    columns: clampInt(b.columns, 2, 4, 3),
    items: objList(b.items, i => ({ tag: str(i.tag, 24), title: str(i.title, 120), text: str(i.text, 400) })).filter(i => i.title || i.text),
    outro: str(b.outro, 600),
  }),
  bars: b => ({
    intro: str(b.intro, 600),
    items: objList(b.items, i => ({ label: str(i.label, 80), value: clampInt(i.value, 0, 100, 0) })).filter(i => i.label),
    outro: str(b.outro, 600),
  }),
  pills: b => ({
    subheading: str(b.subheading, 120),
    intro: str(b.intro, 600),
    items: strList(b.items, { maxItems: 16, maxLen: 60 }),
  }),
  steps: b => ({
    intro: str(b.intro, 600),
    variant: oneOf(b.variant, ['timeline', 'numbered'], 'numbered'),
    items: objList(b.items, i => ({ title: str(i.title, 120), text: str(i.text, 400) })).filter(i => i.title || i.text),
    outro: str(b.outro, 600),
  }),
  services: b => ({
    intro: str(b.intro, 600),
    items: objList(b.items, i => ({
      name: str(i.name, 120),
      intro: str(i.intro, 600),
      bullets: strList(i.bullets, { maxItems: MAX_BULLETS, maxLen: 300 }),
    })).filter(i => i.name),
  }),
  pricing: b => ({ intro: str(b.intro, 600), note: str(b.note, 800) }),
  closing: b => ({ label: str(b.label, 60), quote: str(b.quote, 300), text: str(b.text, 800) }),
}

function normalizeBlock(raw) {
  if (!raw || typeof raw !== 'object' || !BLOCK_TYPES.includes(raw.type)) return null
  return { type: raw.type, heading: str(raw.heading, 120), ...NORMALIZERS[raw.type](raw) }
}

/**
 * Normaliza un documento de propuesta (de la IA o del editor) a un shape seguro.
 * `ensureRequired`: al GENERAR, garantiza que existan `services` y `pricing` (sin la tabla de
 * precios la propuesta no sirve) y deja `closing` al final. Al EDITAR se pasa false, para no
 * resucitar un bloque que el usuario borró a propósito.
 */
function normalizeDoc(raw, { ensureRequired = false } = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}
  let blocks = (Array.isArray(src.blocks) ? src.blocks : []).map(normalizeBlock).filter(Boolean).slice(0, MAX_BLOCKS)

  if (ensureRequired) {
    if (!blocks.some(b => b.type === 'services')) {
      blocks.push({ type: 'services', heading: 'Propuesta de servicios', ...NORMALIZERS.services({}) })
    }
    if (!blocks.some(b => b.type === 'pricing')) {
      blocks.push({ type: 'pricing', heading: 'Inversión', ...NORMALIZERS.pricing({}) })
    }
    // El cierre siempre al final; los servicios siempre antes de la inversión.
    const closing = blocks.filter(b => b.type === 'closing').slice(0, 1)
    blocks = blocks.filter(b => b.type !== 'closing')
    const iServices = blocks.findIndex(b => b.type === 'services')
    const iPricing = blocks.findIndex(b => b.type === 'pricing')
    if (iServices > iPricing) {
      const [pricing] = blocks.splice(iPricing, 1)
      blocks.splice(blocks.findIndex(b => b.type === 'services') + 1, 0, pricing)
    }
    blocks = [...blocks, ...closing]
  }

  return {
    title: str(src.title, 160),
    subtitle: str(src.subtitle, 200),
    lead: str(src.lead, 800),
    blocks,
  }
}

module.exports = { BLOCK_TYPES, normalizeDoc, normalizeBlock }
