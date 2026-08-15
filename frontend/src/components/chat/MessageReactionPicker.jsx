import { useEffect, useRef } from 'react'
import EmojiPicker from './EmojiPicker'

// Popover de reacción anclado a un mensaje puntual — misma grilla de categorías que usa
// el picker de emojis del input, solo que acá cada click reacciona y cierra (no encadena
// varios como al componer un mensaje).
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
      className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-20 overflow-hidden"
    >
      <EmojiPicker onSelect={e => { onSelect(e); onClose() }} />
    </div>
  )
}
