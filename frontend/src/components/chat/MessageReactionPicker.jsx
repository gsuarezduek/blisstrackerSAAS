import { useEffect, useRef } from 'react'
import { QUICK_REACTIONS } from './quickReactions'

// Popover de reacción anclado a un mensaje puntual — grilla plana de reacciones rápidas
// (sin categorías, a diferencia del picker de emojis del input): un solo tap ya reacciona
// y cierra, no hace falta primero elegir categoría y después el emoji.
export default function MessageReactionPicker({ onSelect, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-20 p-1.5"
    >
      <div className="grid grid-cols-5 gap-0.5">
        {QUICK_REACTIONS.map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => { onSelect(emoji); onClose() }}
            className="text-xl leading-none p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
