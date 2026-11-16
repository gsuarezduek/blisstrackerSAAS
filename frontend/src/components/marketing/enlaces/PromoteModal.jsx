import { useState } from 'react'
import api from '../../../api/client'
import { LINK_TYPE, PLACEMENTS } from './enlacesHelpers'

/**
 * "Marcar como conseguido": cierra la oportunidad y hace nacer el `Backlink`.
 *
 * Lo único importante que pide es **la URL de la página que ahora nos enlaza**, y
 * por eso el campo lleva su explicación: el ejemplo que ya tiene el prospecto es la
 * página donde ese sitio enlaza al COMPETIDOR, no a nosotros. Si no se completa, el
 * enlace nace sin poder verificarse — se dice en pantalla, porque es la diferencia
 * entre un enlace vigilado y uno que sólo figura en una lista.
 */
export default function PromoteModal({ projectId, prospect, onClose, onDone }) {
  const [form, setForm] = useState({ sourceUrl: '', anchor: '', linkType: 'unknown', placement: '' })
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const verifiable = !!form.sourceUrl.trim()

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post(
        `/marketing/projects/${projectId}/backlinks/prospects/${prospect.id}/promote`,
        {
          sourceUrl: form.sourceUrl || undefined,
          anchor:    form.anchor || undefined,
          linkType:  form.linkType,
          placement: form.placement || undefined,
        },
      )
      onDone?.(data)
      onClose()
    } catch (err) {
      const d = err.response?.data
      // Ya estaba promovida: no es un error que haya que resolver, es información.
      if (d?.code === 'ALREADY_PROMOTED') { onDone?.(d); onClose(); return }
      setError(d?.error ?? 'No se pudo marcar como conseguido.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">

        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Conseguimos el enlace de {prospect.domain}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Se va a crear el enlace en "Nuestros enlaces" y la oportunidad queda cerrada.
          </p>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">¿En qué página quedó el enlace?</span>
          <input value={form.sourceUrl} onChange={e => set('sourceUrl', e.target.value)}
            placeholder={`https://${prospect.domain}/la-nota-donde-nos-enlazan`}
            className="mt-1 w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100" />
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            No es la misma página que enlaza al competidor: es la que ahora nos enlaza a nosotros.
          </span>
        </label>

        {!verifiable && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Sin la URL concreta el enlace queda registrado pero <strong>fuera de la verificación automática</strong>:
            el verificador chequearía la home del sitio y lo daría por perdido. Podés completarla después desde
            "Nuestros enlaces".
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Texto del enlace</span>
            <input value={form.anchor} onChange={e => set('anchor', e.target.value)}
              placeholder="el anchor con el que nos enlazan"
              className="mt-1 w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Tipo</span>
            <select value={form.linkType} onChange={e => set('linkType', e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100">
              {Object.entries(LINK_TYPE).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              Si no lo sabés, dejalo en "Sin dato": el verificador lo lee de la página.
            </span>
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Ubicación</span>
          <select value={form.placement} onChange={e => set('placement', e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100">
            {PLACEMENTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={busy}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors">
            {busy ? 'Guardando…' : 'Marcar como conseguido'}
          </button>
        </div>
      </form>
    </div>
  )
}
