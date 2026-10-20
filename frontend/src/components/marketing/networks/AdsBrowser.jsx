import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LayoutGrid, List, Search } from 'lucide-react'
import { Icon } from '../../ui/Icon'

// Listado completo de anuncios (Meta Ads / Google Ads): ordenar por métrica, filtrar
// por campaña/estado, buscar por nombre, vista grilla o tabla y "Ver más". Todo client-side
// sobre el array `ads` que ya devuelve el backend. El orden vive en la URL (`?adsSort=`).

const PAGE_SIZE = 20

const ACTIVE_STATUSES = new Set(['ACTIVE', 'ENABLED'])

const STATUS_FILTERS = [
  { key: 'all',      label: 'Todos' },
  { key: 'active',   label: 'Activos' },
  { key: 'inactive', label: 'No activos' },
]

const selectCls = 'text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500'

/**
 * @param {object[]} ads
 * @param {{ key, label, get: ad=>number|null, fmt: n=>string, lowerIsBetter?: boolean }[]} metrics
 *   — opciones de orden y columnas de la tabla. `lowerIsBetter` ordena asc (ej. costo por resultado).
 * @param {string} defaultSort  — key de `metrics`
 * @param {(ad) => ReactNode} renderCard
 * @param {(ad) => ReactNode} [renderThumb] — miniatura en la fila de la tabla
 */
export default function AdsBrowser({ title = 'Anuncios', ads, metrics, defaultSort, renderCard, renderThumb, gridClass }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [view,     setView]     = useState('grid')
  const [campaign, setCampaign] = useState('')
  const [status,   setStatus]   = useState('all')
  const [query,    setQuery]    = useState('')
  const [visible,  setVisible]  = useState(PAGE_SIZE)

  const sortKey = metrics.some(m => m.key === searchParams.get('adsSort'))
    ? searchParams.get('adsSort')
    : defaultSort
  const sortMetric = metrics.find(m => m.key === sortKey)

  function setSort(key) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (key === defaultSort) next.delete('adsSort')
      else next.set('adsSort', key)
      return next
    }, { replace: true })
    setVisible(PAGE_SIZE)
  }

  const campaigns = useMemo(() => {
    const map = new Map()
    for (const a of ads ?? []) if (a.campaignName) map.set(a.campaignId ?? a.campaignName, a.campaignName)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [ads])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (ads ?? []).filter(a => {
      if (campaign && String(a.campaignId ?? a.campaignName) !== campaign) return false
      if (status === 'active'   && !ACTIVE_STATUSES.has(a.status)) return false
      if (status === 'inactive' &&  ACTIVE_STATUSES.has(a.status)) return false
      if (q) {
        const hay = [a.name, a.headline, a.campaignName, a.adGroupName].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    // Los sin dato (null, ej. costo por resultado sin conversiones) van siempre al final.
    const get = sortMetric.get
    return list.sort((a, b) => {
      const va = get(a), vb = get(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      return sortMetric.lowerIsBetter ? va - vb : vb - va
    })
  }, [ads, campaign, status, query, sortMetric])

  if (!ads || ads.length === 0) return null

  const shown = filtered.slice(0, visible)
  const resetPage = setter => v => { setter(v); setVisible(PAGE_SIZE) }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {title} ({filtered.length === ads.length ? ads.length : `${filtered.length} de ${ads.length}`})
          </p>
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden" role="group" aria-label="Vista">
            {[['grid', LayoutGrid, 'Grilla'], ['table', List, 'Tabla']].map(([key, glyph, label]) => (
              <button key={key} type="button" onClick={() => setView(key)} title={label} aria-label={label} aria-pressed={view === key}
                className={`px-2 py-1 ${view === key ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                <Icon as={glyph} size={14} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            Ordenar por
            <select value={sortKey} onChange={e => setSort(e.target.value)} className={selectCls}>
              {metrics.map(m => (
                <option key={m.key} value={m.key}>{m.lowerIsBetter ? `Menor ${m.label.toLowerCase()}` : `+ ${m.label.toLowerCase()}`}</option>
              ))}
            </select>
          </label>
          {campaigns.length > 1 && (
            <select value={campaign} onChange={e => resetPage(setCampaign)(e.target.value)} className={`${selectCls} max-w-[14rem]`} aria-label="Campaña">
              <option value="">Todas las campañas</option>
              {campaigns.map(([id, name]) => <option key={id} value={String(id)}>{name}</option>)}
            </select>
          )}
          <select value={status} onChange={e => resetPage(setStatus)(e.target.value)} className={selectCls} aria-label="Estado">
            {STATUS_FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-[10rem]">
            <Icon as={Search} size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="search" value={query} onChange={e => resetPage(setQuery)(e.target.value)} placeholder="Buscar anuncio…"
              className={`${selectCls} w-full pl-7`} />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400">Ningún anuncio coincide con los filtros.</p>
      ) : view === 'grid' ? (
        <div className={`grid gap-3 p-4 ${gridClass}`}>
          {shown.map(ad => <div key={ad.id} className="contents">{renderCard(ad)}</div>)}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-2 font-medium">Anuncio</th>
                {metrics.map(m => (
                  <th key={m.key} className="px-3 py-2 font-medium text-right whitespace-nowrap">
                    <button type="button" onClick={() => setSort(m.key)}
                      className={`hover:text-gray-600 dark:hover:text-gray-300 ${m.key === sortKey ? 'text-gray-700 dark:text-gray-200' : ''}`}>
                      {m.label}{m.key === sortKey ? (m.lowerIsBetter ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(ad => (
                <tr key={ad.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                  <td className="px-4 py-2 max-w-[18rem]">
                    <div className="flex items-center gap-2 min-w-0">
                      {renderThumb?.(ad)}
                      <div className="min-w-0">
                        <p className="text-gray-800 dark:text-gray-200 truncate" title={ad.headline || ad.name}>{ad.headline || ad.name || 'Anuncio'}</p>
                        {ad.campaignName && <p className="text-[10px] text-gray-400 truncate">{ad.campaignName}</p>}
                      </div>
                    </div>
                  </td>
                  {metrics.map(m => {
                    const v = m.get(ad)
                    return (
                      <td key={m.key} className={`px-3 py-2 text-right whitespace-nowrap ${m.key === sortKey ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                        {v == null ? '—' : m.fmt(v)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > visible && (
        <div className="px-4 pb-4 text-center">
          <button type="button" onClick={() => setVisible(v => v + PAGE_SIZE)}
            className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
            Ver más ({filtered.length - visible} restantes)
          </button>
        </div>
      )}
    </div>
  )
}
