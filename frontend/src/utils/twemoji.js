// Emoji → imágenes (Twemoji). El PDF lo renderiza un Chromium en Linux sin fuentes de
// emoji: como texto saldrían cuadraditos. Con imágenes se ven igual en cualquier
// servidor (y en cualquier Mac). Si una imagen no existe, se restaura el carácter.
export const EMOJI_RE = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)(?:\uFE0F|\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?|\p{Emoji_Modifier})*/gu
export const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/'

export function emojiToCode(emoji) {
  const cps = Array.from(emoji).map(c => c.codePointAt(0))
  const useful = cps.includes(0x200d) ? cps : cps.filter(cp => cp !== 0xfe0f)   // twemoji omite FE0F salvo en secuencias ZWJ
  return useful.map(cp => cp.toString(16)).join('-')
}

export function twemojify(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) {
    const n = walker.currentNode
    if (n.parentElement?.closest('script, style, textarea')) continue
    EMOJI_RE.lastIndex = 0
    if (EMOJI_RE.test(n.nodeValue)) nodes.push(n)
  }
  for (const node of nodes) {
    const text = node.nodeValue
    const frag = document.createDocumentFragment()
    let last = 0
    EMOJI_RE.lastIndex = 0
    for (const m of text.matchAll(EMOJI_RE)) {
      if (m.index > last) frag.append(text.slice(last, m.index))
      const img = document.createElement('img')
      img.src = `${TWEMOJI_BASE}${emojiToCode(m[0])}.svg`
      img.alt = m[0]
      img.className = 'print-emoji'
      img.onerror = () => img.replaceWith(document.createTextNode(m[0]))
      frag.append(img)
      last = m.index + m[0].length
    }
    if (last < text.length) frag.append(text.slice(last))
    node.replaceWith(frag)
  }
}
