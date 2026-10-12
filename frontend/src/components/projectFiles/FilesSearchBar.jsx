import { X } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { SORT_OPTIONS } from './projectFilesHelpers'

// ─── Buscador del proyecto + selector de orden ────────────────────────────────

export default function FilesSearchBar({ searchQuery, onSearchChange, sortBy, onSortChange, showSort }) {
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
      {showSort && (
        <select
          value={sortBy} onChange={e => onSortChange(e.target.value)}
          className="text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </div>
  )
}
