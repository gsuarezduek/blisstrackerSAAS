// Color de identidad de un agente de IA.
//
// Sirve para distinguir un agente de OTRO agente de un vistazo. Lo que lo distingue de
// una PERSONA es el glifo Bot, no el color: un agente nunca lleva avatar de persona —
// darle cara empeora justo la confusión que esto viene a resolver.
//
// Mismo mecanismo que utils/roleColor.js (hash determinístico sobre una paleta fija), y
// por el mismo motivo: así un agente que nunca eligió color igual sale distinto de los
// demás, sin backfill ni un paso de configuración obligatorio. La columna `color` de
// McpToken solo guarda el override.
//
// La paleta es espejo de AGENT_COLORS en backend/src/controllers/agents.controller.js
// (que valida el override) — mantener las dos en sync.

export const AGENT_COLORS = ['sky', 'violet', 'emerald', 'amber', 'rose', 'cyan', 'indigo', 'teal']

// Clases de Tailwind por color. Literales completos y no interpolados (`bg-${c}-100`):
// el JIT de Tailwind escanea el fuente y no genera las clases que arma en runtime.
const CLASSES = {
  sky:     { chip: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',             text: 'text-sky-700 dark:text-sky-300' },
  violet:  { chip: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', text: 'text-violet-700 dark:text-violet-300' },
  emerald: { chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', text: 'text-emerald-700 dark:text-emerald-300' },
  amber:   { chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',     text: 'text-amber-700 dark:text-amber-300' },
  rose:    { chip: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',         text: 'text-rose-700 dark:text-rose-300' },
  cyan:    { chip: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',         text: 'text-cyan-700 dark:text-cyan-300' },
  indigo:  { chip: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300', text: 'text-indigo-700 dark:text-indigo-300' },
  teal:    { chip: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',         text: 'text-teal-700 dark:text-teal-300' },
}

// Hash determinístico → el mismo agente obtiene siempre el mismo color en toda la app.
// Mismo algoritmo que roleColor().
function derive(seed) {
  let hash = 0
  for (const c of (seed || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return AGENT_COLORS[hash % AGENT_COLORS.length]
}

// Nombre del color de un agente: el elegido si es válido, si no el derivado de su
// nombre (y del id como respaldo, para que dos agentes sin nombre no colisionen).
export function agentColorName(agent) {
  const picked = agent?.color
  if (picked && AGENT_COLORS.includes(picked)) return picked
  return derive(agent?.label?.trim() || `agente-${agent?.id ?? ''}`)
}

// Clases para el cuadradito/avatar del agente.
export function agentChipClass(agent) {
  return CLASSES[agentColorName(agent)].chip
}

// Clases para texto suelto del color del agente.
export function agentTextClass(agent) {
  return CLASSES[agentColorName(agent)].text
}
