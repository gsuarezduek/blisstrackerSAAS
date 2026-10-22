import { useState } from 'react'
import api from '../../api/client'
import useMyAgents, { agentName } from '../../hooks/useMyAgents'

// Quién atiende una conversación puntual — compartido entre el inbox
// (WhatsappTab) y el panel embebido en el lead (WhatsappLeadCard). Tres estados:
//  - Bot: responde solo los mensajes entrantes (botEnabled).
//  - Vos / el equipo: una persona tomó el control, el bot no responde.
//  - Agente «X» (`agentControl` = { id, label }): un agente de IA conectado por
//    MCP la atiende — el agente tiene prioridad sobre el bot. Queda así cuando el
//    agente responde o toma el control, o cuando la persona se la asigna desde acá.
// Sin agentes propios es el toggle de siempre (Tomar el control / Devolver al
// bot), y no se renderiza si además el workspace no tiene el bot activado. Con
// agentes, un selector permite asignarle la conversación a uno de ellos aunque
// el bot esté apagado en el workspace.
export default function WhatsappBotToggle({ conversationId, botEnabled, agentControl, agentControlName, workspaceBotEnabled, onChanged }) {
  const [saving, setSaving] = useState(false)
  const myAgents = useMyAgents()
  if (!workspaceBotEnabled && myAgents.length === 0) return null

  async function save(body) {
    setSaving(true)
    try {
      const { data } = await api.patch(`/whatsapp/conversations/${conversationId}/bot`, body)
      onChanged?.(data.botEnabled, data.agentControl ?? null, data.agentControlName ?? null)
    } finally {
      setSaving(false)
    }
  }

  const byAgent = !botEnabled && agentControl
  const botActive = workspaceBotEnabled && botEnabled

  const chip = (
    <span
      className={`text-[11px] px-2 py-1 rounded-full font-medium truncate max-w-[12rem] ${
        botActive
          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
          : byAgent
            ? 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400'
            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
      }`}
      title={
        botActive ? 'El bot responde automáticamente los mensajes entrantes'
          : byAgent ? `El agente de IA «${agentName(agentControl, agentControlName)}» atiende esta conversación${workspaceBotEnabled ? ' — el bot no responde acá' : ''}`
          : workspaceBotEnabled ? 'Un humano tomó el control — el bot no responde acá'
          : 'La atiende el equipo'
      }
    >
      {botActive ? 'Bot' : byAgent ? `Agente «${agentName(agentControl, agentControlName)}»` : 'Vos'}
    </span>
  )

  if (myAgents.length === 0) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {chip}
        <button
          onClick={() => save({ botEnabled: !botEnabled })}
          disabled={saving}
          className="text-[11px] px-2 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {botEnabled ? 'Tomar el control' : 'Devolver al bot'}
        </button>
      </div>
    )
  }

  const value = botActive ? 'bot' : byAgent ? `agent:${agentControl.id}` : 'me'
  // Si la tiene tomada el agente de otra persona, se muestra como opción (no se
  // puede elegir: solo se le asignan conversaciones a los agentes propios).
  const foreignAgent = byAgent && !myAgents.some(a => a.id === agentControl.id) ? agentControl : null

  function handleChange(e) {
    const next = e.target.value
    if (next === value) return
    if (next === 'bot') return save({ botEnabled: true })
    if (next === 'me') return save({ botEnabled: false })
    save({ botEnabled: false, agentId: Number(next.slice('agent:'.length)) })
  }

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {chip}
      <select
        value={value}
        onChange={handleChange}
        disabled={saving}
        aria-label="Quién atiende esta conversación"
        title="Quién atiende esta conversación"
        className="text-[11px] px-2 py-1 rounded-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-50"
      >
        {workspaceBotEnabled && <option value="bot">La atiende el bot</option>}
        <option value="me">La atiendo yo</option>
        {myAgents.map(a => (
          <option key={a.id} value={`agent:${a.id}`}>La atiende mi agente «{agentName(a)}»</option>
        ))}
        {foreignAgent && (
          <option value={`agent:${foreignAgent.id}`} disabled>Agente «{agentName(foreignAgent, agentControlName)}»</option>
        )}
      </select>
    </div>
  )
}
