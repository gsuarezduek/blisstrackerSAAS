// Render de los mails de Mailing: lo que sale del editor por bloques tiene que
// llegar al destinatario sin HTML inyectable, con los links trackeados de forma
// que el redirect público no sea un open redirect, y con el pie de baja siempre.
// TipTap del lado del servidor usa happy-dom (ESM) y Jest no lo parsea: se
// reemplaza por una conversión mínima con la MISMA forma de salida (incluido el
// xmlns que agrega happy-dom), así se prueba el post-proceso que es nuestro.
jest.mock('@tiptap/html/server', () => {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const node = n => {
    if (n.type === 'text') {
      const l = (n.marks || []).find(m => m.type === 'link')
      return l ? `<a target="_blank" rel="noopener noreferrer nofollow" href="${esc(l.attrs.href)}">${esc(n.text)}</a>` : esc(n.text)
    }
    const inner = (n.content || []).map(node).join('')
    return n.type === 'paragraph' ? `<p xmlns="http://www.w3.org/1999/xhtml">${inner}</p>` : inner
  }
  return { generateHTML: doc => (doc.content || []).map(node).join('') }
}, { virtual: false })

const {
  sanitizeBlocks, renderCampaignHtml, renderCampaignText, prepareTracking, personalize,
} = require('../../src/services/mailing/render')

const textBlock = (content) => ({ type: 'text', doc: { type: 'doc', content } })
const para = (...nodes) => ({ type: 'paragraph', content: nodes })
const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) })
const link = href => [{ type: 'link', attrs: { href } }]

describe('sanitizeBlocks', () => {
  it('descarta tipos desconocidos y URLs que no son http(s)/mailto', () => {
    const out = sanitizeBlocks([
      { type: 'script', text: 'x' },
      { type: 'image', url: 'javascript:alert(1)', href: 'data:text/html,x' },
      { type: 'button', label: 'Ir', href: 'mailto:hola@x.com', color: 'red' },
    ])
    expect(out.map(b => b.type)).toEqual(['image', 'button'])
    expect(out[0].url).toBe('')
    expect(out[0].href).toBe('')
    expect(out[1].href).toBe('mailto:hola@x.com')
    expect(out[1].color).toBeNull() // solo #RRGGBB
  })

  it('no acepta algo que no sea un array', () => {
    expect(sanitizeBlocks({ type: 'heading' })).toEqual([])
    expect(sanitizeBlocks(null)).toEqual([])
  })
})

describe('renderCampaignHtml', () => {
  it('escapa el texto de los bloques y neutraliza los links javascript: del texto rico', () => {
    const html = renderCampaignHtml({
      subject: 'S',
      blocks: [
        { type: 'heading', text: '<img src=x onerror=alert(1)>' },
        textBlock([para(t('malo', link('javascript:alert(1)')), t(' bueno', link('https://ok.com')))]),
      ],
    })
    expect(html).not.toMatch(/<img src=x/)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="https://ok.com"')
    expect(html).not.toContain('xmlns=')
  })

  it('siempre lleva el pie con la dirección, el link de baja y el pixel', () => {
    const html = renderCampaignHtml({ subject: 'S', blocks: [], senderName: 'ACME', postalAddress: 'Calle 1' })
    expect(html).toContain('Calle 1')
    expect(html).toContain('{{__unsub_url}}')
    expect(html).toContain('{{__open_url}}')
  })
})

describe('prepareTracking', () => {
  it('numera las URLs distintas una sola vez y deja afuera mailto, baja y links con variables', () => {
    const html = renderCampaignHtml({
      subject: 'S',
      blocks: [
        { type: 'button', label: 'A', href: 'https://a.com/?x=1&y=2' },
        { type: 'button', label: 'A otra vez', href: 'https://a.com/?x=1&y=2' },
        { type: 'button', label: 'Mail', href: 'mailto:a@b.com' },
        { type: 'button', label: 'Var', href: 'https://b.com/?ref={{email}}' },
        { type: 'button', label: 'B', href: 'https://b.com/' },
      ],
    })
    const { html: out, links } = prepareTracking(html)
    expect(links).toEqual(['https://a.com/?x=1&y=2', 'https://b.com/'])
    expect(out.match(/\{\{__click:0\}\}/g)).toHaveLength(2)
    expect(out).toContain('href="mailto:a@b.com"')
    expect(out).toContain('{{__unsub_url}}')
  })
})

describe('personalize', () => {
  const tpl = '<p>Hola {{nombre|amigo}} de {{campo.ciudad}}</p><a href="{{__click:0}}">x</a><img src="{{__open_url}}">'

  it('escapa los datos del contacto en HTML (vienen de un CSV o un formulario)', () => {
    const out = personalize(tpl, { contact: { firstName: '<script>', fields: { ciudad: 'Rosario' } }, system: { open_url: 'https://t/o/1', click: i => `https://t/c/1/${i}` } })
    expect(out).toContain('Hola &lt;script&gt; de Rosario')
    expect(out).toContain('href="https://t/c/1/0"')
    expect(out).toContain('src="https://t/o/1"')
  })

  it('usa el valor por defecto si falta el dato, y nada si no hay default', () => {
    const out = personalize(tpl, { contact: {}, system: {} })
    expect(out).toContain('Hola amigo de </p>')
  })

  it('en texto plano no escapa', () => {
    expect(personalize('Hola {{nombre}}', { contact: { firstName: 'Ana & Co' } }, { html: false })).toBe('Hola Ana & Co')
  })
})

describe('renderCampaignText', () => {
  it('arma la versión en texto con los botones como URL y el link de baja', () => {
    const txt = renderCampaignText({
      blocks: [{ type: 'heading', text: 'Novedades' }, textBlock([para(t('Hola'))]), { type: 'button', label: 'Comprar', href: 'https://x.com' }],
      senderName: 'ACME',
    })
    expect(txt).toContain('Novedades')
    expect(txt).toContain('Comprar: https://x.com')
    expect(txt).toContain('Darme de baja: {{__unsub_url}}')
  })
})
