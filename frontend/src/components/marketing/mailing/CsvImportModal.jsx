// Importar contactos desde un CSV: elegir archivo → mapear columnas → vista
// previa (dryRun en el backend) → confirmar con la declaración de consentimiento.
// Se manda en tandas de 2000 filas (el body corta en 1 MB).
import { useState } from 'react'
import api from '../../../api/client'
import { Modal, Field, inputCls, btnPrimary, btnSecondary, ErrorNote, WarnNote, apiError, fmtInt } from './ui'
import { readCsvFile, guessMapping, mapRows, fieldKey } from './csv'

const CHUNK = 2000
const TARGETS = [
  { key: 'email', label: 'Email' },
  { key: 'firstName', label: 'Nombre' },
  { key: 'lastName', label: 'Apellido' },
  { key: 'field', label: 'Variable personalizada' },
  { key: 'skip', label: 'No importar' },
]

function sumSummaries(list) {
  const keys = ['total', 'valid', 'new', 'existing', 'suppressed', 'duplicatesInFile', 'invalidCount', 'created', 'updated']
  const out = Object.fromEntries(keys.map(k => [k, 0]))
  for (const s of list) for (const k of keys) out[k] += s[k] || 0
  out.invalid = list.flatMap(s => s.invalid || []).slice(0, 20)
  return out
}

export default function CsvImportModal({ base, lists, defaultListId, onClose, onDone }) {
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [mapping, setMapping] = useState([])
  const [listIds, setListIds] = useState(defaultListId ? [defaultListId] : [])
  const [preview, setPreview] = useState(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function onFile(f) {
    setError(''); setPreview(null); setFile(f)
    if (!f) return
    try {
      const p = await readCsvFile(f)
      setParsed(p); setMapping(guessMapping(p.headers))
    } catch (err) { setError(err.message) }
  }

  const hasEmail = mapping.includes('email')
  const rows = parsed && hasEmail ? mapRows(parsed.rows, parsed.headers, mapping) : []

  async function run(dryRun) {
    setBusy(dryRun ? 'preview' : 'import'); setError('')
    try {
      const summaries = []
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { data } = await api.post(`${base}/contacts/import`, { rows: rows.slice(i, i + CHUNK), listIds, dryRun, consent })
        summaries.push(data)
      }
      const s = sumSummaries(summaries)
      if (dryRun) setPreview(s)
      else { setResult(s); onDone?.() }
    } catch (err) {
      setError(apiError(err, 'No se pudo importar'))
    } finally { setBusy('') }
  }

  const toggleList = id => setListIds(ls => ls.includes(id) ? ls.filter(x => x !== id) : [...ls, id])

  if (result) {
    return (
      <Modal title="Importación terminada" onClose={onClose} footer={<button className={btnPrimary} onClick={onClose}>Listo</button>}>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Se crearon <b>{fmtInt(result.created)}</b> contactos nuevos y se actualizaron <b>{fmtInt(result.updated)}</b>.
          {result.invalidCount > 0 && <> {fmtInt(result.invalidCount)} filas tenían un email inválido y quedaron afuera.</>}
        </p>
      </Modal>
    )
  }

  return (
    <Modal wide title="Importar contactos desde CSV" onClose={onClose}
      footer={<>
        <button className={btnSecondary} onClick={onClose}>Cancelar</button>
        {!preview
          ? <button className={btnPrimary} disabled={!rows.length || !!busy} onClick={() => run(true)}>{busy ? 'Revisando…' : 'Revisar'}</button>
          : <button className={btnPrimary} disabled={!consent || !!busy} onClick={() => run(false)}>{busy ? 'Importando…' : `Importar ${fmtInt(preview.valid)} contactos`}</button>}
      </>}>
      <div className="space-y-4">
        <Field label="Archivo" hint="CSV exportado de Excel, Google Sheets, otro proveedor de mailing o un CRM. La primera fila tiene que ser la de encabezados.">
          <input type="file" accept=".csv,text/csv" onChange={e => onFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 dark:file:bg-gray-700 file:px-3 file:py-1.5 file:text-sm" />
        </Field>

        {parsed && (
          <>
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Columnas ({fmtInt(parsed.rows.length)} filas en {file?.name})
              </p>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto">
                {parsed.headers.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{h || <i>(sin nombre)</i>}</p>
                      <p className="text-[11px] text-gray-400 truncate">{parsed.rows.slice(0, 3).map(r => r[i]).filter(Boolean).join(' · ')}</p>
                    </div>
                    <select className={`${inputCls} w-52`} value={mapping[i]}
                      onChange={e => { const m = [...mapping]; m[i] = e.target.value; setMapping(m); setPreview(null) }}>
                      {TARGETS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                    {mapping[i] === 'field' && <code className="text-[10px] text-gray-500 w-36 truncate">{`{{campo.${fieldKey(h)}}}`}</code>}
                  </div>
                ))}
              </div>
              {!hasEmail && <p className="text-xs text-red-600 mt-1.5">Indicá qué columna tiene el email.</p>}
            </div>

            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Agregar a las bases</p>
              {lists.length === 0
                ? <p className="text-xs text-gray-500">No hay bases todavía: los contactos se importan sin base y los podés asignar después.</p>
                : (
                  <div className="flex flex-wrap gap-2">
                    {lists.map(l => (
                      <label key={l.id} className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer ${listIds.includes(l.id) ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                        <input type="checkbox" className="hidden" checked={listIds.includes(l.id)} onChange={() => { toggleList(l.id); setPreview(null) }} />
                        {l.name}
                      </label>
                    ))}
                  </div>
                )}
            </div>
          </>
        )}

        {preview && (
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 p-3 space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[
                ['Nuevos', preview.new], ['Ya existían', preview.existing],
                ['Repetidos en el archivo', preview.duplicatesInFile], ['Email inválido', preview.invalidCount],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-white dark:bg-gray-800 px-2 py-2">
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtInt(v)}</p>
                  <p className="text-[11px] text-gray-500">{l}</p>
                </div>
              ))}
            </div>
            {preview.suppressed > 0 && (
              <WarnNote>
                {fmtInt(preview.suppressed)} de los que ya existían están dados de baja, rebotaron o marcaron spam. Se suman a las bases pero no se van a volver a suscribir: no van a recibir mails.
              </WarnNote>
            )}
            {preview.invalid.length > 0 && (
              <p className="text-[11px] text-gray-500">Inválidos (primeros): {preview.invalid.map(x => `fila ${x.row}${x.email ? ` (${x.email})` : ''}`).join(', ')}</p>
            )}
            <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300 pt-1">
              <input type="checkbox" className="mt-0.5 rounded" checked={consent} onChange={e => setConsent(e.target.checked)} />
              <span>Confirmo que estas personas aceptaron recibir mails de este remitente (por ejemplo, se suscribieron en la web o son clientes que lo consintieron). Mandar a bases compradas o sin consentimiento daña la reputación del dominio y puede violar la ley.</span>
            </label>
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  )
}
