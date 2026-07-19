import { useState, useEffect } from 'react'
import api from '../../api/client'

const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

// Convierte un lead ganado en Proyecto: elige nombre, servicios y equipo de trabajo.
// Reutiliza la lógica de creación de proyectos del backend (projects.service.createProject).
export default function ConvertToProjectModal({ lead, onClose, onConverted }) {
  const [name, setName] = useState(lead.company?.name || lead.title || '')
  const [services, setServices] = useState([])
  const [members, setMembers] = useState([])
  const [serviceIds, setServiceIds] = useState([])
  const [memberIds, setMemberIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.get('/services'), api.get('/workspaces/current/members')])
      .then(([s, m]) => { setServices(s.data); setMembers(m.data.filter(u => u.active !== false)) })
      .catch(() => {})
  }, [])

  function toggle(list, setList, id) {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return setError('El nombre del proyecto es requerido')
    setSaving(true)
    setError('')
    try {
      const { data } = await api.post(`/ventas/leads/${lead.id}/convert`, {
        name: name.trim(), serviceIds, memberIds,
      })
      onConverted(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear el proyecto')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 my-auto">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">Convertir en proyecto</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Se creará un proyecto asociado al cliente y el lead quedará marcado como ganado.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={label}>Nombre del proyecto</label>
            <input className={input} value={name} onChange={e => setName(e.target.value)} />
          </div>

          {services.length > 0 && (
            <div>
              <label className={label}>Servicios</label>
              <div className="flex flex-wrap gap-2">
                {services.map(s => (
                  <button key={s.id} type="button" onClick={() => toggle(serviceIds, setServiceIds, s.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${serviceIds.includes(s.id) ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {members.length > 0 && (
            <div>
              <label className={label}>Equipo de trabajo</label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {members.map(m => (
                  <button key={m.id} type="button" onClick={() => toggle(memberIds, setMemberIds, m.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${memberIds.includes(m.id) ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-xl py-2.5 text-sm transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
              {saving ? 'Creando...' : 'Crear proyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
