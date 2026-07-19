import { useState, useEffect } from 'react'
import api from '../../api/client'
import useRoles from '../../hooks/useRoles'

// Admin: configura qué roles (teamRole) forman el "equipo comercial". Los miembros con
// esos roles acceden al módulo Ventas sin ser admin. Persiste en Workspace.salesRoleNames.
export default function SalesTeamModal({ onClose, onSaved }) {
  const { roles } = useRoles()
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/workspaces/current')
      .then(({ data }) => setSelected(Array.isArray(data.salesRoleNames) ? data.salesRoleNames : []))
      .catch(() => {})
  }, [])

  function toggle(name) {
    setSelected(s => s.includes(name) ? s.filter(x => x !== name) : [...s, name])
  }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      await api.patch('/workspaces/current', { salesRoleNames: selected })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar'); setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">Equipo comercial</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Elegí los roles cuyos integrantes pueden usar el módulo de Ventas. Los administradores siempre tienen acceso.
        </p>

        <div className="space-y-1 max-h-64 overflow-y-auto mb-4">
          {roles.length === 0 && <p className="text-sm text-gray-400">No hay roles definidos en el workspace.</p>}
          {roles.map(r => (
            <label key={r.name} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
              <input type="checkbox" checked={selected.includes(r.name)} onChange={() => toggle(r.name)} className="rounded text-primary-600 focus:ring-primary-500" />
              <span className="text-sm text-gray-800 dark:text-gray-200">{r.label}</span>
            </label>
          ))}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-xl py-2.5 text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm">{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
