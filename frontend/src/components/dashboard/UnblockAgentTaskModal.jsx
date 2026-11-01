import { useState } from 'react'
import api from '../../api/client'
import { agentName } from '../../hooks/useMyAgents'

// "Desbloquear" una tarea que un agente de IA dejó bloqueada: el motivo del bloqueo es
// casi siempre una pregunta ("¿apruebo este texto?", "¿con qué cuenta publico?"), así
// que acá se destraba Y se responde. La respuesta queda como comentario de la tarea
// (PATCH /tasks/:id/unblock { reply }), que es donde el agente la lee.
//
// La tarea vuelve PAUSADA, no en curso: nadie está trabajando en ese momento — un agente
// MCP solo actúa cuando se lo invoca — y dejarla en curso le sumaba horas de trabajo que
// no existieron. El agente se entera la próxima vez que revise sus novedades
// (tasks_agent_updates) y la retoma con task_resume.
export default function UnblockAgentTaskModal({ task, onClose, onUnblocked }) {
  const [reply, setReply] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSaving(true)
    setError('')
    try {
      const body = reply.trim() ? { reply: reply.trim() } : {}
      const { data } = await api.patch(`/tasks/${task.id}/unblock`, body)
      onUnblocked(data)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo desbloquear la tarea')
      setSaving(false)
    }
  }

  const btn = 'rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60'
  const who = task.agent ? agentName(task.agent, task.agentName) : 'Tu agente'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Desbloquear y responder</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">"{task.description}"</p>
        </div>

        {task.blockedReason && (
          <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            <span className="font-medium">{who} preguntó:</span> {task.blockedReason}
          </div>
        )}

        <div>
          <label htmlFor="unblock-reply" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tu respuesta <span className="font-normal text-gray-400">(opcional)</span>
          </label>
          <textarea
            id="unblock-reply"
            autoFocus
            rows={4}
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="Lo que necesita saber para seguir: una aprobación, un dato, un cambio de criterio…"
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
          />
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Queda como comentario de la tarea. La tarea vuelve a la lista del agente como pausada: la retoma — y lee tu respuesta — la próxima vez que lo uses.
          </p>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={saving} className={`${btn} flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700`}>
            Cancelar
          </button>
          <button onClick={submit} disabled={saving} className={`${btn} flex-1 bg-primary-600 hover:bg-primary-700 text-white`}>
            {saving ? 'Desbloqueando…' : 'Desbloquear'}
          </button>
        </div>
      </div>
    </div>
  )
}
