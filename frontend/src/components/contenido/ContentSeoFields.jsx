import { useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import useDebouncedCommit from './useDebouncedCommit'
import { CONTENT_LANGUAGES, languageMeta } from './contentCatalog'
import { ExternalLink, Link2, Plus, Search, TrendingDown, TrendingUp, X } from 'lucide-react'
import { Icon } from '../ui/Icon'

const LABEL = 'text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block'
const INPUT = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 disabled:opacity-60 disabled:cursor-not-allowed'

const ALERT_STYLE = {
  critical: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
  warning:  'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
  info:     'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400',
}

function fmtPct(value) {
  if (value == null) return null
  return `${value > 0 ? '+' : ''}${value}%`
}

/** Variación con su signo y su color. Sin período anterior no se muestra nada. */
function Delta({ value, suffix = '%', invert = false }) {
  if (value == null) return null
  const good = invert ? value < 0 : value > 0
  const neutral = value === 0
  const Arrow = good ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
      neutral ? 'text-gray-400' : good ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
      {!neutral && <Icon as={Arrow} size={11} />}
      {suffix === '%' ? fmtPct(value) : `${value > 0 ? '+' : ''}${value}`}
    </span>
  )
}

function Metric({ label, value, delta, deltaSuffix, invert }) {
  return (
    <div className="px-2.5 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
      <p className="text-[11px] text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-baseline gap-1.5">
        {value}
        <Delta value={delta} suffix={deltaSuffix} invert={invert} />
      </p>
    </div>
  )
}

/**
 * Datos SEO de una nota: su URL publicada, idioma, keywords y las otras
 * versiones de la misma nota en otros idiomas — más lo que Search Console dice
 * de esa URL, si el inventario ya se refrescó.
 *
 * Se muestra sólo cuando la pieza es (o puede ser) una nota del blog: en una
 * story de Instagram estos campos son ruido. El criterio es amplio a propósito
 * — alcanza con que ya tenga algún dato cargado — para que una pieza no quede
 * con una URL invisible por haberle sacado la red "blog".
 */
export default function ContentSeoFields({ piece, canEdit, onUpdate, onPieceChanged }) {
  const [publishedUrl, setPublishedUrl] = useDebouncedCommit(
    piece.publishedUrl ?? '', v => onUpdate(piece.id, { publishedUrl: v.trim() || null }),
  )
  const [seoKeyword, setSeoKeyword] = useDebouncedCommit(
    piece.seoKeyword ?? '', v => onUpdate(piece.id, { seoKeyword: v.trim() || null }),
  )
  const [newKeyword, setNewKeyword] = useState('')

  const secondary = piece.seoKeywords ?? []

  function addKeyword(e) {
    e.preventDefault()
    const value = newKeyword.trim()
    if (!value || secondary.includes(value)) { setNewKeyword(''); return }
    onUpdate(piece.id, { seoKeywords: [...secondary, value] })
    setNewKeyword('')
  }

  function removeKeyword(kw) {
    onUpdate(piece.id, { seoKeywords: secondary.filter(k => k !== kw) })
  }

  const seo = piece.seo
  const translations = piece.translations ?? []

  return (
    <div className="sm:col-span-2 rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-3">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
        SEO <span className="font-normal italic text-gray-400">(para notas del blog — habilita el inventario y el cruce con Search Console)</span>
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={LABEL}>URL publicada</label>
          <div className="flex gap-1.5">
            <input
              value={publishedUrl}
              onChange={e => setPublishedUrl(e.target.value)}
              disabled={!canEdit}
              placeholder="https://sitio.com/blog/mi-nota"
              className={INPUT}
            />
            {piece.publishedUrl && (
              <a
                href={piece.publishedUrl}
                target="_blank"
                rel="noreferrer"
                title="Abrir la nota"
                className="flex-shrink-0 px-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-primary-600 flex items-center"
              >
                <Icon as={ExternalLink} size={14} />
              </a>
            )}
          </div>
        </div>

        <div>
          <label className={LABEL}>Idioma</label>
          <select
            value={piece.language ?? ''}
            onChange={e => onUpdate(piece.id, { language: e.target.value || null })}
            disabled={!canEdit}
            className={INPUT}
          >
            <option value="">Sin definir</option>
            {CONTENT_LANGUAGES.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </div>

        <div>
          <label className={LABEL}>Keyword principal</label>
          <input
            value={seoKeyword}
            onChange={e => setSeoKeyword(e.target.value)}
            disabled={!canEdit}
            placeholder="alquiler de autos en mendoza"
            className={INPUT}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL}>Keywords secundarias</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {secondary.map(kw => (
              <span key={kw} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                {kw}
                {canEdit && (
                  <button onClick={() => removeKeyword(kw)} className="text-gray-400 hover:text-red-500" title="Quitar">
                    <Icon as={X} size={12} />
                  </button>
                )}
              </span>
            ))}
            {secondary.length === 0 && <span className="text-xs text-gray-400">Ninguna todavía.</span>}
          </div>
          {canEdit && secondary.length < 10 && (
            <form onSubmit={addKeyword} className="flex gap-1.5">
              <input
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                placeholder="Agregar keyword…"
                className={INPUT}
              />
              <button type="submit" disabled={!newKeyword.trim()} className="flex-shrink-0 px-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-primary-600 disabled:opacity-40">
                <Icon as={Plus} size={14} />
              </button>
            </form>
          )}
        </div>
      </div>

      <TranslationLinks
        piece={piece}
        translations={translations}
        canEdit={canEdit}
        onPieceChanged={onPieceChanged}
      />

      {seo && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Search Console · {seo.periodStart} a {seo.periodEnd}
            {!seo.matched && <span className="ml-1 text-amber-600 dark:text-amber-400">· esta URL no aparece en los datos del sitio</span>}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric label="Clics"       value={seo.clicks}      delta={seo.delta.clicks} />
            <Metric label="Impresiones" value={seo.impressions} delta={seo.delta.impressions} />
            <Metric label="CTR"         value={`${(seo.ctr * 100).toFixed(1)}%`} />
            {/* La posición mejora cuando el número baja: el delta ya viene con
                el signo dado vuelta desde el backend, así que acá "+2" es mejor. */}
            <Metric label="Posición"    value={seo.position ? seo.position.toFixed(1) : '—'} delta={seo.delta.position} deltaSuffix="pos" />
          </div>

          {seo.alerts.length > 0 && (
            <div className="space-y-1.5">
              {seo.alerts.map((a, i) => (
                <p key={i} className={`text-xs px-2.5 py-1.5 rounded-lg border ${ALERT_STYLE[a.severity] || ALERT_STYLE.info}`}>
                  {a.message}
                </p>
              ))}
            </div>
          )}

          {seo.topQueries.length > 0 && (
            <div>
              <p className={LABEL}>Consultas principales</p>
              <div className="space-y-1">
                {seo.topQueries.map(q => (
                  <div key={q.query} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-gray-700 dark:text-gray-300">{q.query}</span>
                    <span className="flex-shrink-0 text-gray-400 tabular-nums">
                      {q.clicks} clics · {q.impressions} impr. · pos. {q.position.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Las otras versiones de la MISMA nota. Se buscan por título entre las piezas
 * del proyecto en vez de ofrecer un desplegable con todas: un blog con 65 notas
 * hace de ese desplegable algo inusable, y la traducción se busca por su nombre.
 */
function TranslationLinks({ piece, translations, canEdit, onPieceChanged }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const linkedIds = useMemo(
    () => new Set([piece.id, ...translations.map(t => t.id)]),
    [piece.id, translations],
  )

  const search = useCallback(async (term) => {
    if (!term.trim()) { setResults([]); return }
    try {
      const r = await api.get(`/contenido/projects/${piece.projectId}/pieces`, {
        params: { q: term.trim(), take: 8, status: 'publicado,programado,aprobado,produccion,idea,revision,aprobacion,cambios' },
      })
      setResults(r.data.pieces.filter(p => !linkedIds.has(p.id)))
    } catch { setResults([]) }
  }, [piece.projectId, linkedIds])

  // Saltar a la traducción cambia el `?piece=` de la URL, igual que abrir una
  // pieza desde cualquier vista: la página ya reacciona a ese parámetro. Un
  // <a href> con el query string recargaría toda la app.
  function openPiece(id) {
    const next = new URLSearchParams(searchParams)
    next.set('piece', String(id))
    setSearchParams(next, { replace: true })
  }

  async function link(otherId) {
    setBusy(true); setError(null)
    try {
      await api.post(`/contenido/projects/${piece.projectId}/pieces/${piece.id}/translations`, { pieceId: otherId })
      setOpen(false); setQ(''); setResults([])
      onPieceChanged()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo vincular')
    } finally { setBusy(false) }
  }

  async function unlink() {
    setBusy(true); setError(null)
    try {
      await api.delete(`/contenido/projects/${piece.projectId}/pieces/${piece.id}/translations`)
      onPieceChanged()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo desvincular')
    } finally { setBusy(false) }
  }

  return (
    <div>
      <label className={LABEL}>Traducciones <span className="italic text-gray-400">(la misma nota en otro idioma)</span></label>

      <div className="flex flex-wrap items-center gap-1.5">
        {translations.map(t => (
          <button
            key={t.id}
            onClick={() => openPiece(t.id)}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 hover:underline"
            title={t.publishedUrl || t.title}
          >
            <Icon as={Link2} size={11} />
            {languageMeta(t.language)?.short ?? '—'} · {t.title}
          </button>
        ))}
        {translations.length === 0 && <span className="text-xs text-gray-400">Sin vincular.</span>}

        {canEdit && (
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs px-2 py-1 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:text-primary-600"
          >
            + Vincular
          </button>
        )}
        {canEdit && translations.length > 0 && (
          <button onClick={unlink} disabled={busy} className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40">
            Desvincular esta
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2">
          <div className="flex items-center gap-1.5">
            <Icon as={Search} size={14} className="text-gray-400" />
            <input
              autoFocus
              value={q}
              onChange={e => { setQ(e.target.value); search(e.target.value) }}
              placeholder="Buscar la otra versión por título…"
              className={INPUT}
            />
          </div>
          {results.length > 0 && (
            <div className="mt-1.5 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 max-h-48 overflow-y-auto">
              {results.map(r => (
                <button
                  key={r.id}
                  onClick={() => link(r.id)}
                  disabled={busy}
                  className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-40"
                >
                  <span className="text-gray-400 mr-1">{languageMeta(r.language)?.short ?? '—'}</span>
                  {r.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
