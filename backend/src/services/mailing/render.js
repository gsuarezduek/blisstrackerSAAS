// Render de campañas de Mailing: bloques → HTML de mail (tablas + estilos inline,
// lo único que Outlook y Gmail respetan) + versión en texto plano.
//
// El contenido NUNCA es HTML que escribe la persona: los bloques son datos
// (títulos, URLs, colores) y el texto rico es el JSON de TipTap, que se convierte
// acá con el mismo schema que el editor. Así no hace falta sanitizar HTML
// arbitrario: lo único que sale es lo que este archivo sabe generar.
//
// El HTML que se congela al lanzar lleva placeholders que se resuelven por
// destinatario en `personalize`:
//   {{nombre}} {{apellido}} {{email}} {{campo.x}}   variables del contacto
//   {{nombre|hola}}                                  con valor por defecto
//   {{__click:N}}  {{__open_url}}  {{__unsub_url}}   tracking y baja (sistema)
// TipTap del lado del servidor (happy-dom, ESM) se carga recién al convertir el
// primer texto: requerirlo arriba lo haría cargar en cada require de la app
// (y Jest no puede parsear happy-dom, lo que rompería todos los tests que
// levantan app.js).
let tiptap = null
function loadTiptap() {
  if (tiptap) return tiptap
  const { generateHTML } = require('@tiptap/html/server')
  const StarterKit = require('@tiptap/starter-kit').default
  const { Color, TextStyle } = require('@tiptap/extension-text-style')
  // Mismo set que frontend/src/components/marketing/mailing/MailTextEditor.jsx.
  // StarterKit v3 ya trae Link y Underline.
  const extensions = [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      codeBlock: false,
      code: false,
      blockquote: false,
      horizontalRule: false,
      link: { openOnClick: false, autolink: true },
    }),
    TextStyle,
    Color,
  ]
  tiptap = { generateHTML, extensions }
  return tiptap
}

const BLOCK_TYPES = ['heading', 'text', 'image', 'button', 'divider', 'spacer']
const MAX_BLOCKS = 60
const DEFAULT_BRAND = '#E67A1F'
const FONT = "Helvetica, Arial, sans-serif"

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function unescHtml(s) {
  return String(s ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/
function safeColor(c, fallback) {
  return typeof c === 'string' && HEX_RE.test(c) ? c : fallback
}

// Solo http(s) y mailto. Un `javascript:` o un `data:` en un mail no tiene
// ningún uso legítimo, y los placeholders de variables sí se permiten adentro
// (ej. https://x.com/?ref={{email}}).
function safeUrl(u, { allowMailto = true } = {}) {
  if (typeof u !== 'string') return null
  const v = u.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return v.slice(0, 2000)
  if (allowMailto && /^mailto:/i.test(v)) return v.slice(0, 500)
  return null
}

function str(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function pickAlign(a) {
  return ['left', 'center', 'right'].includes(a) ? a : 'left'
}

/**
 * Normaliza lo que manda el editor: descarta tipos desconocidos, recorta strings,
 * valida URLs y colores. Lo que no pasa queda afuera en silencio — el editor
 * nunca manda eso, así que solo puede venir de un request armado a mano.
 */
function sanitizeBlocks(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const b of raw.slice(0, MAX_BLOCKS)) {
    if (!b || typeof b !== 'object' || !BLOCK_TYPES.includes(b.type)) continue
    const id = str(b.id, 40) || Math.random().toString(36).slice(2, 10)
    switch (b.type) {
      case 'heading':
        out.push({ id, type: 'heading', text: str(b.text, 300), align: pickAlign(b.align), size: b.size === 'sm' ? 'sm' : 'lg' })
        break
      case 'text':
        out.push({ id, type: 'text', doc: b.doc && typeof b.doc === 'object' && b.doc.type === 'doc' ? b.doc : { type: 'doc', content: [] } })
        break
      case 'image':
        out.push({
          id, type: 'image',
          url:   safeUrl(b.url, { allowMailto: false }) || '',
          alt:   str(b.alt, 200),
          href:  safeUrl(b.href) || '',
          width: Math.min(100, Math.max(20, Number(b.width) || 100)),
          align: pickAlign(b.align || 'center'),
        })
        break
      case 'button':
        out.push({
          id, type: 'button',
          label: str(b.label, 80) || 'Ver más',
          href:  safeUrl(b.href) || '',
          color: safeColor(b.color, null),
          align: pickAlign(b.align || 'center'),
        })
        break
      case 'divider':
        out.push({ id, type: 'divider' })
        break
      case 'spacer':
        out.push({ id, type: 'spacer', height: Math.min(80, Math.max(8, Number(b.height) || 24)) })
        break
    }
  }
  return out
}

// TipTap genera HTML semántico sin estilos; los clientes de mail ignoran casi
// todo CSS que no sea inline, así que se los agregamos acá.
function styleTextHtml(html, brand) {
  return html
    // El serializer del lado del servidor (happy-dom) agrega xmlns al primer nivel.
    .replace(/ xmlns="[^"]*"/g, '')
    .replace(/<p>/g, `<p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:#1f2937">`)
    .replace(/<p style="text-align: ?(\w+);?">/g, (_, a) => `<p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:#1f2937;text-align:${pickAlign(a)}">`)
    .replace(/<h2>/g, `<h2 style="margin:0 0 12px;font-family:${FONT};font-size:22px;line-height:1.3;color:#111827">`)
    .replace(/<h3>/g, `<h3 style="margin:0 0 10px;font-family:${FONT};font-size:18px;line-height:1.3;color:#111827">`)
    .replace(/<ul>/g, `<ul style="margin:0 0 14px;padding-left:22px;font-family:${FONT};font-size:16px;line-height:1.55;color:#1f2937">`)
    .replace(/<ol>/g, `<ol style="margin:0 0 14px;padding-left:22px;font-family:${FONT};font-size:16px;line-height:1.55;color:#1f2937">`)
    .replace(/<li><p style="[^"]*">/g, '<li><p style="margin:0 0 4px">')
    // Links: color de marca + sacamos target/rel (en un mail no aplican) y
    // cualquier href que no sea http(s)/mailto se neutraliza.
    .replace(/<a ([^>]*?)href="([^"]*)"([^>]*)>/g, (_, pre, href, post) => {
      const ok = safeUrl(unescHtml(href))
      return `<a href="${ok ? escHtml(ok) : '#'}" style="color:${brand};text-decoration:underline">`
    })
}

function textDocToHtml(doc, brand) {
  if (!doc?.content?.length) return ''
  try {
    const { generateHTML, extensions } = loadTiptap()
    return styleTextHtml(generateHTML(doc, extensions), brand)
  } catch {
    return ''
  }
}

function textDocToPlain(node) {
  if (!node) return ''
  if (node.type === 'text') return node.text || ''
  const inner = (node.content || []).map(textDocToPlain).join('')
  if (node.type === 'paragraph' || node.type === 'heading') return inner + '\n\n'
  if (node.type === 'listItem') return '- ' + inner.trim() + '\n'
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'bulletList' || node.type === 'orderedList') return inner + '\n'
  return inner
}

function row(inner, padding = '0 32px') {
  return `<tr><td style="padding:${padding}">${inner}</td></tr>`
}

function renderBlock(b, brand) {
  switch (b.type) {
    case 'heading': {
      const size = b.size === 'sm' ? 20 : 26
      return row(`<h1 style="margin:0 0 14px;font-family:${FONT};font-size:${size}px;line-height:1.25;color:#111827;text-align:${b.align}">${escHtml(b.text)}</h1>`)
    }
    case 'text':
      return row(textDocToHtml(b.doc, brand))
    case 'image': {
      if (!b.url) return ''
      const w = Math.round(536 * (b.width / 100))
      let img = `<img src="${escHtml(b.url)}" alt="${escHtml(b.alt)}" width="${w}" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;${b.align === 'center' ? 'margin:0 auto;' : b.align === 'right' ? 'margin-left:auto;' : ''}">`
      if (b.href) img = `<a href="${escHtml(b.href)}" style="text-decoration:none">${img}</a>`
      return row(`<div style="margin:0 0 16px;text-align:${b.align}">${img}</div>`)
    }
    case 'button': {
      if (!b.href) return ''
      const color = b.color || brand
      return row(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${b.align}" style="margin:4px ${b.align === 'center' ? 'auto' : '0'} 18px">` +
        `<tr><td style="border-radius:6px;background:${color}">` +
        `<a href="${escHtml(b.href)}" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px">${escHtml(b.label)}</a>` +
        `</td></tr></table>`,
      )
    }
    case 'divider':
      return row('<div style="border-top:1px solid #e5e7eb;margin:8px 0 22px;font-size:0;line-height:0">&nbsp;</div>')
    case 'spacer':
      return row(`<div style="height:${b.height}px;font-size:0;line-height:0">&nbsp;</div>`)
    default:
      return ''
  }
}

/**
 * Arma el mail completo a partir de los bloques. Los links quedan tal cual (el
 * tracking se aplica después, en `prepareTracking`) y el pie con dirección + baja
 * se agrega siempre: no hay forma de sacarlo desde el editor.
 */
function renderCampaignHtml({ subject, preheader, blocks, brandColor, senderName, postalAddress }) {
  const brand = safeColor(brandColor, DEFAULT_BRAND)
  const body = sanitizeBlocks(blocks).map(b => renderBlock(b, brand)).join('')
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escHtml(preheader)}${'&nbsp;&zwnj;'.repeat(40)}</div>`
    : ''
  const footer =
    `<p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.5;color:#6b7280">` +
    `${escHtml(senderName || '')}${postalAddress ? ' · ' + escHtml(postalAddress) : ''}</p>` +
    `<p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:#6b7280">` +
    `Recibís este mail porque estás suscripto/a a nuestras novedades. ` +
    `<a href="{{__unsub_url}}" style="color:#6b7280;text-decoration:underline">Darme de baja</a></p>`

  return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${escHtml(subject || '')}</title></head>` +
    '<body style="margin:0;padding:0;background:#f3f4f6">' + pre +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6">' +
    '<tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:10px">' +
    '<tr><td style="height:28px;font-size:0;line-height:0">&nbsp;</td></tr>' +
    body +
    '<tr><td style="height:14px;font-size:0;line-height:0">&nbsp;</td></tr>' +
    '</table>' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">' +
    `<tr><td style="padding:18px 32px;text-align:center">${footer}</td></tr>` +
    '</table>' +
    '<img src="{{__open_url}}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">' +
    '</td></tr></table></body></html>'
}

function renderCampaignText({ blocks, senderName, postalAddress }) {
  const parts = []
  for (const b of sanitizeBlocks(blocks)) {
    if (b.type === 'heading' && b.text) parts.push(b.text + '\n\n')
    else if (b.type === 'text') parts.push(textDocToPlain(b.doc))
    else if (b.type === 'button' && b.href) parts.push(`${b.label}: ${b.href}\n\n`)
    else if (b.type === 'image' && b.alt) parts.push(`[${b.alt}]\n\n`)
    else if (b.type === 'divider') parts.push('---\n\n')
  }
  parts.push(`--\n${senderName || ''}${postalAddress ? ' · ' + postalAddress : ''}\nDarme de baja: {{__unsub_url}}\n`)
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/**
 * Numera los links http(s) del HTML y los reemplaza por `{{__click:N}}`. Devuelve
 * la lista de URLs (el índice es la posición) para guardarla en MailingLink: el
 * redirect público toma la URL de ahí, nunca del request.
 *
 * No se trackean los mailto ni los links con variables adentro — una URL por
 * destinatario no se puede guardar como una sola fila, y redirigir a una URL
 * armada con datos del request sería justamente un open redirect.
 */
function prepareTracking(html) {
  const links = []
  const index = new Map()
  const out = html.replace(/href="([^"]*)"/g, (m, raw) => {
    const url = unescHtml(raw)
    if (!/^https?:\/\//i.test(url) || url.includes('{{')) return m
    if (!index.has(url)) { index.set(url, links.length); links.push(url) }
    return `href="{{__click:${index.get(url)}}}"`
  })
  return { html: out, links }
}

const VAR_RE = /\{\{\s*([\w.:]+)(?:\|([^}]*))?\s*\}\}/g

/**
 * Resuelve los placeholders para un destinatario. En modo HTML los valores del
 * contacto se escapan (vienen de un CSV o de un formulario público); el valor por
 * defecto ya está escapado porque salió del HTML generado.
 */
function personalize(template, { contact = {}, system = {} }, { html = true } = {}) {
  if (!template) return ''
  return template.replace(VAR_RE, (_, key, def) => {
    if (key.startsWith('__')) {
      if (key.startsWith('__click:')) {
        const fn = system.click
        return fn ? fn(Number(key.slice(8))) : '#'
      }
      const v = system[key.slice(2)]
      return v != null ? (html ? escHtml(v) : String(v)) : ''
    }
    let value
    if (key === 'nombre') value = contact.firstName
    else if (key === 'apellido') value = contact.lastName
    else if (key === 'email') value = contact.email
    else if (key.startsWith('campo.')) value = contact.fields?.[key.slice(6)]
    if (value == null || String(value).trim() === '') {
      const d = (def ?? '').trim()
      return html ? d : unescHtml(d)
    }
    return html ? escHtml(value) : String(value)
  })
}

module.exports = {
  BLOCK_TYPES,
  sanitizeBlocks,
  renderCampaignHtml,
  renderCampaignText,
  prepareTracking,
  personalize,
  escHtml,
  safeUrl,
}
