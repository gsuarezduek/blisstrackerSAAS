// Renderer ÚNICO del documento estructurado de una propuesta (Proposal.doc).
// Devuelve un string HTML (+ CSS scopeado a `.pd`) que consumen tres lugares idénticos:
//   - vista previa en ProposalModal      (ProposalDocView.jsx)
//   - link público del cliente           (ProposalPublic.jsx)
//   - PDF (window.print)                 (proposalPdf.js)
// Como genera string, el mismo código corre en la ventana de impresión sin React.
//
// Seguridad: TODO texto pasa por esc() antes de entrar al HTML; la única sintaxis que se
// interpreta es **negrita**. El doc puede venir de la IA o del editor, así que nunca se
// confía en él (los colores/números se derivan acá, no se toman del doc).

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, c => ESC[c])
const rich = (s = '') => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')

// ── Color helpers (el color de marca es libre: derivamos tintes y contraste) ────────────
function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
const mix = (a, b, pct) => a.map((v, i) => v + (b[i] - v) * (pct / 100))
function luminance([r, g, b]) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const onColor = rgb => (luminance(rgb) > 0.5 ? '#111827' : '#ffffff')

const DARK = [31, 41, 55] // #1f2937
const WHITE = [255, 255, 255]

function palette(accentHex) {
  const accent = parseHex(accentHex) || [247, 147, 26]
  return {
    accent: toHex(accent),
    onAccent: onColor(accent),
    tint: toHex(mix(accent, WHITE, 92)),
    tint2: toHex(mix(accent, WHITE, 82)),
    dark: toHex(DARK),
    // Tarjetas "funnel": del color de marca hacia el oscuro.
    funnel: n => Array.from({ length: n }, (_, i) => {
      const rgb = mix(accent, DARK, n <= 1 ? 0 : Math.round((i / (n - 1)) * 92))
      return { bg: toHex(rgb), fg: onColor(rgb) }
    }),
  }
}

export const PROPOSAL_DOC_CSS = `
.pd { --accent: #F7931A; --on-accent: #fff; --tint: #fef4e6; --tint2: #fde6c6; --dark: #1f2937;
  font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #374151; font-size: 14px; line-height: 1.65;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pd *, .pd *::before, .pd *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pd p { margin: 0 0 10px; }
.pd strong { color: #111827; }
.pd .pd-title { font-size: 30px; line-height: 1.15; font-weight: 800; color: #111827; margin: 0 0 6px; letter-spacing: -0.02em; }
.pd .pd-subtitle { font-size: 17px; font-weight: 700; color: var(--accent); margin: 0 0 10px; }
.pd .pd-lead { font-size: 15px; color: #4b5563; max-width: 640px; margin: 0 0 8px; }
.pd .pd-block { margin-top: 26px; }
.pd .pd-h2 { font-size: 19px; font-weight: 700; color: #111827; margin: 0 0 12px; padding-left: 12px; border-left: 5px solid var(--accent); line-height: 1.3; break-after: avoid; page-break-after: avoid; }
.pd .pd-h3 { font-size: 14px; font-weight: 700; color: #374151; margin: 0 0 8px; break-after: avoid; page-break-after: avoid; }
.pd .pd-avoid { break-inside: avoid; page-break-inside: avoid; }
.pd .pd-muted { color: #6b7280; }

.pd .pd-callout { background: var(--tint); border-left: 4px solid var(--accent); border-radius: 0 10px 10px 0; padding: 14px 18px; margin: 0 0 12px; break-inside: avoid; page-break-inside: avoid; }
.pd .pd-callout p:last-child { margin: 0; }

.pd .pd-ba { display: grid; grid-template-columns: 1fr auto 1fr; gap: 14px; align-items: center; margin: 0 0 12px; break-inside: avoid; page-break-inside: avoid; }
.pd .pd-ba-box { border-radius: 12px; padding: 16px 20px; }
.pd .pd-ba-from { background: #f3f4f6; color: #6b7280; }
.pd .pd-ba-from .pd-ba-text { text-decoration: line-through; }
.pd .pd-ba-to { background: var(--accent); color: var(--on-accent); }
.pd .pd-ba-label { font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.85; margin-bottom: 4px; }
.pd .pd-ba-text { font-size: 17px; font-weight: 700; line-height: 1.3; }
.pd .pd-ba-arrow { font-size: 22px; color: var(--accent); font-weight: 700; }

.pd .pd-grid { display: grid; gap: 12px; margin: 0 0 12px; }
.pd .pd-card { background: #fff; border: 1px solid #e5e7eb; border-top: 3px solid var(--accent); border-radius: 10px; padding: 14px 16px; break-inside: avoid; page-break-inside: avoid; }
.pd .pd-card-tag { font-size: 11px; font-weight: 700; color: var(--accent); margin-bottom: 2px; }
.pd .pd-card-title { font-size: 14.5px; font-weight: 700; color: #111827; margin-bottom: 4px; line-height: 1.3; }
.pd .pd-card-text { font-size: 12.5px; color: #4b5563; line-height: 1.55; }
.pd .pd-card-funnel { border: 0; border-radius: 10px; }
.pd .pd-card-funnel .pd-card-tag, .pd .pd-card-funnel .pd-card-title, .pd .pd-card-funnel .pd-card-text { color: inherit; }
.pd .pd-card-funnel .pd-card-text { opacity: 0.9; }

.pd .pd-bars { margin: 0 0 12px; }
.pd .pd-bar { display: grid; grid-template-columns: 170px 1fr 44px; gap: 12px; align-items: center; margin-bottom: 8px; break-inside: avoid; page-break-inside: avoid; }
.pd .pd-bar-label { font-size: 13px; color: #374151; }
.pd .pd-bar-track { background: #f3f4f6; border-radius: 99px; height: 10px; overflow: hidden; }
.pd .pd-bar-fill { background: var(--accent); height: 100%; border-radius: 99px; }
.pd .pd-bar-val { font-size: 13px; font-weight: 700; color: #111827; text-align: right; }

.pd .pd-pills { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
.pd .pd-pill { border: 1.5px solid var(--accent); color: var(--accent); background: #fff; font-weight: 600; font-size: 12.5px; border-radius: 99px; padding: 4px 13px; }

.pd .pd-timeline { display: grid; gap: 10px; margin: 0 0 12px; }
.pd .pd-tl-item { background: #f9fafb; border-radius: 10px; padding: 12px 14px; break-inside: avoid; page-break-inside: avoid; }
.pd .pd-tl-n { width: 22px; height: 22px; border-radius: 99px; background: var(--accent); color: var(--on-accent); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 6px; }
.pd .pd-tl-title { font-size: 13.5px; font-weight: 700; color: #111827; margin-bottom: 2px; }
.pd .pd-tl-text { font-size: 12px; color: #4b5563; line-height: 1.5; }

.pd .pd-steps { list-style: none; margin: 0 0 12px; padding: 0; }
.pd .pd-step { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 10px; break-inside: avoid; page-break-inside: avoid; }
.pd .pd-step-n { flex: none; width: 24px; height: 24px; border-radius: 99px; background: var(--accent); color: var(--on-accent); font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; margin-top: 1px; }

.pd .pd-service { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; break-inside: avoid; page-break-inside: avoid; }
.pd .pd-service-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.pd .pd-service-name { font-size: 15.5px; font-weight: 700; color: #111827; }
.pd .pd-badge { flex: none; background: var(--tint); color: var(--accent); font-size: 11px; font-weight: 700; border-radius: 99px; padding: 3px 11px; }
.pd .pd-bullets { list-style: none; margin: 8px 0 0; padding: 0; }
.pd .pd-bullets li { position: relative; padding-left: 16px; margin-bottom: 5px; font-size: 13.5px; }
.pd .pd-bullets li::before { content: ""; position: absolute; left: 2px; top: 0.6em; width: 6px; height: 6px; border-radius: 99px; background: var(--accent); }

.pd .pd-table { width: 100%; border-collapse: collapse; margin: 4px 0 12px; font-size: 13.5px; break-inside: avoid; page-break-inside: avoid; }
.pd .pd-table th, .pd .pd-table td { padding: 11px 14px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: middle; }
.pd .pd-table thead th { background: var(--dark); color: #fff; font-weight: 700; }
.pd .pd-table thead th.pd-hl { background: var(--accent); color: var(--on-accent); }
.pd .pd-table td.pd-yes { color: var(--accent); font-weight: 700; }
.pd .pd-table td.pd-no { color: #9ca3af; }
.pd .pd-table tr.pd-total td { background: var(--tint); font-weight: 800; color: #111827; font-size: 15px; border-bottom: 0; }
.pd .pd-price-box { background: var(--tint); border-radius: 12px; padding: 16px 20px; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 12px; break-inside: avoid; page-break-inside: avoid; }
.pd .pd-price-box .pd-price { font-size: 22px; font-weight: 800; color: #111827; }

.pd .pd-closing { background: var(--dark); color: #d1d5db; border-radius: 14px; padding: 24px 28px; margin-top: 26px; break-inside: avoid; page-break-inside: avoid; }
.pd .pd-closing-label { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; color: var(--accent); margin-bottom: 8px; }
.pd .pd-closing-quote { font-size: 20px; line-height: 1.35; font-weight: 700; color: #fff; margin: 0 0 10px; }
.pd .pd-closing p:last-child { margin: 0; font-size: 13px; }

@media (max-width: 640px) {
  .pd .pd-title { font-size: 24px; }
  .pd .pd-ba { grid-template-columns: 1fr; }
  .pd .pd-ba-arrow { transform: rotate(90deg); text-align: center; }
  .pd .pd-grid, .pd .pd-timeline { grid-template-columns: 1fr !important; }
  .pd .pd-bar { grid-template-columns: 110px 1fr 40px; }
  .pd .pd-table { display: block; overflow-x: auto; }
}
`

// ── Bloques ─────────────────────────────────────────────────────────────────────────────
const key = s => String(s || '').trim().toLowerCase()

function heading(b) { return b.heading ? `<h2 class="pd-h2">${esc(b.heading)}</h2>` : '' }
const sub = b => (b.subheading ? `<h3 class="pd-h3">${esc(b.subheading)}</h3>` : '')
const intro = t => (t ? `<p>${rich(t)}</p>` : '')

function money(plan) {
  const n = Number(plan.price)
  return plan.price == null || plan.price === '' || !Number.isFinite(n) ? 'A definir' : `${esc(plan.currency || 'ARS')} ${n.toLocaleString('es-AR')}`
}

// Servicios de los planes (unión, en orden de aparición) con el badge de qué planes los incluyen.
function planServices(plans) {
  const order = []
  const seen = new Map()
  plans.forEach((p, pi) => (p.services || []).forEach(s => {
    const k = key(s.name)
    if (!k) return
    if (!seen.has(k)) { seen.set(k, { name: s.name, description: s.description || '', inPlans: new Set() }); order.push(k) }
    seen.get(k).inPlans.add(pi)
  }))
  return order.map(k => seen.get(k))
}

function planBadge(svc, plans) {
  if (plans.length < 2) return ''
  if (svc.inPlans.size === plans.length) return plans.length === 2 ? 'Ambos planes' : 'Todos los planes'
  return [...svc.inPlans].map(i => plans[i].label).filter(Boolean).join(' · ')
}

const RENDER = {
  text: (b) => `${heading(b)}${sub(b)}${(b.paragraphs || []).map(p => `<p>${rich(p)}</p>`).join('')}`,

  callout: (b) => `${heading(b)}<div class="pd-callout"><p>${b.label ? `<strong>${esc(b.label)}</strong> ` : ''}${rich(b.text)}</p></div>`,

  before_after: (b) => `${heading(b)}
    <div class="pd-ba">
      <div class="pd-ba-box pd-ba-from"><div class="pd-ba-label">${esc(b.fromLabel)}</div><div class="pd-ba-text">${rich(b.from)}</div></div>
      <div class="pd-ba-arrow">→</div>
      <div class="pd-ba-box pd-ba-to"><div class="pd-ba-label">${esc(b.toLabel)}</div><div class="pd-ba-text">${rich(b.to)}</div></div>
    </div>${b.note ? `<p>${rich(b.note)}</p>` : ''}`,

  cards: (b, ctx) => {
    const items = b.items || []
    if (!items.length) return ''
    const cols = Math.min(4, Math.max(2, b.columns || 3))
    const colors = b.variant === 'funnel' ? ctx.pal.funnel(items.length) : null
    const cards = items.map((it, i) => colors
      ? `<div class="pd-card pd-card-funnel" style="background:${colors[i].bg};color:${colors[i].fg}">${it.tag ? `<div class="pd-card-tag">${esc(it.tag)}</div>` : ''}<div class="pd-card-title">${esc(it.title)}</div><div class="pd-card-text">${rich(it.text)}</div></div>`
      : `<div class="pd-card">${it.tag ? `<div class="pd-card-tag">${esc(it.tag)}</div>` : ''}<div class="pd-card-title">${esc(it.title)}</div><div class="pd-card-text">${rich(it.text)}</div></div>`).join('')
    return `${heading(b)}${sub(b)}${intro(b.intro)}<div class="pd-grid" style="grid-template-columns:repeat(${cols},1fr)">${cards}</div>${intro(b.outro)}`
  },

  bars: (b) => {
    const items = b.items || []
    if (!items.length) return ''
    const bars = items.map(it => {
      const v = Math.min(100, Math.max(0, Number(it.value) || 0))
      return `<div class="pd-bar"><div class="pd-bar-label">${esc(it.label)}</div><div class="pd-bar-track"><div class="pd-bar-fill" style="width:${v}%"></div></div><div class="pd-bar-val">${v}%</div></div>`
    }).join('')
    return `${heading(b)}${intro(b.intro)}<div class="pd-bars">${bars}</div>${intro(b.outro)}`
  },

  pills: (b) => {
    const items = b.items || []
    if (!items.length) return ''
    return `${heading(b)}${sub(b)}${intro(b.intro)}<div class="pd-pills">${items.map(t => `<span class="pd-pill">${esc(t)}</span>`).join('')}</div>`
  },

  steps: (b) => {
    const items = b.items || []
    if (!items.length) return ''
    if (b.variant === 'timeline') {
      const cols = Math.min(5, Math.max(2, items.length))
      const cells = items.map((it, i) => `<div class="pd-tl-item"><div class="pd-tl-n">${i + 1}</div><div class="pd-tl-title">${esc(it.title)}</div><div class="pd-tl-text">${rich(it.text)}</div></div>`).join('')
      return `${heading(b)}${intro(b.intro)}<div class="pd-timeline" style="grid-template-columns:repeat(${cols},1fr)">${cells}</div>${intro(b.outro)}`
    }
    const rows = items.map((it, i) => `<li class="pd-step"><div class="pd-step-n">${i + 1}</div><div>${it.title ? `<strong>${esc(it.title)}${it.text ? ':' : ''}</strong> ` : ''}${rich(it.text)}</div></li>`).join('')
    return `${heading(b)}${intro(b.intro)}<ol class="pd-steps">${rows}</ol>${intro(b.outro)}`
  },

  services: (b, ctx) => {
    const fromAi = new Map((b.items || []).map(it => [key(it.name), it]))
    const svcs = planServices(ctx.plans)
    // Sin servicios en los planes (o planes vacíos) se muestran los del doc tal cual, sin badge.
    const list = svcs.length
      ? svcs.map(s => ({ name: s.name, badge: planBadge(s, ctx.plans), ai: fromAi.get(key(s.name)), fallback: s.description }))
      : (b.items || []).map(it => ({ name: it.name, badge: '', ai: it, fallback: '' }))
    if (!list.length) return ''
    const cards = list.map(s => `<div class="pd-service">
      <div class="pd-service-head"><div class="pd-service-name">${esc(s.name)}</div>${s.badge ? `<span class="pd-badge">${esc(s.badge)}</span>` : ''}</div>
      ${s.ai?.intro || s.fallback ? `<p>${rich(s.ai?.intro || s.fallback)}</p>` : ''}
      ${s.ai?.bullets?.length ? `<ul class="pd-bullets">${s.ai.bullets.map(x => `<li>${rich(x)}</li>`).join('')}</ul>` : ''}
    </div>`).join('')
    return `${heading(b)}${intro(b.intro)}${cards}`
  },

  pricing: (b, ctx) => {
    const plans = ctx.plans
    if (!plans.length) return ''
    const svcs = planServices(plans)
    let table
    if (plans.length === 1) {
      const p = plans[0]
      table = `${svcs.length ? `<table class="pd-table"><thead><tr><th>Servicio</th><th>${esc(p.label)}</th></tr></thead><tbody>${svcs.map(s => `<tr><td>${esc(s.name)}</td><td class="pd-yes">✓ Incluido</td></tr>`).join('')}<tr class="pd-total"><td>Inversión mensual</td><td>${money(p)}</td></tr></tbody></table>` : `<div class="pd-price-box"><span>Inversión mensual</span><span class="pd-price">${money(p)}</span></div>`}`
    } else {
      const head = plans.map((p, i) => `<th${i === plans.length - 1 ? ' class="pd-hl"' : ''}>${esc(p.label)}</th>`).join('')
      const rows = svcs.map(s => `<tr><td>${esc(s.name)}</td>${plans.map((_, i) => s.inPlans.has(i) ? '<td class="pd-yes">✓ Incluido</td>' : '<td class="pd-no">—</td>').join('')}</tr>`).join('')
      table = `<table class="pd-table"><thead><tr><th>Servicio</th>${head}</tr></thead><tbody>${rows}<tr class="pd-total"><td>Inversión mensual</td>${plans.map(p => `<td>${money(p)}</td>`).join('')}</tr></tbody></table>`
    }
    return `${heading(b)}${intro(b.intro)}${table}${intro(b.note)}`
  },

  closing: (b) => `<div class="pd-closing">${b.label ? `<div class="pd-closing-label">${esc(b.label)}</div>` : ''}${b.quote ? `<p class="pd-closing-quote">${rich(b.quote)}</p>` : ''}${b.text ? `<p>${rich(b.text)}</p>` : ''}</div>`,
}

/**
 * @param doc    Proposal.doc (título/subtítulo/lead + blocks[])
 * @param opts   { plans: Proposal.plans, accent: '#RRGGBB', title }  — `title` gana sobre doc.title
 * @returns HTML string con wrapper `.pd` (requiere PROPOSAL_DOC_CSS en la página)
 */
export function renderProposalDoc(doc, { plans = [], accent, title } = {}) {
  const pal = palette(accent)
  const ctx = { plans: Array.isArray(plans) ? plans : [], pal }
  const blocks = Array.isArray(doc?.blocks) ? doc.blocks : []
  const body = blocks.map(b => {
    const fn = RENDER[b?.type]
    const html = fn ? fn(b, ctx) : ''
    if (!html) return ''
    return b.type === 'closing' ? html : `<section class="pd-block">${html}</section>`
  }).join('')
  const t = title || doc?.title || ''
  return `<div class="pd" style="--accent:${pal.accent};--on-accent:${pal.onAccent};--tint:${pal.tint};--tint2:${pal.tint2};--dark:${pal.dark}">
    ${t ? `<h1 class="pd-title">${esc(t)}</h1>` : ''}
    ${doc?.subtitle ? `<div class="pd-subtitle">${esc(doc.subtitle)}</div>` : ''}
    ${doc?.lead ? `<p class="pd-lead">${rich(doc.lead)}</p>` : ''}
    ${body}
  </div>`
}
