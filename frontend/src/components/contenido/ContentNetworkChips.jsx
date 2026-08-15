import SocialIcon from '../marketing/SocialIcon'
import { networkMeta } from './contentCatalog'

/**
 * Redes de destino de una pieza. Las que tienen logo (`hasIcon`) se rinden con
 * el ícono de marca; el resto con una pastilla de texto.
 */
export default function ContentNetworkChips({ networks = [], size = 'w-4 h-4' }) {
  if (!networks.length) return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {networks.map(key => {
        const meta = networkMeta(key)
        // SocialIcon solo acepta network/className: el tooltip va en un wrapper.
        return meta.hasIcon ? (
          <span key={key} title={meta.label} className="inline-flex shrink-0">
            <SocialIcon network={key} className={`${size} text-gray-500 dark:text-gray-400`} />
          </span>
        ) : (
          <span
            key={key}
            title={meta.label}
            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium"
          >
            {meta.label}
          </span>
        )
      })}
    </div>
  )
}
