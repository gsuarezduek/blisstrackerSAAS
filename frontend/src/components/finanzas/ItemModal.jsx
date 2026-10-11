import { useState } from 'react'
import api from '../../api/client'
import { Toggle } from '../../pages/preferences/shared.jsx'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

// Edición de un item ya existente (nombre, categoría habitual, seguimiento de
// cuenta y activo/inactivo). El alta de items nuevos sigue siendo el form
// inline de ItemsPanel — este modal solo cubre la edición, que hoy no tenía
// ninguna entrada en la UI pese a que el backend (updateItem) ya la soporta.
export default function ItemModal({ item, categories, onClose, onSaved, onDelete }) {
  const [name, setName] = useState(item.name)
  const [categoryId, setCategoryId] = useState(String(item.categoryId))
  const [tracksAccount, setTracksAccount] = useState(item.tracksAccount)
  const [active, setActive] = useState(item.active)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('Nombre requerido'); return }
    if (!categoryId) { setError('Categoría habitual requerida'); return }
    setSaving(true); setError('')
    try {
      await api.patch(`/finanzas/items/${item.id}`, {
        name: name.trim(), categoryId: Number(categoryId), tracksAccount, active,
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 pr-8">Editar item</h2>

        <div className="space-y-4">
          <div>
            <label className={label}>Nombre</label>
            <input className={input} value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <label className={label}>Categoría habitual</label>
            <select className={input} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              {categories.filter(c => c.active || c.id === item.categoryId).map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.type === 'income' ? 'Ingreso' : 'Egreso'})</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={tracksAccount} onChange={e => setTracksAccount(e.target.checked)} />
            Seguimiento de cuenta (para clientes: facturas, cobros y saldo)
          </label>

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Activo</p>
            <Toggle on={active} onToggle={() => setActive(v => !v)} />
          </div>

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
