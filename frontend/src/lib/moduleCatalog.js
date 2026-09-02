/**
 * Catálogo de módulos opcionales (feature flags que el workspace puede prender/apagar).
 * Única fuente de ícono/copy — usado por Preferencias → Módulos adicionales y por el
 * wizard de onboarding (selector de módulos + tour adaptativo), para no duplicar texto.
 *
 * `detail`   — explicación larga (usada en Preferencias y en el selector del wizard).
 * `tourBody` — recap corto en tono de coach, para el paso del tour de ese módulo.
 */
export const MODULE_CATALOG = {
  marketing: {
    icon: '📊',
    label: 'Marketing',
    detail: 'Incluye análisis GEO/SEO, métricas de redes sociales, informes mensuales para clientes, Google Analytics, Google Ads, Meta Ads y más.',
    tourBody: 'En el menú vas a ver "Marketing": GEO Audit, SEO, Ads, Social, todo por proyecto. Los Informes mensuales generan una URL pública que le mandás al cliente sin que se loguee.',
  },
  eos: {
    icon: '🏢',
    label: 'EOS / Traction',
    detail: 'Sistema Operativo Empresarial basado en Traction (Gino Wickman). Incluye Visión, Personas, Datos, Scorecard, Asuntos, Procesos, Tracción y Evaluación.',
    tourBody: 'En "EOS" vas a encontrar los 7 componentes de Traction: Visión, Personas, Datos (Scorecard), Asuntos, Procesos, Tracción (Rocks + L10) y Evaluación organizacional.',
  },
  ventas: {
    icon: '💰',
    label: 'Ventas (CRM)',
    detail: 'CRM comercial: pipeline de leads y oportunidades, empresas y contactos, timeline automático, próximas acciones, investigación de empresas con IA y generador de propuestas.',
    tourBody: 'En "Ventas" tenés tu pipeline comercial: leads, empresas, próximas acciones, y una IA que investiga la empresa y arma propuestas por vos.',
  },
  gamification: {
    icon: '🏆',
    label: 'Gamification',
    detail: 'Juegos y desafíos para el equipo: competencias entre proyectos, personas o equipos, votaciones y rankings por premios.',
    tourBody: 'El botón 🏆 flotante abre los juegos activos de tu equipo: competencias, votaciones y rankings con premio.',
  },
  contenido: {
    icon: '📅',
    label: 'Contenido',
    detail: 'Calendario de contenido para redes sociales: piezas por proyecto, vistas Calendario/Tabla/Kanban, comentarios internos y aprobación del cliente desde el portal.',
    tourBody: 'En "Contenido" armás el calendario de piezas de RRSS por proyecto y pedís aprobación al cliente sin que tenga que loguearse.',
  },
  rrhh: {
    icon: '👥',
    label: 'RRHH',
    detail: 'Dashboard del equipo, ingresos y puntualidad, legajos, vacaciones y licencias, y Productividad (métricas de rendimiento por persona y por proyecto).',
    tourBody: 'En "RRHH" tenés el dashboard del equipo, ingresos, legajos, vacaciones y Productividad, todo en un solo lugar.',
  },
}

export function moduleMeta(key, fallbackName) {
  return MODULE_CATALOG[key] ?? { icon: '🔧', detail: fallbackName ?? '', tourBody: fallbackName ?? '' }
}
