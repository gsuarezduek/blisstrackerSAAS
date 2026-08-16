import { useState, useEffect } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'

/**
 * Modal genérico "+ tarea" — mismo patrón usado (antes duplicado) en GeoTab.jsx y
 * OnPageTab.jsx: crea una Task en el proyecto con una descripción prellenada
 * (prefijo del hallazgo/sección de origen) y asignación opcional.
 * Props: defaultDescription (string prellenado, ej. "Meta Ads - Pausar campaña X"),
 * projectId, projectName, onClose.
 */
export default function CreateTaskModal({ defaultDescription, projectId, projectName, onClose }) {
  const { user } = useAuth()
  const [description, setDescription] = useState(defaultDescription)
  const [members, setMembers]         = useState([])
  const [assigneeId, setAssigneeId]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [done, setDone]               = useState(false)

  useEffect(() => {
    api.get(`/projects/${projectId}/members`)
      .then(r => {
        setMembers(r.data)
        setAssigneeId(String(user?.id ?? ''))
      })
      .catch(() => {})
  }, [projectId, user])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim()) return
    setSaving(true)
    try {
      const body = { description: description.trim(), projectId: String(projectId) }
      if (assigneeId && assigneeId !== String(user?.id)) body.targetUserId = assigneeId
      await api.post('/tasks', body)
      setDone(true)
      setTimeout(onClose, 1200)
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Crear tarea</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Proyecto: <span className="font-medium text-gray-600 dark:text-gray-300">{projectName}</span></p>

        {done ? (
          <div className="flex flex-col items-center py-6 gap-2">
            <span className="text-3xl">✅</span>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tarea creada</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
              <textarea
                autoFocus
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
            {members.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asignar a</label>
                <select
                  value={assigneeId}
                  onChange={e => setAssigneeId(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {members.map(m => (
                    <option key={m.id} value={String(m.id)}>
                      {m.name}{String(m.id) === String(user?.id) ? ' (yo)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={saving || !description.trim()}
                className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-medium transition-colors">
                {saving ? 'Guardando…' : 'Crear tarea'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
