import { useState } from 'react'
import api from '../../api/client'

// Handoff bot/humano por conversación (Fase 4 del plan) — compartido entre el
// inbox (WhatsappTab) y el panel embebido en el lead (WhatsappLeadCard). No
// renderiza nada si el workspace no tiene el bot activado (workspaceBotEnabled):
// el feature completo queda invisible para quien no lo configuró.
export default function WhatsappBotToggle({ conversationId, botEnabled, workspaceBotEnabled, onChanged }) {
  const [saving, setSaving] = useState(false)
  if (!workspaceBotEnabled) return null

  async function toggle() {
    setSaving(true)
    try {
      const { data } = await api.patch(`/whatsapp/conversations/${conversationId}/bot`, { botEnabled: !botEnabled })
      onChanged?.(data.botEnabled)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <span
        className={`text-[11px] px-2 py-1 rounded-full font-medium ${
          botEnabled
            ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
        }`}
        title={botEnabled ? 'El bot responde automáticamente los mensajes entrantes' : 'Un humano tomó el control — el bot no responde acá'}
      >
        {botEnabled ? '🤖 Bot' : '🙋 Vos'}
      </span>
      <button
        onClick={toggle}
        disabled={saving}
        className="text-[11px] px-2 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
      >
        {botEnabled ? 'Tomar el control' : 'Devolver al bot'}
      </button>
    </div>
  )
}
