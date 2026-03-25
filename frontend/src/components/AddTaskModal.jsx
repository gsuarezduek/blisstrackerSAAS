import { useState, useEffect } from 'react'
import api from '../api/client'

export default function AddTaskModal({ onAdd, onClose }) {
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/projects').then(r => {
      setProjects(r.data)
      if (r.data.length > 0) setProjectId(String(r.data[0].id))
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim() || !projectId) return
    setLoading(true)
    try {
      const { data } = await api.post('/tasks', { description: description.trim(), projectId })
      onAdd(data)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Nueva tarea</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
            <textarea
              autoFocus
              required
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              placeholder="¿Qué vas a hacer?"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proyecto / Cliente</label>
            <select
              required
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {loading ? 'Guardando...' : 'Agregar tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
