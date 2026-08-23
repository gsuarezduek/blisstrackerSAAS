// Catálogo del motor de reglas de reactivación de WhatsApp (extiende la Fase
// 5 del plan). `triggerType` es cerrado en código, no un enum de Prisma —
// agregar un trigger nuevo es sumarlo acá + su cómputo en
// whatsappAutomation.service.js, sin migración. Espejo de labels en
// frontend/src/components/ventas/whatsappAutomationCatalog.js.
const TRIGGER_TYPES = [
  {
    key: 'no_reply_days',
    label: 'El contacto no responde hace N días',
    hint: 'Toma la última respuesta del contacto en la conversación de WhatsApp del lead (o la fecha del primer mensaje si nunca respondió).',
  },
  {
    key: 'action_overdue_days',
    label: 'Próxima acción vencida hace N días',
    hint: 'Toma la "próxima acción" pendiente más antigua del lead (ver ficha del Lead → Próximas acciones).',
  },
]
const TRIGGER_TYPE_KEYS = TRIGGER_TYPES.map(t => t.key)
function isValidTriggerType(key) { return TRIGGER_TYPE_KEYS.includes(key) }

// Merge tags reconocidos al resolver WhatsappAutomationRule.variableMapping
// contra un lead puntual — texto libre, no hace falta usar ninguno.
const MERGE_TOKENS = [
  { key: '{{contact_name}}', label: 'Nombre del contacto' },
  { key: '{{company_name}}', label: 'Nombre de la empresa' },
  { key: '{{lead_title}}',   label: 'Título del lead' },
  { key: '{{owner_name}}',   label: 'Responsable del lead' },
]

module.exports = { TRIGGER_TYPES, TRIGGER_TYPE_KEYS, isValidTriggerType, MERGE_TOKENS }
