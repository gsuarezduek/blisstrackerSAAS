import UserLink from '../components/UserLink'

const URL_RE = /https?:\/\/[^\s<>"']+/y
const NAME_CHAR_RE = /[a-záéíóúñü]/i

function shortenUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url }
}

function isNameChar(ch) {
  return ch !== undefined && NAME_CHAR_RE.test(ch)
}

/**
 * Busca, en `lower` (texto en minúsculas) a partir de `start` (justo después
 * del '@'), el nombre de miembro más largo que matchee ahí — probando primero
 * el nombre completo y cayendo al primer nombre, mismo criterio que
 * resolveMentions en el backend (backend/src/lib/mentions.js), para que lo
 * que se resalta/clickea acá coincida con a quién se notificó realmente.
 * Si dos miembros distintos empatan en el match más largo (homónimos sin
 * apellido, ej. dos "Marti"), no hay forma de saber a cuál linkear —
 * `member` sale null y el texto queda resaltado pero no clickeable.
 */
function bestMemberMatch(lower, start, candidates) {
  let bestLen = -1
  let bestMembers = []
  for (const c of candidates) {
    for (const form of [c.full, c.first]) {
      if (!form || !lower.startsWith(form, start)) continue
      if (isNameChar(lower[start + form.length])) continue // límite de palabra
      if (form.length > bestLen) { bestLen = form.length; bestMembers = [c.member] }
      else if (form.length === bestLen && !bestMembers.includes(c.member)) bestMembers.push(c.member)
    }
  }
  if (bestLen === -1) return null
  return { member: bestMembers.length === 1 ? bestMembers[0] : null, length: bestLen }
}

/**
 * Resalta URLs y @menciones en texto plano, en una sola pasada. Reemplaza a
 * `linkify` (solo URLs) y al viejo `renderWithMentions`/`renderMessageText`
 * (menciones cosméticas, sin resolver) en los tres lugares que mostraban
 * texto con menciones: descripción de tarea, comentarios de tarea y chat.
 *
 * Si se pasan `members` ({id, name}[]), una mención que matchea a una
 * persona real se envuelve en <UserLink> — click navega a /users/:id. Si no
 * matchea a nadie (o es ambigua entre homónimos) queda resaltada pero no
 * clickeable. `everyone: true` (solo Chat) le da su propio estilo a
 * "@everyone" en vez de tratarlo como una persona.
 */
export function renderRichText(text, { members = [], everyone = false } = {}) {
  if (!text) return text
  const lower = text.toLowerCase()
  const candidates = members
    .filter(m => m.name)
    .map(m => {
      const full = m.name.toLowerCase().trim().replace(/\s+/g, ' ')
      return { member: m, full, first: full.split(' ')[0] }
    })

  const parts = []
  let lastIndex = 0
  let i = 0
  while (i < text.length) {
    const ch = text[i]

    if ((ch === 'h' || ch === 'H')) {
      URL_RE.lastIndex = i
      const m = URL_RE.exec(text)
      if (m) {
        if (i > lastIndex) parts.push(text.slice(lastIndex, i))
        parts.push(
          <a
            key={i}
            href={m[0]}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-blue-500 hover:underline"
          >
            {shortenUrl(m[0])}
          </a>
        )
        i = lastIndex = i + m[0].length
        continue
      }
    }

    if (ch === '@') {
      if (everyone && lower.startsWith('everyone', i + 1) && !isNameChar(lower[i + 9])) {
        if (i > lastIndex) parts.push(text.slice(lastIndex, i))
        parts.push(
          <span key={i} className="px-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold">
            {text.slice(i, i + 9)}
          </span>
        )
        i = lastIndex = i + 9
        continue
      }

      const hit = bestMemberMatch(lower, i + 1, candidates)
      if (hit) {
        if (i > lastIndex) parts.push(text.slice(lastIndex, i))
        const raw = text.slice(i, i + 1 + hit.length)
        parts.push(
          hit.member ? (
            <UserLink
              key={i}
              userId={hit.member.id}
              className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
              title={`Ver perfil de ${hit.member.name}`}
            >
              {raw}
            </UserLink>
          ) : (
            <span key={i} className="text-primary-600 dark:text-primary-400 font-medium">{raw}</span>
          )
        )
        i = lastIndex = i + 1 + hit.length
        continue
      }
    }

    i++
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts.length > 0 ? parts : text
}
