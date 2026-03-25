import { useState, useEffect } from 'react'
import api from '../../api/client'

export default function RolesTab() {
  const [roles, setRoles] = useState([])
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/roles').then(r => setRoles(r.data))
  }, [])

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Derive name from label: uppercase, spaces → underscores
      const name = label.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
      const { data } = await api.post('/roles', { name, label: label.trim() })
      setRoles(prev => [...prev, data])
      setLabel('')
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear rol')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(role) {
    setError('')
    try {
      await api.delete(`/roles/${role.id}`)
      setRoles(prev => prev.filter(r => r.id !== role.id))
    } catch (err) {
      setError(err.response?.data?.error || 'Error al eliminar rol')
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Roles</h2>

      <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 mb-6 flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre del rol</label>
          <input
            required
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="ej: Social Media Manager"
            className="mt-1 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {loading ? 'Creando...' : '+ Agregar rol'}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      <div className="space-y-2">
        {roles.map(r => (
          <div key={r.id} className="flex items-center justify-between bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.label}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{r.name}</p>
            </div>
            <button
              onClick={() => handleDelete(r)}
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
            >
              Eliminar
            </button>
          </div>
        ))}
        {roles.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No hay roles definidos</p>
        )}
      </div>
    </div>
  )
}
