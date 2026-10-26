import { useState, useRef, useEffect } from 'react'
import LoadingSpinner from '../../LoadingSpinner'

// Fisher-Yates — orden al azar, sin reusar el array original.
function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Loader para pantallas de Marketing que suelen demorar (ej. Instagram, que
 * encadena varias llamadas a la Graph API). Usa el logo animado de la app
 * (`LoadingSpinner`) + una frase que rota cada `intervalMs`, con un fade corto
 * entre una y la siguiente.
 *
 * Las frases salen de una "bolsa" barajada: no se repite ninguna hasta que
 * salieron todas las demás (antes se sorteaba un índice al azar excluyendo
 * solo el anterior, lo que podía hacer que dos frases se alternaran varias
 * veces seguidas por pura casualidad).
 */
export default function FunLoader({ messages = [], intervalMs = 5000, spinnerSize = 'lg', className = 'py-16' }) {
  const queueRef = useRef([])
  const lastRef  = useRef(null)

  function nextMessage() {
    if (queueRef.current.length === 0) {
      const bag = shuffle(messages)
      // Si la primera del nuevo ciclo coincide con la última mostrada del
      // ciclo anterior, la cambiamos de lugar para que no quede pegada.
      if (bag.length > 1 && bag[0] === lastRef.current) {
        ;[bag[0], bag[1]] = [bag[1], bag[0]]
      }
      queueRef.current = bag
    }
    const msg = queueRef.current.shift()
    lastRef.current = msg
    return msg
  }

  const [current, setCurrent] = useState(() => nextMessage())
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (messages.length < 2) return
    const timer = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setCurrent(nextMessage())
        setVisible(true)
      }, 200)
    }, intervalMs)
    return () => clearInterval(timer)
  }, [messages, intervalMs])

  return (
    <div className={`flex flex-col items-center justify-center gap-4 text-center ${className}`}>
      <LoadingSpinner size={spinnerSize} />
      {messages.length > 0 && (
        <p className={`text-sm text-gray-500 dark:text-gray-400 max-w-xs transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}>
          {current}
        </p>
      )}
    </div>
  )
}
