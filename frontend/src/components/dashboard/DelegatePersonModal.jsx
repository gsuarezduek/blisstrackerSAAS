import { useState, useEffect } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import useMembers from '../../hooks/useMembers'
import useRoles from '../../hooks/useRoles'

// "Delegar a otra persona": pasa una tarea propia a otro integrante activo del
// workspace vía PATCH /tasks/:id { targetUserId } — el mismo endpoint que el "Asignar a"
// del detalle de la tarea, que la engancha al día de hoy de esa persona y le avisa.
// Si la tarea la creé yo, sigue apareciendo en mi Seguimiento (createdById = yo); si me
// la había pasado otro, la sigo explícitamente para no perderle el rastro.
// En una recurrente solo se pasa esta ocurrencia: el responsable de la serie no se
// propaga (ver editTask), así que las siguientes siguen a mi nombre.
export default function DelegatePersonModal({ task, onClose, onReassigned }) {
  const { user } = useAuth()
  const { members } = useMembers()
  const { labelFor } = useRoles()
  const [projectTeamIds, setProjectTeamIds] = useState(new Set())
  const [targetId, setTargetId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Mismo agrupamiento que AddTaskModal: equipo del proyecto primero, el resto después.
  useEffect(() => {
    if (!task.projectId) return
    api.get(`/projects/${task.projectId}/members`)
      .then(r => setProjectTeamIds(new Set(r.data.map(u => u.id))))
      .catch(() => {})
  }, [task.projectId])

  const candidates = members.filter(m => m.active && m.id !== user?.id)
  const teamOptions  = candidates.filter(m => projectTeamIds.has(m.id))
  const otherOptions = candidates.filter(m => !projectTeamIds.has(m.id))

  async function submit() {
    if (!targetId) return
    setSaving(true)
    setError('')
    try {
      const { data } = await api.patch(`/tasks/${task.id}`, { targetUserId: Number(targetId) })
      if (task.createdById !== user?.id) {
        await api.post(`/tasks/${task.id}/follow`).catch(() => {})
      }
      onReassigned(data)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo delegar la tarea')
      setSaving(false)
    }
  }

  const option = u => (
    <option key={u.id} value={String(u.id)}>{u.name}{u.role ? ` — ${labelFor(u.role)}` : ''}</option>
  )
  const btn = 'w-full rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Delegar a otra persona</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">"{task.description}"</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Persona</label>
          <select
            value={targetId}
            onChange={e => setTargetId(e.target.value)}
            autoFocus
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="" disabled>Elegí a quién…</option>
            {teamOptions.length > 0 && <optgroup label="Equipo del proyecto">{teamOptions.map(option)}</optgroup>}
            {otherOptions.length > 0 && <optgroup label="Otros del workspace">{otherOptions.map(option)}</optgroup>}
          </select>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Sale de tu lista y pasa a su dashboard; le avisamos. Vas a poder seguirla desde la pestaña Seguimiento.
          {task.recurrenceId && ' Es recurrente: solo se pasa esta vez, las siguientes siguen a tu nombre.'}
        </p>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={saving} className={`${btn} flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700`}>Cancelar</button>
          <button onClick={submit} disabled={saving || !targetId} className={`${btn} flex-1 bg-primary-600 hover:bg-primary-700 text-white`}>{saving ? 'Delegando…' : 'Delegar'}</button>
        </div>
      </div>
    </div>
  )
}
