import { useEffect, useState } from 'react'

const TYPE_MS = 90
const DELETE_MS = 45
const PAUSE_MS = 1800
const START_DELAY_MS = 400

function usesReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// Cicla `words` con efecto máquina de escribir (tipea → pausa → borra → siguiente).
// Respeta prefers-reduced-motion mostrando la primera palabra sin animar.
export function useTypewriter(words, { typeMs = TYPE_MS, deleteMs = DELETE_MS, pauseMs = PAUSE_MS } = {}) {
  const [text, setText] = useState('')
  const [reduced, setReduced] = useState(usesReducedMotion)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const list = words?.length ? words : ['']
    if (reduced) { setText(list[0]); return }
    if (list.length === 1) { setText(list[0]); return }

    let wordIndex = 0
    let charIndex = 0
    let deleting = false
    let timer

    function tick() {
      const current = list[wordIndex % list.length]
      if (!deleting) {
        charIndex++
        setText(current.slice(0, charIndex))
        if (charIndex === current.length) {
          timer = setTimeout(() => { deleting = true; tick() }, pauseMs)
          return
        }
        timer = setTimeout(tick, typeMs)
      } else {
        charIndex--
        setText(current.slice(0, charIndex))
        if (charIndex === 0) {
          deleting = false
          wordIndex++
          timer = setTimeout(tick, typeMs)
          return
        }
        timer = setTimeout(tick, deleteMs)
      }
    }

    timer = setTimeout(tick, START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [words, reduced, typeMs, deleteMs, pauseMs])

  return text
}
