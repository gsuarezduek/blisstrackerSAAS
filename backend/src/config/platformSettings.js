/**
 * Catálogo de configuración global de la plataforma BlissTracker.
 *
 * Agregar un nuevo setting acá es suficiente: al arrancar el servidor se hace
 * upsert automático en la DB con el `default` definido. El SuperAdmin lo edita
 * desde el panel `/superadmin` → "Configuración".
 *
 * Campos:
 *   key      — identificador único, usado en getSetting('key')
 *   type     — 'integer' | 'float' | 'boolean' | 'string' | 'pricingTiers'
 *   default  — valor inicial (al crear el row por primera vez)
 *   min/max  — bounds opcionales (defensa en profundidad)
 *   group    — 'commercial' | 'operational' (para agrupar la UI)
 *   label    — nombre legible
 *   help     — descripción larga para el panel
 */
const PLATFORM_SETTINGS = [
  // ─── Comercial ─────────────────────────────────────────────────────────────
  {
    key:     'trialDays',
    type:    'integer',
    default: 14,
    min:     0,
    max:     365,
    group:   'commercial',
    label:   'Duración del trial (días)',
    help:    'Cantidad de días que duran los trials de los nuevos workspaces. Los workspaces existentes mantienen su trialEndsAt actual.',
  },
  {
    key:     'freeSeatLimit',
    type:    'integer',
    default: 3,
    min:     0,
    max:     1000,
    group:   'commercial',
    label:   'Usuarios gratis (plan Gratis)',
    help:    'Cantidad máxima de usuarios activos que un workspace puede tener sin pagar. Al vencer el trial, los workspaces con esta cantidad o menos pasan al plan Gratis (acceso completo al core, sin suscripción); los que superan el límite quedan en past_due hasta activar Pro. 0 = no hay plan gratis (todos deben pagar al vencer el trial).',
  },
  {
    key:     'defaultMonthlyTokenLimit',
    type:    'integer',
    default: 1_000_000,
    min:     0,
    group:   'commercial',
    label:   'Límite mensual de tokens de IA (default para nuevos workspaces)',
    help:    'Aplica solo a workspaces nuevos. Los existentes mantienen su monthlyTokenLimit propio (editable por workspace). 0 = ilimitado.',
  },
  {
    key:     'pricingTiers',
    type:    'pricingTiers',
    default: [
      { upTo: 19,   pricePerSeat: 3 },
      { upTo: null, pricePerSeat: 2 },
    ],
    group: 'commercial',
    label: 'Pricing tiers (USD por seat / mes)',
    help:  'Debe coincidir con el catálogo de productos en Stripe — si lo cambiás acá, actualizá también el precio en Stripe Dashboard. upTo: null = tier superior sin tope.',
  },
  {
    key:     'haikuInputCostPer1M',
    type:    'float',
    default: 0.80,
    min:     0,
    group:   'commercial',
    label:   'Costo Claude Haiku — input (USD / 1M tokens)',
    help:    'Precio actual de Anthropic para tokens de entrada de Claude Haiku. Actualizá cuando Anthropic cambie sus tarifas.',
  },
  {
    key:     'haikuOutputCostPer1M',
    type:    'float',
    default: 4.00,
    min:     0,
    group:   'commercial',
    label:   'Costo Claude Haiku — output (USD / 1M tokens)',
    help:    'Precio actual de Anthropic para tokens de salida de Claude Haiku.',
  },

  // ─── Operativo ─────────────────────────────────────────────────────────────
  {
    key:     'aiCooldownMinutes',
    type:    'integer',
    default: 60,
    min:     0,
    max:     1440,
    group:   'operational',
    label:   'Cooldown de regeneración IA (minutos)',
    help:    'Tiempo mínimo entre regeneraciones de insights diarios y análisis SEO. Aplica a insights del Dashboard y al análisis SEO de Search Console.',
  },
  {
    key:     'tokenWarningPct',
    type:    'integer',
    default: 90,
    min:     50,
    max:     99,
    group:   'operational',
    label:   'Umbral de warning de tokens (%)',
    help:    'Porcentaje de consumo a partir del cual un workspace entra en estado "warning". Debe ser menor que el umbral crítico.',
  },
  {
    key:     'tokenCriticalPct',
    type:    'integer',
    default: 95,
    min:     51,
    max:     100,
    group:   'operational',
    label:   'Umbral crítico de tokens (%)',
    help:    'Porcentaje de consumo a partir del cual un workspace entra en estado "critical". Debe ser mayor que el umbral de warning.',
  },
  {
    key:     'trialingSoonDays',
    type:    'integer',
    default: 7,
    min:     1,
    max:     90,
    group:   'operational',
    label:   'Alerta "trial por vencer" (días)',
    help:    'Días restantes a partir de los cuales un trial aparece en el dashboard SuperAdmin como "próximo a vencer".',
  },
  {
    key:     'notificationReadRetentionDays',
    type:    'integer',
    default: 30,
    min:     7,
    max:     3650,
    group:   'operational',
    label:   'Retención de notificaciones leídas (días)',
    help:    'Después de cuántos días se borran las notificaciones leídas. Aplica en el cron de limpieza semanal (domingos 03:00).',
  },
  {
    key:     'notificationUnreadRetentionDays',
    type:    'integer',
    default: 90,
    min:     7,
    max:     3650,
    group:   'operational',
    label:   'Retención de notificaciones no leídas (días)',
    help:    'Después de cuántos días se borran las notificaciones no leídas (asumiendo que ya no son relevantes).',
  },
  {
    key:     'aiTokenLogsRetentionDays',
    type:    'integer',
    default: 90,
    min:     30,
    max:     3650,
    group:   'operational',
    label:   'Retención de logs de tokens IA (días)',
    help:    'Después de cuántos días se borran los registros individuales de uso de tokens. Los agregados mensuales del dashboard siguen funcionando.',
  },
  {
    key:     'loginHistoryRetentionDays',
    type:    'integer',
    default: 180,
    min:     30,
    max:     3650,
    group:   'operational',
    label:   'Retención de historial de logins (días)',
    help:    'Después de cuántos días se borran los registros de UserLogin. Afecta el panel RRHH → Ingresos.',
  },
  {
    key:     'dailyInsightRetentionDays',
    type:    'integer',
    default: 365,
    min:     30,
    max:     3650,
    group:   'operational',
    label:   'Retención de insights diarios (días)',
    help:    'Después de cuántos días se borran los DailyInsight cacheados. No afecta los UserInsightMemory (perfil semanal de aprendizaje).',
  },
  {
    key:     'emailLogRetentionDays',
    type:    'integer',
    default: 180,
    min:     30,
    max:     3650,
    group:   'operational',
    label:   'Retención de logs de emails (días)',
    help:    'Después de cuántos días se borran los EmailLog. Afecta el panel SuperAdmin → Emails.',
  },
]

const SETTINGS_BY_KEY = Object.fromEntries(PLATFORM_SETTINGS.map(s => [s.key, s]))

const RETENTION_KEYS = [
  'notificationReadRetentionDays',
  'notificationUnreadRetentionDays',
  'aiTokenLogsRetentionDays',
  'loginHistoryRetentionDays',
  'dailyInsightRetentionDays',
  'emailLogRetentionDays',
]

module.exports = { PLATFORM_SETTINGS, SETTINGS_BY_KEY, RETENTION_KEYS }
