import { useState, useEffect } from 'react'
import api from '../../api/client'
import { languageMeta, statusBadgeClass } from '../contenido/contentCatalog'
import { Search, X } from 'lucide-react'
import { Icon } from '../ui/Icon'

const INPUT = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100'

/**
 * Sumar al inventario una nota que ya existe en Contenido: se busca la pieza por
 * título (sólo las que todavía no tienen URL) y se abre su ficha SEO para
 * cargársela. Es el camino de una nota nueva — se produce y se aprueba en
 * Contenido, y al publicarse se le carga la URL acá. Para un blog entero que ya
 * está publicado, lo que corresponde es "Importar del sitio".
 */
export default function BlogAddNoteModal({ projectId, onClose, onPick }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (!term) { setResults([]); setSearched(false); return }
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/marketing/projects/${projectId}/blog/pieces`, { params: { q: term, withoutUrl: '1' } })
        setResults(r.data.pieces)
      } catch { setResults([]) }
      setSearched(true)
    }, 250)
    return () => clearTimeout(t)
  }, [q, projectId])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Agregar nota</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Elegí la pieza de Contenido y cargale la URL donde se publicó.
            </p>
          </div>
          <button onClick={onClose} title="Cerrar" className="flex-shrink-0 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Icon as={X} size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex-1 overflow-y-auto">
          <div className="relative mb-3">
            <Icon as={Search} size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar la pieza por título…"
              className={`${INPUT} pl-8`}
            />
          </div>

          {results.length > 0 ? (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
              {results.map(p => (
                <button
                  key={p.id}
                  onClick={() => onPick(p.id)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2"
                >
                  <span className="flex-1 min-w-0 truncate text-gray-800 dark:text-gray-200">{p.title}</span>
                  {p.language && (
                    <span className="text-[10px] font-semibold text-gray-400">{languageMeta(p.language)?.short}</span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusBadgeClass(p.status)}`}>{p.statusLabel}</span>
                </button>
              ))}
            </div>
          ) : searched ? (
            <p className="text-xs text-gray-400 text-center py-4">
              Ninguna pieza sin URL coincide. Las que ya tienen URL están en el inventario.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
