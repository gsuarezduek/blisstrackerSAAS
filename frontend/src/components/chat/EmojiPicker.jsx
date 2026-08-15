import { useState } from 'react'
import { EMOJI_CATEGORIES } from './emojiData'

// Grilla de emojis por categoría, reutilizada tanto por EmojiGifPicker (componer un
// mensaje) como por MessageReactionPicker (reaccionar a un mensaje existente).
export default function EmojiPicker({ onSelect }) {
  const [category, setCategory] = useState(EMOJI_CATEGORIES[0].key)
  const active = EMOJI_CATEGORIES.find(c => c.key === category) || EMOJI_CATEGORIES[0]

  return (
    <>
      <div className="flex gap-0.5 px-2 pt-2 pb-1 overflow-x-auto flex-shrink-0">
        {EMOJI_CATEGORIES.map(c => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            title={c.label}
            className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-base transition-colors ${
              c.key === category ? 'bg-primary-100 dark:bg-primary-900/40' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div className="h-56 overflow-y-auto px-2 pb-2">
        <div className="grid grid-cols-8 gap-0.5">
          {active.emojis.map((e, i) => (
            <button
              key={`${active.key}-${i}`}
              type="button"
              onClick={() => onSelect(e)}
              className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
