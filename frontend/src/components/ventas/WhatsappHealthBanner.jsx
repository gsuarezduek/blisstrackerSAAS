import { TriangleAlert } from 'lucide-react'
import { Icon } from '../ui/Icon'

// Cartel de "el WhatsApp dejó de recibir mensajes". El estado lo calcula el
// backend (services/whatsappWebhookHealth.service.js): `status` de la cuenta dice
// que se conectó, no que lleguen mensajes, y cuando Chakra deja de mandar el
// webhook nada lo avisa. Llega en GET /whatsapp/account y en vivo por
// `whatsapp:health`; desaparece solo cuando el webhook vuelve a recibir algo.

function sinceLabel(date) {
  if (!date) return null
  const mins = Math.floor((Date.now() - new Date(date)) / 60000)
  if (mins < 60) return `hace ${Math.max(mins, 1)} min`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} días`
}

const RECONNECT_HINT = 'Revisá el número en Chakra: sacar el teléfono y volver a agregarlo suele resolverlo.'

export default function WhatsappHealthBanner({ account }) {
  const health = account?.webhookHealth
  if (!health || health === 'ok') return null

  const since = sinceLabel(account.lastWebhookAt)
  const lastSeen = since ? `No llega nada de WhatsApp desde ${since}.` : 'Todavía no llegó ningún mensaje de WhatsApp.'

  const { tone, title, body } = health === 'bad_signature'
    ? {
        tone: 'red',
        title: 'Los mensajes nuevos se están rechazando',
        body: 'Llegan eventos de Chakra pero con una firma que no coincide, así que no se guardan. Revisá que el Webhook Secret cargado en "Editar" sea el mismo que el de Chakra.',
      }
    : health === 'unconfirmed'
      ? {
          tone: 'red',
          title: 'El WhatsApp dejó de recibir mensajes',
          body: `${lastSeen} Lo que se manda desde acá no recibe confirmación de entrega, así que lo más probable es que el número se haya desconectado. ${RECONNECT_HINT}`,
        }
      : {
          tone: 'amber',
          title: 'Puede que el WhatsApp se haya desconectado',
          body: `${lastSeen} Es más tiempo del habitual para este número. ${RECONNECT_HINT}`,
        }

  const toneClass = tone === 'red'
    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'

  return (
    <div role="alert" className={`flex items-start gap-2 px-4 py-2.5 border-b text-sm ${toneClass}`}>
      <Icon as={TriangleAlert} size={16} className="flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs mt-0.5 opacity-90">{body}</p>
      </div>
    </div>
  )
}
