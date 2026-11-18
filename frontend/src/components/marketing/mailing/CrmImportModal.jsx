// Importar contactos de Ventas (CRM) a una base. Importación puntual: el filtro
// queda guardado en la base para "Volver a sincronizar" después.
import { useEffect, useState } from 'react'
import api from '../../../api/client'
import { Modal, Field, inputCls, btnPrimary, btnSecondary, ErrorNote, WarnNote, apiError, fmtInt } from './ui'

function Chips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const on = value.includes(o.key)
        return (
          <button key={o.key} type="button" onClick={() => onChange(on ? value.filter(x => x !== o.key) : [...value, o.key])}
            className={`text-xs px-2.5 py-1 rounded-full border ${on ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export default function CrmImportModal({ base, lists, defaultListId, syncList, onClose, onDone }) {
  const [opts, setOpts] = useState(null)
  const [listId, setListId] = useState(syncList?.id || defaultListId || lists[0]?.id || '')
  const [filter, setFilter] = useState(syncList?.crmFilter || { statuses: [], origins: [], onlyPrimary: false, includeArchived: false })
  const [preview, setPreview] = useState(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => { api.get(`${base}/crm/options`).then(r => setOpts(r.data)).catch(err => setError(apiError(err))) }, [base])

  const setF = patch => { setFilter(f => ({ ...f, ...patch })); setPreview(null) }

  async function run(dryRun) {
    setBusy(true); setError('')
    try {
      const { data } = syncList
        ? await api.post(`${base}/lists/${syncList.id}/crm-sync`, { dryRun, consent })
        : await api.post(`${base}/crm/import`, { listId: Number(listId), filter, dryRun, consent })
      if (dryRun) setPreview(data)
      else { setResult(data); onDone?.() }
    } catch (err) { setError(apiError(err, 'No se pudo importar')) }
    finally { setBusy(false) }
  }

  if (result) {
    return (
      <Modal title="Importación terminada" onClose={onClose} footer={<button className={btnPrimary} onClick={onClose}>Listo</button>}>
        <p className="text-sm text-gray-700 dark:text-gray-300">Se crearon <b>{fmtInt(result.created)}</b> contactos nuevos y se actualizaron <b>{fmtInt(result.updated)}</b>. Todos quedaron en la base.</p>
      </Modal>
    )
  }

  return (
    <Modal title={syncList ? `Sincronizar «${syncList.name}» con Ventas` : 'Importar desde Ventas'} onClose={onClose}
      footer={<>
        <button className={btnSecondary} onClick={onClose}>Cancelar</button>
        {!preview
          ? <button className={btnPrimary} disabled={busy || !opts?.available || !listId} onClick={() => run(true)}>{busy ? 'Revisando…' : 'Revisar'}</button>
          : <button className={btnPrimary} disabled={busy || !consent || !preview.valid} onClick={() => run(false)}>{busy ? 'Importando…' : `Importar ${fmtInt(preview.valid)}`}</button>}
      </>}>
      {!opts ? <p className="text-sm text-gray-400">{error || 'Cargando…'}</p> : !opts.available ? (
        <WarnNote>Para importar desde Ventas necesitás tener acceso al módulo de Ventas en este workspace.</WarnNote>
      ) : (
        <div className="space-y-4">
          {syncList ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">Se repite la importación con el mismo filtro con el que se armó la base: entran los contactos nuevos del CRM y se completan datos. Nadie que se haya dado de baja vuelve a quedar suscripto.</p>
          ) : (
            <>
              <Field label="Base de destino">
                {lists.length === 0
                  ? <p className="text-xs text-gray-500">Primero creá una base.</p>
                  : <select className={inputCls} value={listId} onChange={e => { setListId(e.target.value); setPreview(null) }}>
                    {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>}
              </Field>
              <div>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Empresas con leads en estos estados <span className="font-normal text-gray-400">(vacío = todos)</span></p>
                <Chips options={opts.statuses} value={filter.statuses} onChange={statuses => setF({ statuses })} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Con estos orígenes <span className="font-normal text-gray-400">(vacío = todos)</span></p>
                <Chips options={opts.origins} value={filter.origins} onChange={origins => setF({ origins })} />
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                <input type="checkbox" className="rounded" checked={filter.onlyPrimary} onChange={e => setF({ onlyPrimary: e.target.checked })} />
                Solo el contacto principal de cada lead (si no, todos los contactos de la empresa)
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                <input type="checkbox" className="rounded" checked={filter.includeArchived} onChange={e => setF({ includeArchived: e.target.checked })} />
                Incluir leads archivados
              </label>
              <p className="text-[11px] text-gray-500">Se importan nombre, email y, como variables, <code>{'{{campo.empresa}}'}</code>, <code>{'{{campo.cargo}}'}</code> y <code>{'{{campo.rubro}}'}</code>. Los contactos sin email quedan afuera.</p>
            </>
          )}

          {preview && (
            <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 p-3 space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <b>{fmtInt(preview.valid)}</b> contactos con email: {fmtInt(preview.new)} nuevos y {fmtInt(preview.existing)} que ya estaban en el proyecto.
                {preview.invalidCount > 0 && <> {fmtInt(preview.invalidCount)} tienen un email inválido.</>}
              </p>
              {preview.suppressed > 0 && <WarnNote>{fmtInt(preview.suppressed)} ya estaban dados de baja o rebotaron: se suman a la base pero no van a recibir mails.</WarnNote>}
              {preview.truncated && <WarnNote>Hay más de {fmtInt(preview.limit)} contactos: se importan los primeros. Afiná el filtro para traer el resto.</WarnNote>}
              <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300 pt-1">
                <input type="checkbox" className="mt-0.5 rounded" checked={consent} onChange={e => setConsent(e.target.checked)} />
                <span>Confirmo que estos contactos pueden recibir mails de este remitente (son clientes o prospectos con los que hay una relación y lo aceptaron).</span>
              </label>
            </div>
          )}
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Modal>
  )
}
