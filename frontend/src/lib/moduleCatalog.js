import { ChartColumn, Compass, Handshake, Trophy, CalendarDays, Users, Puzzle, Landmark } from 'lucide-react'

/**
 * Catálogo de módulos opcionales (feature flags que el workspace puede prender/apagar).
 * Única fuente de ícono (lucide, componente)/copy — usado por Preferencias → Módulos adicionales y por el
 * wizard de onboarding (selector de módulos + tour adaptativo), para no duplicar texto.
 *
 * `detail`   — explicación larga (usada en Preferencias y en el selector del wizard).
 * `tourBody` — recap corto en tono de coach, para el paso del tour de ese módulo.
 */
export const MODULE_CATALOG = {
  marketing: {
    icon: ChartColumn,
    label: 'Marketing',
    detail: 'Incluye análisis GEO/SEO, métricas de redes sociales, informes mensuales para clientes, Google Analytics, Google Ads, Meta Ads y más.',
    tourBody: 'En el menú vas a ver "Marketing": GEO Audit, SEO, Ads, Social, todo por proyecto. Los Informes mensuales generan una URL pública que le mandás al cliente sin que se loguee.',
  },
  eos: {
    icon: Compass,
    label: 'EOS / Traction',
    detail: 'Sistema Operativo Empresarial basado en Traction (Gino Wickman). Incluye Visión, Personas, Datos, Scorecard, Asuntos, Procesos, Tracción y Evaluación.',
    tourBody: 'En "EOS" vas a encontrar los 7 componentes de Traction: Visión, Personas, Datos (Scorecard), Asuntos, Procesos, Tracción (Rocks + L10) y Evaluación organizacional.',
  },
  ventas: {
    icon: Handshake,
    label: 'Ventas (CRM)',
    detail: 'CRM comercial: pipeline de leads y oportunidades, empresas y contactos, timeline automático, próximas acciones, investigación de empresas con IA y generador de propuestas.',
    tourBody: 'En "Ventas" tenés tu pipeline comercial: leads, empresas, próximas acciones, y una IA que investiga la empresa y arma propuestas por vos.',
  },
  gamification: {
    icon: Trophy,
    label: 'Gamification',
    detail: 'Juegos y desafíos para el equipo: competencias entre proyectos, personas o equipos, votaciones y rankings por premios.',
    tourBody: 'El botón flotante de Juegos abre los juegos activos de tu equipo: competencias, votaciones y rankings con premio.',
  },
  contenido: {
    icon: CalendarDays,
    label: 'Contenido',
    detail: 'Calendario de contenido para redes sociales: piezas por proyecto, vistas Calendario/Tabla/Kanban, comentarios internos y aprobación del cliente desde el portal.',
    tourBody: 'En "Contenido" armás el calendario de piezas de RRSS por proyecto y pedís aprobación al cliente sin que tenga que loguearse.',
  },
  rrhh: {
    icon: Users,
    label: 'RRHH',
    detail: 'Legajos, ingresos, licencias, vacaciones (con acumulación automática configurable), y beneficios de horas libres / días home. Configurable por rol — a diferencia de EOS/Gamification, incluye datos personales sensibles (DNI, salud, cuenta bancaria) para quien tenga acceso.',
    tourBody: 'En "RRHH" gestionás legajos, licencias, vacaciones y los beneficios de horas libres / días home del equipo.',
  },
  finanzas: {
    icon: Landmark,
    label: 'Finanzas',
    detail: 'Finanzas internas de la agencia: ingresos, egresos, saldos por cuenta/moneda, cuenta corriente de clientes (facturas y cobros), extras puntuales y un tablero de pendientes asistido por IA. Configurable por rol — dato sensible, igual que Ventas/RRHH; la Configuración del módulo es admin/owner siempre.',
    tourBody: 'En "Finanzas" cargás ingresos/egresos, ves saldos por cuenta y la cuenta corriente de tus clientes.',
  },
}

export function moduleMeta(key, fallbackName) {
  return MODULE_CATALOG[key] ?? { icon: Puzzle, detail: fallbackName ?? '', tourBody: fallbackName ?? '' }
}
