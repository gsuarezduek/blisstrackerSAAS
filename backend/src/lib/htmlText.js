const cheerio = require('cheerio')

// HTML del WYSIWYG (notas de reunión, informes) → texto plano con saltos de línea entre
// bloques, para pasárselo como contexto a la IA. Acotado a `maxChars`.
function htmlToText(html, maxChars = 8000) {
  if (!html || typeof html !== 'string') return ''
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
  const text = cheerio.load(`<body>${withBreaks}</body>`)('body').text()
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxChars)
}

module.exports = { htmlToText }
