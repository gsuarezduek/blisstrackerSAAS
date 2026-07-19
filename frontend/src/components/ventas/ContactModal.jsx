import { useState } from 'react'
import api from '../../api/client'

const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

export default function ContactModal({ contact, companyId, onClose, onSaved }) {
  const editing = !!contact
  const [form, setForm] = useState({
    name: contact?.name || '', title: contact?.title || '',
    email: contact?.email || '', phone: contact?.phone || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return setError('Nombre requerido')
    setSaving(true); setError('')
    try {
      if (editing) await api.patch(`/ventas/contacts/${contact.id}`, form)
      else         await api.post('/ventas/contacts', { ...form, companyId })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar'); setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{editing ? 'Editar contacto' : 'Nuevo contacto'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div><label className={label}>Nombre *</label><input className={input} value={form.name} onChange={e => set('name', e.target.value)} /></div>
          <div><label className={label}>Cargo</label><input className={input} value={form.title} onChange={e => set('title', e.target.value)} /></div>
          <div><label className={label}>Email</label><input className={input} value={form.email} onChange={e => set('email', e.target.value)} /></div>
          <div><label className={label}>Teléfono</label><input className={input} value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-xl py-2.5 text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
