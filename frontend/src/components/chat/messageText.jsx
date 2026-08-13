// Resalta URLs y @menciones en un mensaje de chat en una sola pasada. Mismo
// criterio cosmético que `renderWithMentions` en TaskCommentsModal.jsx: captura
// una sola palabra después del @ (el backend ya resolvió la mención real contra
// nombres de varias palabras; acá solo es un resaltado visual).
const TOKEN_REGEX = /(https?:\/\/[^\s<>"']+)|(@[A-Za-záéíóúÁÉÍÓÚñÑüÜ]+)/g

function shortenUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url }
}

export function renderMessageText(text) {
  if (!text) return text
  const parts = []
  let lastIndex = 0
  TOKEN_REGEX.lastIndex = 0
  let match
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    if (match[1]) {
      parts.push(
        <a
          key={match.index}
          href={match[1]}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-blue-500 hover:underline"
        >
          {shortenUrl(match[1])}
        </a>
      )
    } else {
      const isEveryone = match[2].toLowerCase() === '@everyone'
      parts.push(
        <span
          key={match.index}
          className={isEveryone
            ? 'px-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold'
            : 'text-primary-600 dark:text-primary-400 font-medium'}
        >
          {match[2]}
        </span>
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length > 0 ? parts : text
}
