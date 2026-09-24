import { describe, it, expect } from 'vitest'
import { emojiToCode, twemojify, TWEMOJI_BASE } from '../../utils/twemoji'

function rootWith(html) {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

describe('emojiToCode', () => {
  it('convierte un emoji simple a su codepoint', () => {
    expect(emojiToCode('📊')).toBe('1f4ca')
  })
  it('descarta el selector de variación FE0F (como hace twemoji)', () => {
    expect(emojiToCode('✏️')).toBe('270f')
    expect(emojiToCode('❤️')).toBe('2764')
  })
  it('conserva FE0F dentro de una secuencia ZWJ', () => {
    expect(emojiToCode('👨‍👩‍👧')).toBe('1f468-200d-1f469-200d-1f467')
    expect(emojiToCode('🏳️‍🌈')).toBe('1f3f3-fe0f-200d-1f308')
  })
})

describe('twemojify', () => {
  it('reemplaza los emoji por imágenes y deja el resto del texto intacto', () => {
    const root = rootWith('<p>Resumen 📝 del mes ✏️</p>')
    twemojify(root)
    const imgs = root.querySelectorAll('img.print-emoji')
    expect(imgs).toHaveLength(2)
    expect(imgs[0].getAttribute('src')).toBe(`${TWEMOJI_BASE}1f4dd.svg`)
    expect(imgs[1].getAttribute('src')).toBe(`${TWEMOJI_BASE}270f.svg`)
    expect(root.textContent).toBe('Resumen  del mes ')   // el texto que queda es solo el no-emoji (las imágenes no aportan textContent)
  })

  it('no toca símbolos de texto (✓ → ↑) que no son emoji', () => {
    const root = rootWith('<p>✓ listo → ↑ 4%</p>')
    twemojify(root)
    expect(root.querySelectorAll('img')).toHaveLength(0)
    expect(root.textContent).toBe('✓ listo → ↑ 4%')
  })

  it('si la imagen no carga, restaura el carácter original', () => {
    const root = rootWith('<p>Próximos pasos 🚀</p>')
    twemojify(root)
    const img = root.querySelector('img')
    expect(img).not.toBeNull()
    img.onerror()
    expect(root.querySelector('img')).toBeNull()
    expect(root.textContent).toBe('Próximos pasos 🚀')
  })

  it('deja como texto los símbolos que no son emoji de presentación (ej. 🅖)', () => {
    const root = rootWith('<p>🅖 Google Ads</p>')
    twemojify(root)
    expect(root.querySelectorAll('img')).toHaveLength(0)
  })

  it('ignora el contenido de script/style/textarea', () => {
    const root = rootWith('<style>.a::after{content:"📝"}</style><textarea>📝</textarea>')
    twemojify(root)
    expect(root.querySelectorAll('img')).toHaveLength(0)
  })
})
