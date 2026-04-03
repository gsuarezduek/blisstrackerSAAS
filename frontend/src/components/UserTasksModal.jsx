import { useState, useEffect } from 'react'
import api from '../api/client'
import { linkify } from '../utils/linkify'
import useRoles from '../hooks/useRoles'

const STATUS_LABEL = {
  BLOCKED:     'Bloqueada',
  IN_PROGRESS: 'En curso',
  PAUSED:      'Pausada',
  PENDING:     'Pendiente',
}

const STATUS_CLASS = {
  BLOCKED:     'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  IN_PROGRESS: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
  PAUSED:      'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  PENDING:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

const STATUS_ORDER = { IN_PROGRESS: 0, BLOCKED: 1, PAUSED: 2, PENDING: 3 }

export default function UserTasksModal({ user, onClose }) {
  const { labelFor } = useRoles()
  const [byProject, setByProject] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/users/${user.id}/tasks`)
      .then(r => setByProject(r.data))
      .finally(() => setLoading(false))
  }, [user.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-gray-700">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{user.name}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{labelFor(user.role)}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading && (
            <p className="text-center text-gray-400 py-8">Cargando...</p>
          )}

          {!loading && byProject.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm">No tiene tareas activas</p>
            </div>
          )}

          {!loading && byProject.length > 0 && (
            <div className="space-y-4">
              {byProject.map(({ project, tasks }) => (
                <div key={project.id}>
                  <p className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wide mb-2">
                    {project.name}
                  </p>
                  <div className="space-y-1.5">
                    {tasks
                      .slice()
                      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
                      .map(task => (
                        <div key={task.id} className="flex items-start gap-2.5 py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${STATUS_CLASS[task.status]}`}>
                            {STATUS_LABEL[task.status]}
                          </span>
                          <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
                            {linkify(task.description)}
                          </p>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
