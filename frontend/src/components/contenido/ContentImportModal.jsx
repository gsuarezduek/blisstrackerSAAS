import { useState } from 'react'
import api from '../../api/client'
import { CONTENT_LANGUAGES, languageMeta } from './contentCatalog'
import { X } from 'lucide-react'
import { Icon } from '../ui/Icon'

const LABEL = 'text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block'
const INPUT = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100'

const SOURCES = [
  {
    id: 'wordpress',
    label: 'WordPress',
    hint: 'Lee /wp-json/wp/v2/posts. Trae el título y la fecha reales de cada entrada, y el idioma si el sitio usa Polylang. Es la opción recomendada si el sitio es WordPress.',
  },
  {
    id: 'sitemap',
    label: 'Sitemap',
    hint: 'Sirve con cualquier CMS, pero sólo trae URLs: el título sale del slug y el idioma, del prefijo de la ruta. Conviene filtrar por "/blog/" para no traer las páginas del sitio.',
  },
]

/**
 * Importación inicial del blog. Siempre en dos pasos: primero se previsualiza
 * (`dryRun`) y recién después se crea. Una importación crea decenas de piezas de
 * una sola vez — mostrar antes qué va a entrar es la diferencia entre poder
 * ajustar el filtro y tener que borrar 300 filas a mano.
 */
export default function ContentImportModal({ projectId, onClose, onImported }) {
  const [source, setSource] = useState('wordpress')
  const [url, setUrl] = useState('')
  const [filter, setFilter] = useState('')
  const [defaultLanguage, setDefaultLanguage] = useState('es')
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const body = { source, url: url.trim() || undefined, filter: filter.trim() || undefined, defaultLanguage }

  async function run(dryRun) {
    setBusy(true); setError(null)
    try {
      const r = await api.post(`/contenido/projects/${projectId}/seo/import`, { ...body, dryRun })
      if (dryRun) setPreview(r.data)
      else { setResult(r.data); setPreview(null); onImported?.() }
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo leer el sitio')
    } finally {
      setBusy(false)
    }
  }

  const sourceMeta = SOURCES.find(s => s.id === source)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Importar notas del sitio</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <Icon as={X} size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {result ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Se crearon <strong>{result.created.length}</strong> {result.created.length === 1 ? 'nota' : 'notas'} como
                publicadas, con su URL, fecha e idioma.
                {result.skippedCount > 0 && ` ${result.skippedCount} se saltearon (ya estaban cargadas).`}
                {result.linkedGroups > 0 && ` ${result.linkedGroups} quedaron vinculadas entre sus traducciones.`}
              </p>
              <p className="text-xs text-gray-400">
                Lo que falta cargarle a cada nota es la keyword. Las métricas de Search Console se traen con
                «Actualizar» en el inventario.
              </p>
              <button
                onClick={onClose}
                className="w-full px-3 py-2 rounded-lg text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white"
              >
                Listo
              </button>
            </div>
          ) : (
            <>
              <div>
                <label className={LABEL}>De dónde</label>
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-900 rounded-lg p-1">
                  {SOURCES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSource(s.id); setPreview(null) }}
                      className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        source === s.id
                          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400'}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">{sourceMeta.hint}</p>
              </div>

              <div>
                <label className={LABEL}>
                  {source === 'wordpress' ? 'Sitio' : 'Sitemap'}
                  <span className="italic text-gray-400 font-normal"> (opcional — por defecto, el sitio del proyecto)</span>
                </label>
                <input
                  value={url}
                  onChange={e => { setUrl(e.target.value); setPreview(null) }}
                  placeholder={source === 'wordpress' ? 'https://sitio.com' : 'https://sitio.com/sitemap.xml'}
                  className={INPUT}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Sólo URLs que contengan</label>
                  <input
                    value={filter}
                    onChange={e => { setFilter(e.target.value); setPreview(null) }}
                    placeholder="/blog/"
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>Idioma de las URLs sin prefijo</label>
                  <select
                    value={defaultLanguage}
                    onChange={e => { setDefaultLanguage(e.target.value); setPreview(null) }}
                    className={INPUT}
                  >
                    {CONTENT_LANGUAGES.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2">
                Las notas en <code>/en/</code> o <code>/pt/</code> se detectan por la ruta; las que no llevan prefijo
                son del idioma principal del sitio.
              </p>

              {error && (
                <p className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                  {error}
                </p>
              )}

              {preview && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/40 text-xs text-gray-600 dark:text-gray-300">
                    {preview.created.length === 0
                      ? 'No hay nada nuevo para importar.'
                      : `Se van a crear ${preview.created.length} ${preview.created.length === 1 ? 'nota' : 'notas'}.`}
                    {preview.skippedCount > 0 && ` ${preview.skippedCount} ya estaban cargadas.`}
                    {' '}Se leyeron {preview.total} entradas del sitio.
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                    {preview.created.slice(0, 50).map(c => (
                      <div key={c.url} className="px-3 py-1.5">
                        <p className="text-xs text-gray-700 dark:text-gray-300 truncate">
                          <span className="text-gray-400 mr-1">{languageMeta(c.language)?.short ?? '—'}</span>
                          {c.title}
                        </p>
                        <p className="text-[11px] text-gray-400 truncate">{c.url}</p>
                      </div>
                    ))}
                    {preview.created.length > 50 && (
                      <p className="px-3 py-1.5 text-[11px] text-gray-400">
                        …y {preview.created.length - 50} más.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => run(true)}
                  disabled={busy}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                >
                  {busy && !preview ? 'Leyendo el sitio…' : 'Previsualizar'}
                </button>
                <button
                  onClick={() => run(false)}
                  disabled={busy || !preview || preview.created.length === 0}
                  title={!preview ? 'Previsualizá primero' : undefined}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy && preview ? 'Importando…' : 'Importar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
