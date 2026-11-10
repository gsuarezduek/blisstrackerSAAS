import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import ContentImportModal from './ContentImportModal'
import { CONTENT_STATUSES, CONTENT_LANGUAGES, languageMeta, statusBadgeClass } from './contentCatalog'
import {
  AlertTriangle, Download, ExternalLink, Link2, RefreshCw, Search,
  TrendingDown, TrendingUp, Minus, Sparkles,
} from 'lucide-react'
import { Icon } from '../ui/Icon'

const INPUT = 'px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'

// Cada cuánto vale la pena volver a pedirle los datos a Search Console sin que
// nadie lo pida: los datos de Google se actualizan una vez por día, así que un
// refresco automático más seguido gasta cuota de la API del cliente para traer
// exactamente lo mismo. El botón "Actualizar" no respeta este umbral.
const AUTO_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

const SORTS = [
  { id: 'clicks',      label: 'Clics' },
  { id: 'impressions', label: 'Impresiones' },
  { id: 'position',    label: 'Posición' },
  { id: 'published',   label: 'Fecha de publicación' },
  { id: 'title',       label: 'Título' },
]

const TRENDS = [
  { id: 'sube',    label: 'Suben' },
  { id: 'baja',    label: 'Bajan' },
  { id: 'estable', label: 'Estables' },
  { id: 'nuevo',   label: 'Sin comparación' },
]

const TREND_ICON = { sube: TrendingUp, baja: TrendingDown, estable: Minus, nuevo: Sparkles }
const TREND_CLASS = {
  sube:    'text-green-600 dark:text-green-400',
  baja:    'text-red-600 dark:text-red-400',
  estable: 'text-gray-400',
  nuevo:   'text-primary-500',
}

const num = v => (v ?? 0).toLocaleString('es-AR')

function Delta({ value, suffix = '%', invert = false }) {
  if (value == null || value === 0) return null
  const good = invert ? value < 0 : value > 0
  return (
    <span className={`block text-[11px] font-medium ${good ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
      {value > 0 ? '+' : ''}{value}{suffix === '%' ? '%' : ''}
    </span>
  )
}

/**
 * Inventario del blog: una fila por nota publicada, con lo que Search Console
 * dice de su URL en los últimos 28 días y la variación contra los 28 anteriores.
 *
 * Es la cuarta vista de Contenido y no una sección de Marketing porque la fila
 * ES la pieza: desde acá se abre su ficha, se le carga la keyword y se decide si
 * se actualiza o se escribe algo nuevo. Marketing mira el sitio entero; esto
 * mira nota por nota.
 */
export default function ContentInventoryView({ projectId, canEdit, onOpen, onImported }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [filters, setFilters] = useState({ language: '', status: '', trend: '', alert: '', q: '' })
  const [sort, setSort] = useState('clicks')
  const [dir, setDir] = useState('desc')
  // Un solo intento de refresco automático por proyecto y por visita: si Search
  // Console falla, reintentar en cada render sería un bucle de requests.
  const [autoTried, setAutoTried] = useState(false)

  const params = useMemo(() => {
    const p = { sort, dir }
    for (const [k, v] of Object.entries(filters)) if (v) p[k] = v
    return p
  }, [filters, sort, dir])

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const r = await api.get(`/contenido/projects/${projectId}/seo/inventory`, { params })
      setData(r.data)
      setError(null)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el inventario')
    } finally {
      setLoading(false)
    }
  }, [projectId, params])

  useEffect(() => { load() }, [load])
  useEffect(() => { setAutoTried(false) }, [projectId])

  const refresh = useCallback(async (force) => {
    setRefreshing(true)
    try {
      await api.post(`/contenido/projects/${projectId}/seo/refresh`, { force })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron actualizar las métricas')
    } finally {
      setRefreshing(false)
    }
  }, [projectId, load])

  // Primer refresco: si hay notas y Search Console conectado pero los datos
  // nunca se trajeron (o ya tienen un día), se piden solos — nadie debería
  // tener que apretar "Actualizar" para ver una tabla por primera vez.
  useEffect(() => {
    if (autoTried || !data || refreshing || !canEdit) return
    if (data.searchConsole !== 'active' || data.pieces.length === 0) return
    const stale = !data.lastSyncAt || Date.now() - new Date(data.lastSyncAt).getTime() > AUTO_REFRESH_AFTER_MS
    if (!stale) return
    setAutoTried(true)
    refresh(false)
  }, [data, autoTried, refreshing, canEdit, refresh])

  const rows = data?.pieces ?? []

  function patchFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }))
  }

  return (
    <div>
      {/* ── Encabezado: período, último refresco y acciones ── */}
      <div className="mb-3 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {rows.length} {rows.length === 1 ? 'nota publicada' : 'notas publicadas'}
            {data?.counts?.withAlerts > 0 && (
              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                · {data.counts.withAlerts} con alertas
              </span>
            )}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {data?.period
              ? `Search Console · ${data.period.start} a ${data.period.end}`
              : 'Sin datos de Search Console todavía'}
            {data?.lastSyncAt && ` · actualizado ${new Date(data.lastSyncAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`}
          </p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => refresh(true)}
              disabled={refreshing || data?.searchConsole !== 'active'}
              title={data?.searchConsole !== 'active'
                ? 'Requiere Search Console conectado en el proyecto'
                : 'Vuelve a pedirle los datos a Search Console'}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <Icon as={RefreshCw} size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Actualizando…' : 'Actualizar'}
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white inline-flex items-center gap-1.5"
            >
              <Icon as={Download} size={14} />
              Importar del sitio
            </button>
          </div>
        )}
      </div>

      {data?.searchConsole && data.searchConsole !== 'active' && (
        <p className="mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
          {data.searchConsole === 'missing'
            ? 'Search Console no está conectado en este proyecto: el inventario lista las notas pero no puede medirlas. Se conecta desde la ficha del proyecto → Ajustes.'
            : 'La conexión con Search Console está vencida. Reconectala desde la ficha del proyecto → Ajustes para volver a medir las notas.'}
        </p>
      )}

      {/* ── Filtros ── */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Icon as={Search} size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={filters.q}
            onChange={e => patchFilter('q', e.target.value)}
            placeholder="Buscar por título, URL o keyword…"
            className={`${INPUT} pl-8 w-64`}
          />
        </div>
        <select value={filters.language} onChange={e => patchFilter('language', e.target.value)} className={INPUT}>
          <option value="">Todos los idiomas</option>
          {CONTENT_LANGUAGES.map(l => (
            <option key={l.key} value={l.key}>
              {l.label}{data?.counts?.byLanguage?.[l.key] ? ` (${data.counts.byLanguage[l.key]})` : ''}
            </option>
          ))}
          <option value="none">Sin idioma{data?.counts?.byLanguage?.none ? ` (${data.counts.byLanguage.none})` : ''}</option>
        </select>
        <select value={filters.status} onChange={e => patchFilter('status', e.target.value)} className={INPUT}>
          <option value="">Todos los estados</option>
          {CONTENT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={filters.trend} onChange={e => patchFilter('trend', e.target.value)} className={INPUT}>
          <option value="">Toda tendencia</option>
          {TRENDS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={filters.alert === '1'}
            onChange={e => patchFilter('alert', e.target.checked ? '1' : '')}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Sólo con alertas
        </label>
        <div className="flex items-center gap-1.5 ml-auto">
          <select value={sort} onChange={e => setSort(e.target.value)} className={INPUT}>
            {SORTS.map(s => <option key={s.id} value={s.id}>Ordenar por {s.label.toLowerCase()}</option>)}
          </select>
          <button
            onClick={() => setDir(d => (d === 'desc' ? 'asc' : 'desc'))}
            title={dir === 'desc' ? 'De mayor a menor' : 'De menor a mayor'}
            className="px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
          >
            {dir === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {loading && !data ? (
        <div className="py-16"><LoadingSpinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {Object.values(filters).some(Boolean) ? 'Ninguna nota coincide con los filtros' : 'Todavía no hay notas con URL publicada'}
          </h3>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-md mx-auto">
            Una pieza entra al inventario cuando tiene su URL cargada. Si el blog ya está publicado,
            importalo del sitio en vez de cargarlo a mano.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-xs text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Nota</th>
                  <th className="text-left font-medium px-3 py-2 hidden lg:table-cell">Keyword</th>
                  <th className="text-right font-medium px-3 py-2">Clics</th>
                  <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">Impr.</th>
                  <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">CTR</th>
                  <th className="text-right font-medium px-3 py-2">Pos.</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map(row => <InventoryRow key={row.id} row={row} onOpen={onOpen} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {importOpen && (
        <ContentImportModal
          projectId={projectId}
          onClose={() => setImportOpen(false)}
          onImported={() => { load(); onImported?.() }}
        />
      )}
    </div>
  )
}

function InventoryRow({ row, onOpen }) {
  const seo = row.seo
  const TrendIcon = TREND_ICON[row.trend]
  const alerts = seo?.alerts ?? []
  const worst = alerts.find(a => a.severity === 'critical') ?? alerts[0] ?? null

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => onOpen(row)}>
      <td className="px-3 py-2 max-w-xs">
        <div className="flex items-start gap-1.5">
          {TrendIcon && (
            <Icon as={TrendIcon} size={14} className={`mt-0.5 flex-shrink-0 ${TREND_CLASS[row.trend]}`} />
          )}
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{row.title}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {row.language && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                  {languageMeta(row.language)?.short}
                </span>
              )}
              {row.status !== 'publicado' && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusBadgeClass(row.status)}`}>{row.statusLabel}</span>
              )}
              {row.translations.length > 0 && (
                <span
                  className="text-[10px] text-gray-400 inline-flex items-center gap-0.5"
                  title={row.translations.map(t => `${languageMeta(t.language)?.short ?? '—'}: ${t.title}`).join('\n')}
                >
                  <Icon as={Link2} size={10} />
                  {row.translations.map(t => languageMeta(t.language)?.short ?? '?').join(' ')}
                </span>
              )}
              {row.publishedUrl && (
                <a
                  href={row.publishedUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-[10px] text-gray-400 hover:text-primary-600 inline-flex items-center gap-0.5"
                  title={row.publishedUrl}
                >
                  <Icon as={ExternalLink} size={10} />
                  ver
                </a>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 hidden lg:table-cell max-w-[12rem]">
        {row.seoKeyword
          ? <span className="text-xs text-gray-600 dark:text-gray-300 truncate block">{row.seoKeyword}</span>
          : <span className="text-xs text-gray-300 dark:text-gray-600">sin keyword</span>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {seo ? num(seo.clicks) : '—'}
        {seo && <Delta value={seo.delta.clicks} />}
      </td>
      <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">
        {seo ? num(seo.impressions) : '—'}
        {seo && <Delta value={seo.delta.impressions} />}
      </td>
      <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">
        {seo ? `${(seo.ctr * 100).toFixed(1)}%` : '—'}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {seo?.position ? seo.position.toFixed(1) : '—'}
        {seo && <Delta value={seo.delta.position} suffix="" />}
      </td>
      <td className="px-3 py-2">
        {worst && (
          <span
            title={alerts.map(a => a.message).join('\n\n')}
            className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full ${
              worst.severity === 'critical'
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                : worst.severity === 'warning'
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
          >
            <Icon as={AlertTriangle} size={10} />
            {alerts.length}
          </span>
        )}
      </td>
    </tr>
  )
}
