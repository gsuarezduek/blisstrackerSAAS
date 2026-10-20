import { useState } from 'react'
import api from '../../api/client'
import { agentName } from '../../hooks/useMyAgents'

// "Delegar a mi agente": pasa una tarea propia a uno de mis agentes de IA (o a
// cualquiera de ellos) vía PATCH /tasks/:id/agent. En una tarea recurrente pregunta
// el alcance, igual que borrar ("Solo esta" / "Esta y todas las siguientes").
// El agente la toma la próxima vez que revise su lista (tasks_agent_queue): Grok no
// recibe avisos, solo actúa cuando se lo usa.
export default function DelegateAgentModal({ task, agents, onClose, onDelegated }) {
  const [agentId, setAgentId] = useState(agents.length === 1 ? String(agents[0].id) : 'any')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(scope) {
    setSaving(true)
    setError('')
    try {
      const body = { executor: 'agent', ...(agentId !== 'any' ? { agentId: Number(agentId) } : {}) }
      const { data } = await api.patch(`/tasks/${task.id}/agent${scope === 'series' ? '?scope=series' : ''}`, body)
      onDelegated(data, scope)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo delegar la tarea')
      setSaving(false)
    }
  }

  const btn = 'w-full rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Delegar a mi agente</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">"{task.description}"</p>
        </div>

        {agents.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agente</label>
            <select
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="any">Cualquiera de mis agentes</option>
              {agents.map(a => <option key={a.id} value={String(a.id)}>{agentName(a)}</option>)}
            </select>
          </div>
        )}

        <p className="text-sm text-gray-600 dark:text-gray-400">
          Sale de tu lista y pasa a la pestaña Agentes. Sigue a tu nombre: si el agente se traba, te avisa a vos. La toma la próxima vez que revise su lista.
        </p>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {task.recurrenceId ? (
          <div className="flex flex-col gap-2">
            <button onClick={() => submit('one')} disabled={saving} className={`${btn} bg-primary-600 hover:bg-primary-700 text-white`}>Solo esta</button>
            <button onClick={() => submit('series')} disabled={saving} className={`${btn} border border-primary-400 text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-gray-700`}>Esta y todas las siguientes</button>
            <button onClick={onClose} disabled={saving} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700`}>Cancelar</button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button onClick={onClose} disabled={saving} className={`${btn} flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700`}>Cancelar</button>
            <button onClick={() => submit('one')} disabled={saving} className={`${btn} flex-1 bg-primary-600 hover:bg-primary-700 text-white`}>{saving ? 'Delegando…' : 'Delegar'}</button>
          </div>
        )}
      </div>
    </div>
  )
}
