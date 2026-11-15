import { useState } from 'react'
import api from '../../../api/client'
import { typeMeta, shortHost } from './enlacesHelpers'

// El body viaja por express.json, que corta en 1 MB. Avisamos antes de mandarlo
// para no cambiar un error claro por un 413 sin contexto.
const MAX_BYTES = 1_000_000

const FORMATS = [
  { value: 'auto',    label: 'Detectar automáticamente' },
  { value: 'ahrefs',  label: 'Ahrefs (export de Backlinks)' },
  { value: 'semrush', label: 'Semrush (export de Backlinks)' },
  { value: 'gsc',     label: 'Search Console (reporte de Enlaces)' },
]

const SKIP_LABEL = {
  ya_cargada:             'ya estaba cargada',
  repetida_en_el_archivo: 'repetida dentro del archivo',
  sin_url:                'sin URL de origen',
  url_invalida:           'la URL no se pudo leer',
  tope:                   'quedó fuera del tope de filas',
}

/**
 * Importación en dos pasos: "Previsualizar" muestra exactamente lo que va a pasar
 * sin escribir nada, y recién después se confirma. Mismo flujo que el import del
 * inventario del blog — ver un export con 400 filas entrar a ciegas es justo lo
 * que nadie quiere hacer dos veces.
 */
export default function BacklinkImportModal({ projectId, onClose, onImported }) {
  const [csv,     setCsv]     = useState('')
  const [format,  setFormat]  = useState('auto')
  const [preview, setPreview] = useState(null)
  const [done,    setDone]    = useState(null)
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState(null)
  const [fileName, setFileName] = useState(null)

  const tooBig = new Blob([csv]).size > MAX_BYTES

  function readFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      setCsv(String(reader.result || ''))
      setPreview(null)
      setError(null)
    }
    reader.readAsText(file)
  }

  async function run(dryRun) {
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post(`/marketing/projects/${projectId}/backlinks/import`, { csv, format, dryRun })
      if (dryRun) setPreview(data)
      else {
        setDone(data)
        onImported?.()
      }
    } catch (err) {
      const d = err.response?.data
      setError(d?.error ?? 'No se pudo procesar el archivo.')
      // Los encabezados que vinieron ayudan a entender por qué no se reconoció.
      if (d?.unmappedHeaders?.length) {
        setError(`${d.error} Columnas encontradas: ${d.unmappedHeaders.slice(0, 8).join(', ')}.`)
      }
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">

        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Importar enlaces desde un CSV</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Exportá los backlinks desde Ahrefs, Semrush o el reporte de Enlaces de Search Console y pegá el archivo acá.
          </p>
        </div>

        {done ? (
          <ImportResult result={done} onClose={onClose} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Formato</span>
                <select value={format} onChange={e => { setFormat(e.target.value); setPreview(null) }}
                  className="mt-1 w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100">
                  {FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Archivo</span>
                <input type="file" accept=".csv,text/csv,text/plain" onChange={readFile}
                  className="mt-1 w-full text-xs text-gray-600 dark:text-gray-300 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-200" />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Contenido del CSV {fileName && <span className="text-gray-400">· {fileName}</span>}
              </span>
              <textarea rows={6} value={csv} onChange={e => { setCsv(e.target.value); setPreview(null) }}
                placeholder={'Referring page URL,Target URL,Anchor,Domain rating\nhttps://diario.com/nota,https://cliente.com/x,la agencia,62'}
                className="mt-1 w-full px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100" />
            </label>

            {tooBig && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                El archivo es muy grande. Filtralo en la herramienta antes de exportar — por ejemplo, sólo los enlaces follow o los de DR mayor a 20.
              </p>
            )}
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

            {preview && <PreviewPanel preview={preview} />}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={() => run(true)} disabled={busy || !csv.trim() || tooBig}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 transition-colors">
                {busy && !preview ? 'Leyendo…' : 'Previsualizar'}
              </button>
              <button type="button" onClick={() => run(false)} disabled={busy || !preview || !preview.createdCount}
                title={!preview ? 'Previsualizá primero para ver qué va a entrar' : ''}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors">
                {busy && preview ? 'Importando…' : preview ? `Importar ${preview.createdCount}` : 'Importar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PreviewPanel({ preview }) {
  const { format, createdCount, read, skippedCount, skipped = [], created = [], unmappedHeaders = [] } = preview
  const notVerifiable = created.filter(r => !r.verifiable).length

  return (
    <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
          Entran {createdCount} de {read} fila(s)
        </p>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Formato detectado: {FORMATS.find(f => f.value === format)?.label || format}
        </span>
      </div>

      {createdCount === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Ninguna fila nueva. {skippedCount > 0 && 'Puede que este archivo ya se haya importado antes.'}
        </p>
      )}

      {notVerifiable > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {notVerifiable} vienen agregadas por dominio (el reporte de Search Console no trae la URL de la página),
          así que quedan fuera de la verificación automática hasta que alguien complete la URL real.
        </p>
      )}

      {created.length > 0 && (
        <div className="max-h-40 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
          {created.map((r, i) => (
            <div key={i} className="py-1.5 flex items-center gap-2 text-xs">
              <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">{shortHost(r.sourceUrl)}</span>
              {r.anchor && <span className="hidden sm:inline truncate max-w-[12rem] text-gray-400 dark:text-gray-500">«{r.anchor}»</span>}
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${typeMeta(r.linkType).chip}`}>
                {typeMeta(r.linkType).label}
              </span>
              <span className="shrink-0 w-8 text-right text-gray-500 dark:text-gray-400">{r.domainRating ?? '—'}</span>
            </div>
          ))}
        </div>
      )}

      {skippedCount > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-gray-400">
            {skippedCount} fila(s) no entran — ver por qué
          </summary>
          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
            {skipped.map((s, i) => (
              <p key={i} className="text-gray-400 dark:text-gray-500 truncate">
                {s.line ? `Línea ${s.line}: ` : ''}{SKIP_LABEL[s.reason] || s.reason}
                {s.value && <span className="text-gray-300 dark:text-gray-600"> · {s.value}</span>}
              </p>
            ))}
          </div>
        </details>
      )}

      {unmappedHeaders.length > 0 && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          Columnas que no leímos: {unmappedHeaders.slice(0, 6).join(', ')}.
        </p>
      )}
    </div>
  )
}

function ImportResult({ result, onClose }) {
  return (
    <div className="space-y-3">
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
          Se importaron {result.createdCount} enlace(s).
        </p>
        {result.skippedCount > 0 && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
            {result.skippedCount} se saltearon (repetidas o ya cargadas).
          </p>
        )}
        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
          La verificación corre sola los lunes, o podés dispararla ahora con "Verificar enlaces".
        </p>
      </div>
      <div className="flex justify-end">
        <button onClick={onClose}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors">
          Listo
        </button>
      </div>
    </div>
  )
}
