import { LayoutGrid, List, X } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { SORT_OPTIONS } from './projectFilesHelpers'

// ─── Buscador del proyecto + orden + modo de vista ───────────────────────────

export default function FilesSearchBar({ searchQuery, onSearchChange, sortBy, onSortChange, viewMode, onViewModeChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <input
          value={searchQuery} onChange={e => onSearchChange(e.target.value)}
          placeholder="Buscar en todo el proyecto…"
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg pl-3 pr-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {searchQuery && (
          <button onClick={() => onSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"><Icon as={X} size={16} /></button>
        )}
      </div>
      {/* Antes se escondía mientras se buscaba. Ahora el orden aplica también a
          los resultados: en la vista de lista los encabezados de columna SON el
          selector de orden, y dejarlos muertos sobre los resultados del
          buscador sería más raro que poder ordenarlos. */}
      <select
        value={sortBy} onChange={e => onSortChange(e.target.value)}
        className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* Miniaturas o lista. Se queda acá, al lado del orden, porque las dos
          cosas son "cómo mirar esta carpeta" — las acciones (subir, nueva
          carpeta, papelera) viven en la barra de arriba. Dos botones y no un
          <select>: son dos opciones y el ícono dice cuál es cada una.
          En la vista de lista el orden también se cambia clickeando el
          encabezado de la columna; el <select> queda porque es el único camino
          en mobile, donde no hay columnas. */}
      <div className="flex items-center rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden ml-auto">
        {[
          { mode: 'grid', icon: LayoutGrid, label: 'Ver como miniaturas' },
          { mode: 'list', icon: List, label: 'Ver como lista' },
        ].map(({ mode, icon, label }) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            title={label}
            aria-label={label}
            aria-pressed={viewMode === mode}
            className={`px-2 py-1.5 transition-colors ${viewMode === mode
              ? 'bg-primary-600 text-white'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            <Icon as={icon} size={15} />
          </button>
        ))}
      </div>
    </div>
  )
}
