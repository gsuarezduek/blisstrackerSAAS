'use client'

import { useTypewriter } from './useTypewriter'

function joinWithOr(words) {
  if (!words?.length) return ''
  if (words.length === 1) return words[0]
  return `${words.slice(0, -1).join(', ')} o ${words[words.length - 1]}`
}

/**
 * "de tu " + palabra animada + ".". La animación es el único motivo por el que esto es
 * client component; las palabras llegan por prop desde el server, así que el hero ya
 * está en el HTML inicial. El <span class="sr-only"> con todas las palabras es lo que
 * leen los lectores de pantalla (y lo que da texto estable a los crawlers), mientras
 * la versión animada va con aria-hidden — mismo criterio que en la SPA.
 */
export default function TypewriterAccent({ words }) {
  const text = useTypewriter(words)
  const readable = joinWithOr(words)
  return (
    <>
      de tu{' '}
      <span aria-hidden="true">
        {text}
        <span className="inline-block w-[3px] h-[0.85em] bg-primary-500 align-middle ml-1 animate-[blink_1s_step-end_infinite]" />
      </span>
      <span className="sr-only">{readable}</span>.
    </>
  )
}
