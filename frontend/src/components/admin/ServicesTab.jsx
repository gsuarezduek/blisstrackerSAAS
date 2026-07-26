import { useState, useEffect } from 'react'
import api from '../../api/client'

const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

export default function ServicesTab() {
  const [services, setServices] = useState([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')

  useEffect(() => {
    api.get('/services/all').then(r => setServices(r.data))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/services', { name: name.trim(), description: description.trim() })
      setServices(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setName('')
      setDescription('')
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear servicio')
    } finally {
      setLoading(false)
    }
  }

  function startEdit(service) {
    setEditingId(service.id)
    setEditName(service.name)
    setEditDescription(service.description || '')
  }

  async function handleSaveEdit(service) {
    const trimmedName = editName.trim()
    const trimmedDescription = editDescription.trim()
    if (!trimmedName) { setEditingId(null); return }
    if (trimmedName === service.name && trimmedDescription === (service.description || '')) {
      setEditingId(null)
      return
    }
    try {
      const { data } = await api.put(`/services/${service.id}`, { name: trimmedName, description: trimmedDescription })
      setServices(prev => prev.map(s => s.id === data.id ? data : s).sort((a, b) => a.name.localeCompare(b.name)))
      setEditingId(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al editar servicio')
    }
  }

  async function toggleActive(service) {
    const { data } = await api.put(`/services/${service.id}`, { active: !service.active })
    setServices(prev => prev.map(s => s.id === data.id ? data : s))
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Servicios</h2>

      <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 mb-6 items-start">
        <div className="flex-1 w-full space-y-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nombre del servicio (ej: Community Management)"
            className={input}
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Qué incluye este servicio (opcional, la IA lo usa al redactar propuestas comerciales)"
            rows={2}
            className={input}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 shrink-0"
        >
          {loading ? 'Guardando...' : 'Agregar'}
        </button>
      </form>
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <div className="space-y-2">
        {services.map(s => (
          <div key={s.id} className="flex items-start justify-between gap-3 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${s.active ? 'bg-green-500' : 'bg-gray-300'}`} />
              {editingId === s.id ? (
                <div className="flex-1 space-y-2">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus
                    className={input}
                  />
                  <textarea
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') setEditingId(null) }}
                    placeholder="Qué incluye este servicio (opcional)"
                    rows={2}
                    className={input}
                  />
                </div>
              ) : (
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.name}</span>
                  {s.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.description}</p>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 ml-3 flex-shrink-0">
              {editingId === s.id ? (
                <>
                  <button
                    onClick={() => handleSaveEdit(s)}
                    className="text-xs px-3 py-1 rounded-full font-medium bg-primary-50 text-primary-600 hover:bg-primary-100 transition-colors"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs px-3 py-1 rounded-full font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => startEdit(s)}
                    className="text-xs px-3 py-1 rounded-full font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActive(s)}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                      s.active
                        ? 'bg-red-50 text-red-600 hover:bg-red-100'
                        : 'bg-green-50 text-green-600 hover:bg-green-100'
                    }`}
                  >
                    {s.active ? 'Desactivar' : 'Activar'}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {services.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            No hay servicios creados todavía
          </div>
        )}
      </div>
    </div>
  )
}
