import { useState, useEffect } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'

/**
 * Modal de confirmación para crear varias tareas a la vez a partir de una selección
 * múltiple de hallazgos/sugerencias (Plan de acción, Prioridades). Mismo patrón que
 * CreateTaskModal.jsx (proyecto fijo, asignación editable) pero para N items en un
 * solo submit — las descripciones ya vienen resueltas por el caller (con el prefijo
 * de cada fuente), acá solo se listan.
 * Props: items ([{ key, description }]), projectId, projectName, onClose.
 */
export default function BulkCreateTaskModal({ items, projectId, projectName, onClose }) {
  const { user } = useAuth()
  const [members, setMembers]     = useState([])
  const [assigneeId, setAssigneeId] = useState('')
  const [saving, setSaving]       = useState(false)
  const [done, setDone]           = useState(null) // { created }

  useEffect(() => {
    api.get(`/projects/${projectId}/members`)
      .then(r => { setMembers(r.data); setAssigneeId(String(user?.id ?? '')) })
      .catch(() => {})
  }, [projectId, user])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    let created = 0
    for (const it of items) {
      try {
        const body = { description: it.description, projectId: String(projectId) }
        if (assigneeId && assigneeId !== String(user?.id)) body.targetUserId = assigneeId
        await api.post('/tasks', body)
        created++
      } catch {}
    }
    setSaving(false)
    setDone({ created })
    setTimeout(onClose, 1200)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Crear {items.length} tareas</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Proyecto: <span className="font-medium text-gray-600 dark:text-gray-300">{projectName}</span></p>

        {done ? (
          <div className="flex flex-col items-center py-6 gap-2">
            <span className="text-3xl">✅</span>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{done.created} tarea(s) creada(s)</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripciones ({items.length})</label>
              <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                {items.map(it => (
                  <p key={it.key} className="px-3 py-2 text-sm text-gray-700 dark:text-gray-200">{it.description}</p>
                ))}
              </div>
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
                    <option key={m.id} value={String(m.id)}>{m.name}{String(m.id) === String(user?.id) ? ' (yo)' : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} disabled={saving}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-medium transition-colors">
                {saving ? 'Creando…' : `Crear ${items.length} tareas`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
