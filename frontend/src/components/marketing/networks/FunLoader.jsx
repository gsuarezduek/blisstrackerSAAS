import { useState, useEffect } from 'react'
import LoadingSpinner from '../../LoadingSpinner'

function randomIndex(length, excluding) {
  if (length <= 1) return 0
  let next = Math.floor(Math.random() * length)
  while (next === excluding) next = Math.floor(Math.random() * length)
  return next
}

/**
 * Loader para pantallas de Marketing que suelen demorar (ej. Instagram, que
 * encadena varias llamadas a la Graph API). Usa el logo animado de la app
 * (`LoadingSpinner`) + una frase que rota al azar cada `intervalMs`, con un
 * fade corto entre una y la siguiente.
 */
export default function FunLoader({ messages = [], intervalMs = 5000, spinnerSize = 'lg', className = 'py-16' }) {
  const [index,   setIndex]   = useState(() => Math.floor(Math.random() * Math.max(messages.length, 1)))
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (messages.length < 2) return
    const timer = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex(i => randomIndex(messages.length, i))
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
          {messages[index]}
        </p>
      )}
    </div>
  )
}
