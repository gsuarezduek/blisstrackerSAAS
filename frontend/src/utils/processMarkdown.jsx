// Renderer markdown minimal (negrita, cursiva, listas con `- `) compartido entre
// el editor de Procesos en EOS y la vista de Procesos en Docs.

export function parseInline(text) {
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

export function renderMarkdown(text) {
  if (!text?.trim()) return null
  const lines  = text.split('\n')
  const result = []
  let listBuf  = []

  const flushList = () => {
    if (!listBuf.length) return
    result.push(
      <ul key={result.length} className="list-disc list-inside space-y-0.5 pl-1">
        {listBuf.map((item, i) => (
          <li key={i} className="text-xs text-gray-600 dark:text-gray-400">{parseInline(item)}</li>
        ))}
      </ul>
    )
    listBuf = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('- ')) {
      listBuf.push(line.slice(2))
    } else {
      flushList()
      if (line.trim() === '') {
        if (i < lines.length - 1) result.push(<div key={result.length} className="h-1" />)
      } else {
        result.push(
          <p key={result.length} className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            {parseInline(line)}
          </p>
        )
      }
    }
  }
  flushList()
  return result.length > 0 ? <div className="space-y-1">{result}</div> : null
}
