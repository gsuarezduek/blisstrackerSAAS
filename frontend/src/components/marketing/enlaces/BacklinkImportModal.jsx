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
 *
 * El `target` cambia qué significa el archivo, no sólo dónde se guarda: como
 * enlaces propios, una fila es una página que hay que poder verificar; como
 * competencia, las filas se AGRUPAN POR DOMINIO, porque la decisión de si podemos
 * conseguir un enlace se toma una vez por sitio y un export trae miles de filas de
 * página para esa única decisión.
 */
export default function BacklinkImportModal({ projectId, target = 'own', onClose, onImported }) {
  const [csv,     setCsv]     = useState('')
  const [format,  setFormat]  = useState('auto')
  const [preview, setPreview] = useState(null)
  const [done,    setDone]    = useState(null)
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState(null)
  const [fileName, setFileName] = useState(null)
  const [competitorDomain, setCompetitorDomain] = useState('')

  const toProspects = target === 'prospects'

  const tooBig = new Blob([csv]).size > MAX_BYTES
  // Cuántas filas va a tocar el import. Con destino competencia, un dominio que ya
  // estaba NO es un no-op: se le suma la evidencia de este competidor, y bloquear
  // el botón por `createdCount: 0` impediría justamente el caso más valioso (el
  // medio que enlaza a dos competidores).
  const willWrite = (preview?.createdCount ?? 0) + (toProspects ? (preview?.mergedCount ?? 0) : 0)

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
      const { data } = await api.post(`/marketing/projects/${projectId}/backlinks/import`, {
        csv, format, target, dryRun,
        competitorDomain: toProspects ? (competitorDomain || null) : null,
      })
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
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            {toProspects ? 'Importar los backlinks de un competidor' : 'Importar enlaces desde un CSV'}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {toProspects
              ? 'Exportá los backlinks del competidor desde Ahrefs o Semrush. Las filas se agrupan por sitio: un dominio con 40 páginas enlazando es una sola decisión.'
              : 'Exportá los backlinks desde Ahrefs, Semrush o el reporte de Enlaces de Search Console y pegá el archivo acá.'}
          </p>
        </div>

        {done ? (
          <ImportResult result={done} toProspects={toProspects} onClose={onClose} />
        ) : (
          <>
            {toProspects && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">¿De qué competidor es este export?</span>
                <input value={competitorDomain} onChange={e => { setCompetitorDomain(e.target.value); setPreview(null) }}
                  placeholder="competidor.com"
                  className="mt-1 w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100" />
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  Sin esto los dominios entran igual, pero sin la evidencia de a quién enlazan. Re-importar el mismo
                  archivo del mismo competidor no duplica nada.
                </span>
              </label>
            )}
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

            {preview && <PreviewPanel preview={preview} toProspects={toProspects} />}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={() => run(true)} disabled={busy || !csv.trim() || tooBig}
                className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 transition-colors">
                {busy && !preview ? 'Leyendo…' : 'Previsualizar'}
              </button>
              <button type="button" onClick={() => run(false)} disabled={busy || !preview || !willWrite}
                title={!preview ? 'Previsualizá primero para ver qué va a entrar' : ''}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors">
                {busy && preview ? 'Importando…' : preview ? `Importar ${willWrite}` : 'Importar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PreviewPanel({ preview, toProspects }) {
  const {
    format, createdCount, mergedCount = 0, read, domains,
    skippedCount, skipped = [], created = [], unmappedHeaders = [],
  } = preview
  const notVerifiable = created.filter(r => !r.verifiable).length

  return (
    <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
          {toProspects
            // Las dos cifras son la información: "40 filas se volvieron 12 sitios"
            // es lo que explica por qué el número no coincide con el del archivo.
            ? <>{read} fila(s) → {domains} sitio(s): {createdCount} nuevo(s){mergedCount > 0 && <> y {mergedCount} que ya estaban</>}</>
            : <>Entran {createdCount} de {read} fila(s)</>}
        </p>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Formato detectado: {FORMATS.find(f => f.value === format)?.label || format}
        </span>
      </div>

      {createdCount === 0 && mergedCount === 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Ninguna fila nueva. {skippedCount > 0 && 'Puede que este archivo ya se haya importado antes.'}
        </p>
      )}

      {toProspects && mergedCount > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          A los {mergedCount} que ya estaban se les suma la evidencia de este competidor. Su veredicto y su pipeline
          no se tocan.
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
          {created.map((r, i) => toProspects ? (
            <div key={i} className="py-1.5 flex items-center gap-2 text-xs">
              <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">{r.domain}</span>
              {r.merge && <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">ya estaba</span>}
              <span className="shrink-0 w-14 text-right text-gray-500 dark:text-gray-400">{r.links} enlace(s)</span>
              <span className="shrink-0 w-8 text-right text-gray-500 dark:text-gray-400">{r.domainRating ?? '—'}</span>
            </div>
          ) : (
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

function ImportResult({ result, toProspects, onClose }) {
  return (
    <div className="space-y-3">
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4">
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
          {toProspects
            ? <>Se cargaron {result.createdCount} sitio(s) nuevo(s){result.mergedCount > 0 && <> y se actualizaron {result.mergedCount}</>}.</>
            : <>Se importaron {result.createdCount} enlace(s).</>}
        </p>
        {result.skippedCount > 0 && (
          <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
            {result.skippedCount} se saltearon (repetidas o ya cargadas).
          </p>
        )}
        <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
          {toProspects
            ? 'Los que ya nos enlazan quedaron marcados "Ya lo tenemos" solos.'
            : 'La verificación corre sola los lunes, o podés dispararla ahora con "Verificar enlaces".'}
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
