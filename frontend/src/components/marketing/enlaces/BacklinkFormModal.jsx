import { useState } from 'react'
import api from '../../../api/client'
import { PLACEMENTS, LINK_TYPE } from './enlacesHelpers'

/**
 * Alta y edición de un enlace. El único campo obligatorio es la URL de la página
 * que nos enlaza: el resto lo completa el verificador cuando lea la página, y
 * exigirlo acá convertiría una carga de 20 enlaces en un trámite.
 */
export default function BacklinkFormModal({ projectId, link, onClose, onSaved }) {
  const editing = !!link
  const [form, setForm] = useState({
    sourceUrl:    link?.sourceUrl    ?? '',
    targetUrl:    link?.targetUrl    ?? '',
    anchor:       link?.anchor       ?? '',
    linkType:     link?.linkType     ?? 'unknown',
    placement:    link?.placement    ?? '',
    domainRating: link?.domainRating ?? '',
    firstSeenAt:  link?.firstSeenAt ? String(link.firstSeenAt).slice(0, 10) : '',
    notes:        link?.notes        ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = { ...form, domainRating: form.domainRating === '' ? null : Number(form.domainRating) }
      if (editing) await api.patch(`/marketing/projects/${projectId}/backlinks/${link.id}`, body)
      else         await api.post(`/marketing/projects/${projectId}/backlinks`, body)
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el enlace.')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            {editing ? 'Editar enlace' : 'Agregar un enlace'}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Solo la URL es obligatoria. El resto lo completa la verificación cuando lea la página.
          </p>
        </div>

        <Field label="Página que nos enlaza" required
          hint="La URL donde está el enlace, no la home del sitio.">
          <input type="text" required value={form.sourceUrl} onChange={e => set('sourceUrl', e.target.value)}
            placeholder="https://diario.com/nota-sobre-marketing" className={inputCls} />
        </Field>

        <Field label="A qué URL nuestra apunta" hint="Opcional: si no la sabés, la detecta la verificación.">
          <input type="text" value={form.targetUrl} onChange={e => set('targetUrl', e.target.value)}
            placeholder="https://cliente.com/servicios" className={inputCls} />
        </Field>

        <Field label="Texto del enlace (anchor)">
          <input type="text" value={form.anchor} onChange={e => set('anchor', e.target.value)}
            placeholder="agencia de marketing en Mendoza" className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo" hint={LINK_TYPE[form.linkType]?.help}>
            <select value={form.linkType} onChange={e => set('linkType', e.target.value)} className={inputCls}>
              {Object.entries(LINK_TYPE).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Ubicación">
            <select value={form.placement} onChange={e => set('placement', e.target.value)} className={inputCls}>
              {PLACEMENTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="DR del dominio" hint="Lo que dice Ahrefs o Semrush.">
            <input type="number" min="0" max="100" step="1" value={form.domainRating}
              onChange={e => set('domainRating', e.target.value)} placeholder="—" className={inputCls} />
          </Field>
          <Field label="Desde cuándo existe" hint="Define si cuenta como enlace nuevo del mes.">
            <input type="date" value={form.firstSeenAt} onChange={e => set('firstSeenAt', e.target.value)} className={inputCls} />
          </Field>
        </div>

        <Field label="Nota">
          <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Cómo se consiguió, con quién se gestionó…" className={inputCls} />
        </Field>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={saving || !form.sourceUrl.trim()}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors">
            {saving ? 'Guardando…' : editing ? 'Guardar' : 'Agregar'}
          </button>
        </div>
      </form>
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500'

function Field({ label, hint, required, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-1">{hint}</span>}
    </label>
  )
}
