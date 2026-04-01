const URL_REGEX = /https?:\/\/[^\s<>"']+/g

function shortenUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url }
}

export function linkify(text) {
  if (!text) return text
  const parts = []
  let lastIndex = 0
  URL_REGEX.lastIndex = 0
  let match
  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    parts.push(
      <a
        key={match.index}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="text-blue-500 hover:underline"
      >
        {shortenUrl(match[0])}
      </a>
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length > 0 ? parts : text
}
