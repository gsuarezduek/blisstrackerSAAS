import { describe, it, expect } from 'vitest'
import { sanitizePostHtml } from '../lib/sanitize.js'

// El HTML de un artículo lo escribe el editor Tiptap de SuperAdmin y se inyecta con
// dangerouslySetInnerHTML, así que lo que pasa por acá define qué puede aparecer en una
// página pública.
describe('sanitizePostHtml', () => {
  it('conserva el formato que genera Tiptap', () => {
    const html = '<p>Un <strong>párrafo</strong> con <em>énfasis</em> y <a href="https://blisstracker.app/pricing">un link</a>.</p>'
    expect(sanitizePostHtml(html)).toContain('<strong>párrafo</strong>')
    expect(sanitizePostHtml(html)).toContain('<em>énfasis</em>')
    expect(sanitizePostHtml(html)).toContain('href="https://blisstracker.app/pricing"')
  })

  it('conserva listas, tablas y citas', () => {
    const html = '<ul><li>uno</li></ul><table><tbody><tr><td>celda</td></tr></tbody></table><blockquote>cita</blockquote>'
    const out = sanitizePostHtml(html)
    for (const t of ['<ul>', '<li>', '<table>', '<td>', '<blockquote>']) expect(out).toContain(t)
  })

  it('saca scripts, iframes y handlers inline', () => {
    expect(sanitizePostHtml('<p>ok</p><script>alert(1)</script>')).not.toContain('script')
    expect(sanitizePostHtml('<iframe src="https://evil.test"></iframe>')).not.toContain('iframe')
    expect(sanitizePostHtml('<p onclick="alert(1)">texto</p>')).not.toContain('onclick')
    expect(sanitizePostHtml('<img src=x onerror="alert(1)">')).not.toContain('onerror')
  })

  it('rechaza esquemas peligrosos en los links', () => {
    expect(sanitizePostHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:')
    expect(sanitizePostHtml('<a href="data:text/html,<script>1</script>">x</a>')).not.toContain('data:')
  })

  it('baja un h1 del editor a h2', () => {
    // La página ya tiene su <h1> (el título del artículo): un segundo h1 metido desde el
    // editor rompería el criterio de un solo H1 por página.
    const out = sanitizePostHtml('<h1>Título dentro del cuerpo</h1>')
    expect(out).toContain('<h2>Título dentro del cuerpo</h2>')
    expect(out).not.toContain('<h1')
  })

  it('a un link externo le pone target y rel, al interno no', () => {
    expect(sanitizePostHtml('<a href="https://ejemplo.test">x</a>')).toContain('rel="noopener noreferrer"')
    expect(sanitizePostHtml('<a href="https://blisstracker.app/pricing">x</a>')).not.toContain('target=')
    expect(sanitizePostHtml('<a href="/pricing">x</a>')).not.toContain('target=')
  })

  it('deja color y resaltado, descarta cualquier otro estilo', () => {
    expect(sanitizePostHtml('<span style="color:#ff0000">rojo</span>')).toContain('color:#ff0000')
    const out = sanitizePostHtml('<span style="position:fixed;top:0;width:100vw">tapa todo</span>')
    expect(out).not.toContain('position')
    expect(out).toContain('tapa todo')
  })

  it('tolera null, undefined y vacío', () => {
    expect(sanitizePostHtml(null)).toBe('')
    expect(sanitizePostHtml(undefined)).toBe('')
    expect(sanitizePostHtml('')).toBe('')
  })
})
