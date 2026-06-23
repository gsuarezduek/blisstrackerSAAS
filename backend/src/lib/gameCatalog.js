// Catálogo único de TIPOS de juego de Gamification.
// El admin crea INSTANCIAS (modelo Game) eligiendo un tipo de acá y configurándolo.
// Espejo (solo para render del formulario) en frontend/src/components/gamification/gameCatalog.js.
//
// Cada tipo define:
//   - name, description    : textos legibles para el panel admin
//   - subjectType          : "project" | "person" | "team" (quién compite)
//   - scoring              : "auto_metric" | "vote" | "manual" (cómo se puntúa)
//   - metric               : (solo auto_metric) métrica que lee el motor
//   - direction            : "higher" (mayor mejor) | "lower" (menor mejor)
//   - requiresPeriod       : necesita startDate/endDate para medir
//   - subjectConfigurable  : el admin elige el subjectType al crear (solo custom)
//   - defaultVisibility    : visibilityRule sugerida al crear

const SUBJECT_TYPES   = ['project', 'person', 'team']
const SCORING_MODES   = ['auto_metric', 'vote', 'manual']
const VISIBILITY_MODES = ['always', 'date_range', 'recurring']
// Tipos de ventana recurrente soportados por el motor de visibilidad.
const RECURRING_KINDS = ['last_n_days_of_month', 'first_n_days_of_month', 'day_range_of_month', 'weekdays']

const GAME_TYPES = {
  instagram_followers_competition: {
    name: 'Competencia de seguidores de Instagram',
    description: 'Cada proyecto compite por ganar más seguidores de Instagram durante el período. El puntaje se calcula solo desde los seguidores registrados de cada proyecto.',
    subjectType: 'project',
    scoring: 'auto_metric',
    metric: 'instagram_followers',
    direction: 'higher',
    requiresPeriod: true,
    subjectConfigurable: false,
    defaultVisibility: { mode: 'date_range' },
  },
  employee_of_month_vote: {
    name: 'Compañero del mes (votación)',
    description: 'El equipo vota a su compañero del mes. Cada persona emite un voto y no puede votarse a sí misma.',
    subjectType: 'person',
    scoring: 'vote',
    requiresPeriod: false,
    subjectConfigurable: false,
    // Por defecto solo visible la última semana del mes (configurable).
    defaultVisibility: { mode: 'recurring', kind: 'last_n_days_of_month', n: 7 },
  },
  custom_challenge: {
    name: 'Desafío personalizado (puntaje manual)',
    description: 'Desafío libre: definís el enunciado y cargás los puntos a mano. Podés elegir si compiten proyectos, personas o equipos.',
    subjectType: 'team',
    scoring: 'manual',
    requiresPeriod: false,
    subjectConfigurable: true,
    defaultVisibility: { mode: 'always' },
  },
}

function gameTypeDef(type)    { return GAME_TYPES[type] || null }
function isValidGameType(type) { return Object.prototype.hasOwnProperty.call(GAME_TYPES, type) }

module.exports = {
  GAME_TYPES, SUBJECT_TYPES, SCORING_MODES, VISIBILITY_MODES, RECURRING_KINDS,
  gameTypeDef, isValidGameType,
}
