// Espejo de backend/src/lib/whatsappAutomationCatalog.js — mantener en sync.
export const TRIGGER_TYPES = [
  {
    key: 'no_reply_days',
    label: 'El contacto no responde hace N días',
    hint: 'Toma la última respuesta del contacto en la conversación de WhatsApp del lead (o la fecha del primer mensaje si nunca respondió).',
  },
  {
    key: 'action_overdue_days',
    label: 'Próxima acción vencida hace N días',
    hint: 'Toma la "próxima acción" pendiente más antigua del lead.',
  },
]

export const MERGE_TOKENS = [
  { key: '{{contact_name}}', label: 'Nombre del contacto' },
  { key: '{{company_name}}', label: 'Nombre de la empresa' },
  { key: '{{lead_title}}',   label: 'Título del lead' },
  { key: '{{owner_name}}',   label: 'Responsable del lead' },
]

export function triggerLabel(key) {
  return TRIGGER_TYPES.find(t => t.key === key)?.label || key
}
