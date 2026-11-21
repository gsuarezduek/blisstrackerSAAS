// Criterio único de las subtareas (checklist) de una tarea — ver Task.checklist en
// schema.prisma. Acá vive solo lógica pura: la usan el controller
// (tasks/checklist.controller.js), la creación de tareas (tasks/lifecycle.controller.js)
// y la materialización de recurrencias (services/recurrence.service.js), que no debería
// depender de un controller.

// Tope duro: más de 20 subtareas no es un checklist, es un proyecto. Para eso está
// "Convertir en tarea", que saca el ítem y crea una Task de verdad.
const MAX_ITEMS_PER_TASK = 20
const MAX_TEXT_LEN = 200

function cleanText(raw) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return null
  return text.slice(0, MAX_TEXT_LEN)
}

// Texto libre de varias líneas (o ya un array) → array de textos listos para guardar.
// Un solo campo acepta tanto "una subtarea" como una lista pegada de otro lado, que
// suele venir con viñetas o tildes ya puestos.
function parseChecklistInput(input) {
  const lines = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split('\n')
      : []
  return lines
    .map(line => cleanText(String(line).replace(/^\s*(?:[-*•–]|\[[ xX]?\])\s*/, '')))
    .filter(Boolean)
    .slice(0, MAX_ITEMS_PER_TASK)
}

// Plantilla de subtareas de una recurrencia: JSON de strings en TaskRecurrence.checklist
// (mismo patrón que weekdays, no un Json nativo). Tolera null/basura: una plantilla
// corrupta deja la instancia sin checklist, nunca rompe la materialización. Se exige un
// array: un JSON que es un string u otro escalar es dato corrupto, y pasarlo por
// parseChecklistInput lo convertiría en una subtarea basura en cada ocurrencia.
function parseChecklistTemplate(json) {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parseChecklistInput(parsed) : []
  } catch {
    return []
  }
}

// `data.checklist` de un prisma.task.create a partir de la entrada del usuario, o
// undefined si no hay subtareas (así el create queda igual que antes).
function checklistCreateData(input) {
  const texts = parseChecklistInput(input)
  if (texts.length === 0) return undefined
  return { create: texts.map((text, order) => ({ text, order })) }
}

module.exports = {
  MAX_ITEMS_PER_TASK, MAX_TEXT_LEN,
  cleanText, parseChecklistInput, parseChecklistTemplate, checklistCreateData,
}
