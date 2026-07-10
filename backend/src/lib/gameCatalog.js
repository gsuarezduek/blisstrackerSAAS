// Catálogo único de TIPOS de juego de Gamification.
// El admin crea INSTANCIAS (modelo Game) eligiendo un tipo de acá y configurándolo.
// El frontend obtiene este catálogo vía GET /api/gamification/catalog (sin mirror).
//
// Cada tipo define:
//   - name, description    : textos legibles para el panel admin
//   - subjectType          : "project" | "person" | "team" (quién compite)
//   - scoring              : "auto_metric" | "vote" | "manual" (cómo se puntúa)
//   - direction            : "higher" (mayor mejor) | "lower" (menor mejor)
//   - requiresPeriod       : necesita startDate/endDate para medir
//   - subjectConfigurable  : el admin elige el subjectType al crear (solo custom)
//   - metricRequired       : (auto_metric) el admin elige una métrica de MARKETING_METRICS
//   - defaultVisibility    : visibilityRule sugerida al crear

const SUBJECT_TYPES   = ['project', 'person', 'team']
const SCORING_MODES   = ['auto_metric', 'vote', 'manual', 'quiz']
const VISIBILITY_MODES = ['always', 'date_range', 'recurring']
// Tipos de ventana recurrente soportados por el motor de visibilidad.
const RECURRING_KINDS = ['last_n_days_of_month', 'first_n_days_of_month', 'day_range_of_month', 'weekdays']

const GAME_TYPES = {
  marketing_project_competition: {
    name: 'Competencia de proyectos de Marketing',
    description: 'Los proyectos compiten por una métrica de marketing (seguidores, interacción, visitas web, GEO, autoridad de dominio o anuncios) durante el período. El puntaje se calcula solo desde los datos de marketing de cada proyecto.',
    subjectType: 'project',
    scoring: 'auto_metric',
    direction: 'higher',
    requiresPeriod: true,
    subjectConfigurable: false,
    metricRequired: true,
    defaultVisibility: { mode: 'date_range' },
  },
  employee_of_month_vote: {
    name: 'Compañero del mes (votación)',
    description: 'El equipo vota a su compañero del mes. Cada persona emite un voto y no puede votarse a sí misma. Los votos quedan ocultos hasta el cierre.',
    subjectType: 'person',
    scoring: 'vote',
    requiresPeriod: false,
    subjectConfigurable: false,
    // Por defecto solo visible la última semana del mes (configurable).
    defaultVisibility: { mode: 'recurring', kind: 'last_n_days_of_month', n: 7 },
  },
  quiz_challenge: {
    name: 'Cuestionario (preguntas y respuestas)',
    description: 'Un cuestionario con preguntas de opción múltiple (una correcta por pregunta, suman puntos) y/o preguntas abiertas de texto libre (informativas, no puntúan). Cada persona responde una vez. Gana quien más puntos hace por las respuestas correctas.',
    subjectType: 'person',
    scoring: 'quiz',
    requiresPeriod: false,
    subjectConfigurable: false,
    defaultVisibility: { mode: 'always' },
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

// ─── Métricas de marketing para "Competencia de proyectos de Marketing" ───────
// kind define cómo las calcula gamification.service:
//   followers     → delta de seguidores en el período (daily *FollowerLog) por red
//   interaction   → suma de interacciones del período (snapshots mensuales) por red
//   web_visits    → suma de sesiones (AnalyticsSnapshot)
//   geo_score     → último score de GEO (GeoAudit completado)
//   domain_rating → Domain Rating actual del proyecto (Ahrefs)
//   ads_ctr       → CTR del período (AdsSnapshot, ponderado por impresiones)
//   ads_spend     → inversión del período (AdsSnapshot, suma de spend)
// Todas son "mayor es mejor". `growth: true` marca un delta (se muestra con +).
// `needsPlatform: true` requiere elegir meta_ads | google_ads.

const MARKETING_METRICS = {
  followers_instagram:   { category: 'rrss', label: 'Más seguidores · Instagram', kind: 'followers', network: 'instagram', unit: '', growth: true },
  followers_tiktok:      { category: 'rrss', label: 'Más seguidores · TikTok',    kind: 'followers', network: 'tiktok',    unit: '', growth: true },
  followers_linkedin:    { category: 'rrss', label: 'Más seguidores · LinkedIn',  kind: 'followers', network: 'linkedin',  unit: '', growth: true },
  followers_facebook:    { category: 'rrss', label: 'Más seguidores · Facebook',  kind: 'followers', network: 'facebook',  unit: '', growth: true },
  interaction_instagram: { category: 'rrss', label: 'Más interacción · Instagram', kind: 'interaction', network: 'instagram', unit: '' },
  interaction_tiktok:    { category: 'rrss', label: 'Más interacción · TikTok',    kind: 'interaction', network: 'tiktok',    unit: '' },
  interaction_linkedin:  { category: 'rrss', label: 'Más interacción · LinkedIn',  kind: 'interaction', network: 'linkedin',  unit: '' },
  interaction_facebook:  { category: 'rrss', label: 'Más interacción · Facebook',  kind: 'interaction', network: 'facebook',  unit: '' },
  web_visits:            { category: 'web', label: 'Más visitas a la web', kind: 'web_visits', unit: '' },
  geo_score:             { category: 'seo', label: 'Mejor posicionamiento GEO', kind: 'geo_score', unit: '' },
  domain_rating:         { category: 'seo', label: 'Mayor autoridad de dominio (DR)', kind: 'domain_rating', unit: '' },
  ads_ctr:               { category: 'ads', label: 'Mayor CTR en anuncios', kind: 'ads_ctr', unit: '%', needsPlatform: true },
  ads_spend:             { category: 'ads', label: 'Mayor inversión en anuncios', kind: 'ads_spend', unit: '$', needsPlatform: true },
}

const MARKETING_CATEGORIES = [
  { key: 'rrss', label: 'Redes sociales' },
  { key: 'web',  label: 'Web' },
  { key: 'seo',  label: 'SEO / GEO' },
  { key: 'ads',  label: 'Anuncios' },
]

function gameTypeDef(type)              { return GAME_TYPES[type] || null }
function isValidGameType(type)          { return Object.prototype.hasOwnProperty.call(GAME_TYPES, type) }
function marketingMetricDef(key)        { return MARKETING_METRICS[key] || null }
function isValidMarketingMetric(key)    { return Object.prototype.hasOwnProperty.call(MARKETING_METRICS, key) }

module.exports = {
  GAME_TYPES, SUBJECT_TYPES, SCORING_MODES, VISIBILITY_MODES, RECURRING_KINDS,
  MARKETING_METRICS, MARKETING_CATEGORIES,
  gameTypeDef, isValidGameType, marketingMetricDef, isValidMarketingMetric,
}
