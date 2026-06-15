// Renderer markdown para la prosa del Wiki. Más completo que utils/processMarkdown.jsx
// (que es minimal `text-xs` y lo usa EOS — no tocar). Soporta:
//   ## / ###  headings
//   párrafos
//   - / *      bullets
//   1.         numeradas
//   > texto    callout
//   **bold**  *italic*  `code`  [texto](url)
// Sin dangerouslySetInnerHTML: solo JSX + Tailwind.
import { Link } from 'react-router-dom'

// Parsea inline: **bold**, *italic*, `code`, [texto](url). Links internos (que
// empiezan con `/`) usan <Link>; externos abren en pestaña nueva.
export function parseInline(text) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g)
  return parts.map((part, i) => {
    if (!part) return null
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const [, label, href] = link
      if (href.startsWith('/')) {
        return <Link key={i} to={href} className="text-primary-600 dark:text-primary-400 hover:underline font-medium">{label}</Link>
      }
      return (
        <a key={i} href={href} target="_blank" rel="noreferrer" className="text-primary-600 dark:text-primary-400 hover:underline font-medium">
          {label}
        </a>
      )
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-gray-900 dark:text-white">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="text-[0.8em] font-mono bg-gray-100 dark:bg-gray-700/70 text-primary-700 dark:text-primary-300 rounded px-1.5 py-0.5">{part.slice(1, -1)}</code>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

export function renderWikiMarkdown(text) {
  if (!text?.trim()) return null
  const lines  = text.replace(/\t/g, '  ').split('\n')
  const result = []
  let ulBuf = []
  let olBuf = []

  const flushUl = () => {
    if (!ulBuf.length) return
    result.push(
      <ul key={`ul-${result.length}`} className="list-disc pl-5 space-y-1.5 my-2">
        {ulBuf.map((item, i) => (
          <li key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{parseInline(item)}</li>
        ))}
      </ul>
    )
    ulBuf = []
  }
  const flushOl = () => {
    if (!olBuf.length) return
    result.push(
      <ol key={`ol-${result.length}`} className="list-decimal pl-5 space-y-1.5 my-2">
        {olBuf.map((item, i) => (
          <li key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{parseInline(item)}</li>
        ))}
      </ol>
    )
    olBuf = []
  }
  const flush = () => { flushUl(); flushOl() }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/)

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushOl()
      ulBuf.push(trimmed.slice(2))
    } else if (olMatch) {
      flushUl()
      olBuf.push(olMatch[1])
    } else if (trimmed.startsWith('### ')) {
      flush()
      result.push(
        <h4 key={result.length} className="text-sm font-bold text-gray-900 dark:text-white mt-5 mb-1.5">
          {parseInline(trimmed.slice(4))}
        </h4>
      )
    } else if (trimmed.startsWith('## ')) {
      flush()
      result.push(
        <h3 key={result.length} className="text-base font-bold text-gray-900 dark:text-white mt-6 mb-2 pb-1.5 border-b border-gray-100 dark:border-gray-700">
          {parseInline(trimmed.slice(3))}
        </h3>
      )
    } else if (trimmed.startsWith('> ')) {
      flush()
      result.push(
        <div key={result.length} className="my-3 border-l-4 border-primary-300 dark:border-primary-700 bg-primary-50/60 dark:bg-primary-900/15 rounded-r-lg px-4 py-2.5">
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{parseInline(trimmed.slice(2))}</p>
        </div>
      )
    } else if (trimmed === '') {
      flush()
    } else {
      flush()
      result.push(
        <p key={result.length} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed my-2">
          {parseInline(trimmed)}
        </p>
      )
    }
  }
  flush()
  return result.length > 0 ? <div>{result}</div> : null
}
