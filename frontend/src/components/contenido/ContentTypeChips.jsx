import { typeLabel } from './contentCatalog'

/**
 * Formatos de una pieza (post/reel/story/…). Una pieza puede tener más de uno
 * a la vez (ej. "Historia + Post") — mismo patrón visual que ContentNetworkChips,
 * pero sin íconos: los tipos no tienen logo propio, solo texto.
 */
export default function ContentTypeChips({ types = [] }) {
  if (!types.length) return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {types.map(key => (
        <span
          key={key}
          className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium"
        >
          {typeLabel(key)}
        </span>
      ))}
    </div>
  )
}
