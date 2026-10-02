import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import api from '../api/client'
import useMembers from '../hooks/useMembers'
import { avatarUrl } from '../utils/avatarUrl'
import { Icon } from './ui/Icon'

// Alta rápida de proyecto desde Mis Proyectos (mismo POST /projects que Admin →
// Proyectos, admin/owner). Quien lo crea queda en el equipo automáticamente; acá
// se pueden sumar servicios y más personas. El resto de la ficha (sitio web,
// redes, portal, horas) se completa después en Ajustes del proyecto.
export default function NewProjectModal({ open, onClose, onCreated, currentUserId }) {
  const { members } = useMembers()
  const [services, setServices] = useState([])
  const [name, setName] = useState('')
  const [serviceIds, setServiceIds] = useState([])
  const [memberIds, setMemberIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(''); setServiceIds([]); setMemberIds([]); setError('')
    api.get('/services').then(r => setServices(r.data)).catch(() => setServices([]))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, onClose])

  if (!open) return null

  const toggle = (list, setList, id) =>
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id])

  const others = members.filter(m => m.active !== false && m.id !== currentUserId)

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true); setError('')
    try {
      const { data } = await api.post('/projects', { name: name.trim(), serviceIds, memberIds })
      onCreated(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el proyecto')
      setSaving(false)
    }
  }

  const chip = on => `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
    on ? 'bg-primary-600 border-primary-600 text-white'
       : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={() => !saving && onClose()}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="new-project-title"
        className="bg-white dark:bg-gray-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 id="new-project-title" className="text-base font-bold text-gray-900 dark:text-white">Nuevo proyecto</h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <Icon as={X} size={16} />
          </button>
        </div>

        <div className="px-5 pb-4 overflow-y-auto space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Nombre</span>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={120}
              placeholder="Ej. Pastiza"
              className="mt-1.5 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </label>

          {services.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Servicios</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {services.map(s => (
                  <button key={s.id} type="button" onClick={() => toggle(serviceIds, setServiceIds, s.id)}
                    aria-pressed={serviceIds.includes(s.id)} className={chip(serviceIds.includes(s.id))}>{s.name}</button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Equipo</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Vos quedás en el equipo. Sumá a quienes van a trabajar principalmente en el proyecto.</p>
            {others.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {others.map(m => (
                  <button key={m.id} type="button" onClick={() => toggle(memberIds, setMemberIds, m.id)}
                    aria-pressed={memberIds.includes(m.id)} className={`${chip(memberIds.includes(m.id))} inline-flex items-center gap-1.5 pl-1`}>
                    <img src={avatarUrl(m.avatar)} alt="" className="w-5 h-5 rounded-full object-cover" />
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
          <button type="button" onClick={onClose} disabled={saving}
            className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl py-2.5 text-sm font-medium">
            Cancelar
          </button>
          <button type="submit" disabled={!name.trim() || saving}
            className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50">
            {saving ? 'Creando…' : 'Crear proyecto'}
          </button>
        </div>
      </form>
    </div>
  )
}
