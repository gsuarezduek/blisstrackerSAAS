import { useState } from 'react'
import api from '../../api/client'
import { TAX_APPLIES_TO, TAX_BASE_TYPES } from './financeCatalog'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

export default function TaxModal({ tax, allTaxes, onClose, onSaved, onDelete }) {
  const isNew = tax === null
  const [name, setName] = useState(tax?.name || '')
  const [percentage, setPercentage] = useState(tax ? String(tax.percentage) : '')
  const [appliesTo, setAppliesTo] = useState(tax?.appliesTo || 'both')
  const [baseType, setBaseType] = useState(tax?.baseType || 'movement')
  const [baseTaxId, setBaseTaxId] = useState(tax?.baseTaxId ? String(tax.baseTaxId) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const otherTaxes = allTaxes.filter(t => t.id !== tax?.id)

  async function handleSave() {
    if (!name.trim()) { setError('Nombre requerido'); return }
    if (percentage === '' || Number.isNaN(Number(percentage))) { setError('Porcentaje inválido'); return }
    if (baseType === 'other_tax' && !baseTaxId) { setError('Elegí sobre qué impuesto se calcula'); return }
    setSaving(true); setError('')
    try {
      const body = {
        name: name.trim(), percentage: Number(percentage), appliesTo, baseType,
        baseTaxId: baseType === 'other_tax' ? Number(baseTaxId) : null,
      }
      if (isNew) await api.post('/finanzas/taxes', body)
      else await api.patch(`/finanzas/taxes/${tax.id}`, body)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 pr-8">{isNew ? 'Nuevo impuesto' : 'Editar impuesto'}</h2>

        <div className="space-y-4">
          <div>
            <label className={label}>Nombre</label>
            <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder='ej. "IVA s/ comisión"' />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Porcentaje</label>
              <input type="number" step="any" className={input} value={percentage} onChange={e => setPercentage(e.target.value)} />
            </div>
            <div>
              <label className={label}>Aplica a</label>
              <select className={input} value={appliesTo} onChange={e => setAppliesTo(e.target.value)}>
                {TAX_APPLIES_TO.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Se calcula sobre</label>
            <select className={input} value={baseType} onChange={e => setBaseType(e.target.value)}>
              {TAX_BASE_TYPES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          {baseType === 'other_tax' && (
            <div>
              <label className={label}>Impuesto base</label>
              <select className={input} value={baseTaxId} onChange={e => setBaseTaxId(e.target.value)}>
                <option value="">Elegir…</option>
                {otherTaxes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {otherTaxes.length === 0 && <p className="text-xs text-gray-400 mt-1">No hay otros impuestos cargados todavía.</p>}
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            {onDelete && (
              <button onClick={onDelete} className="border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg px-4 py-2 text-sm font-medium">Eliminar</button>
            )}
            <div className="flex-1" />
            <button onClick={onClose} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
