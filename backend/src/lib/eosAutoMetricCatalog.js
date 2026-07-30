// Catálogo de métricas AUTOMÁTICAS del Scorecard EOS (sección "Datos").
// A diferencia de las métricas manuales, sus valores los calcula el sistema a partir
// de datos que ya tiene (logins, horarios, tareas completadas) — no se cargan a mano.
// Cada una se materializa como un ScorecardMetric con `autoKey` = la clave de acá;
// name/unit/lowerIsBetter salen SIEMPRE de este catálogo (no son editables), solo la
// meta (goal) la define el admin. Todas son semanales.
//
// Para agregar un nuevo dato automático: sumar una entrada acá + su cálculo por semana
// en eosAutoScorecard.service.js. El frontend espeja este catálogo desde el endpoint.

const EOS_AUTO_METRICS = {
  // ── Semanales ──────────────────────────────────────────────────────────────
  tardanzas: {
    key:           'tardanzas',
    name:          'Tardanzas',
    unit:          null,            // es un conteo de llegadas tarde; el número habla solo
    lowerIsBetter: true,            // menos es mejor
    frequency:     'weekly',
    description:   'Cantidad de llegadas tarde del equipo en la semana (primer ingreso vs horario + tolerancia). La tarjeta muestra el top 3 de quienes más llegaron tarde.',
  },
  ocupacion: {
    key:           'ocupacion',
    name:          'Ocupación',
    unit:          '%',
    lowerIsBetter: false,           // más es mejor
    frequency:     'weekly',
    description:   'Horas trabajadas del equipo sobre horas disponibles (según el horario cargado de cada uno). Solo cuenta a quienes tienen horario. La tarjeta muestra el top 3 que menos aprovecharon sus horas.',
  },
  todos_completados: {
    key:           'todos_completados',
    name:          'To-Dos de L10 completados',
    unit:          null,            // conteo
    lowerIsBetter: false,           // más es mejor
    frequency:     'weekly',
    description:   'To-Dos de la reunión L10 marcados como completados, por semana. La tarjeta muestra el top 3 de quienes más completaron.',
  },
  tareas_completadas: {
    key:           'tareas_completadas',
    name:          'Tareas completadas',
    unit:          null,            // conteo
    lowerIsBetter: false,           // más es mejor
    frequency:     'weekly',
    description:   'Tareas que el equipo completó en la semana (por fecha de completado). La tarjeta muestra el top 3 de quienes más completaron.',
  },
  propuestas_enviadas: {
    key:           'propuestas_enviadas',
    name:          'Propuestas enviadas',
    unit:          null,            // conteo
    lowerIsBetter: false,           // más es mejor
    frequency:     'weekly',
    description:   'Propuestas comerciales generadas en Ventas durante la semana (cada versión cuenta). La tarjeta muestra el top 3 de quienes más generaron. Requiere el módulo Ventas.',
  },
  faltas: {
    key:           'faltas',
    name:          'Personas con faltas',
    unit:          null,            // conteo de personas
    lowerIsBetter: true,            // menos es mejor
    frequency:     'weekly',
    description:   'Cantidad de personas del equipo que acumulan una o más faltas (strikes de Personas) al cierre de la semana. La tarjeta lista quiénes y cuántas.',
  },

  // ── Mensuales (a mes vencido: solo se llenan los meses cerrados) ─────────────
  delta_horas: {
    key:           'delta_horas',
    name:          'Δ horas del equipo',
    unit:          '%',
    lowerIsBetter: false,
    frequency:     'monthly',
    description:   'Ocupación del equipo del mes cerrado (Σ horas trabajadas ÷ Σ horas disponibles, ponderada). Es el "Δ horas del equipo" de Productividad. La tarjeta muestra el top 3 que menos aprovecharon sus horas.',
  },
  proyectos_nuevos: {
    key:           'proyectos_nuevos',
    name:          'Proyectos nuevos',
    unit:          null,
    lowerIsBetter: false,
    frequency:     'monthly',
    description:   'Proyectos dados de alta en el mes (por fecha de creación). La tarjeta lista cuáles.',
  },
  proyectos_perdidos: {
    key:           'proyectos_perdidos',
    name:          'Proyectos perdidos',
    unit:          null,
    lowerIsBetter: true,
    frequency:     'monthly',
    description:   'Proyectos dados de baja en el mes (pasaron a inactivos). La tarjeta lista cuáles.',
  },
  equipo: {
    key:           'equipo',
    name:          'Equipo',
    unit:          null,
    lowerIsBetter: false,
    frequency:     'monthly',
    description:   'Cantidad de integrantes activos al cierre del mes (del histórico de RRHH). Si un mes no tiene snapshot, queda vacío.',
  },
  antiguedad: {
    key:           'antiguedad',
    name:          'Antigüedad promedio',
    unit:          'años',
    lowerIsBetter: false,
    frequency:     'monthly',
    description:   'Antigüedad promedio del equipo al cierre del mes (del histórico de RRHH). Si un mes no tiene snapshot, queda vacío.',
  },
  proyectos_por_persona: {
    key:           'proyectos_por_persona',
    name:          'Proyectos por persona',
    unit:          null,
    lowerIsBetter: false,
    frequency:     'monthly',
    description:   'Proyectos activos ÷ integrantes activos al cierre del mes (del histórico de RRHH). Si un mes no tiene snapshot, queda vacío.',
  },
  informes_entregados: {
    key:           'informes_entregados',
    name:          'Informes entregados',
    unit:          null,
    lowerIsBetter: false,
    frequency:     'monthly',
    description:   'Informes mensuales de marketing generados para el mes. La tarjeta lista los proyectos. Requiere el módulo Marketing.',
  },
  seguidores_nuevos: {
    key:           'seguidores_nuevos',
    name:          'Seguidores nuevos',
    unit:          null,
    lowerIsBetter: false,
    frequency:     'monthly',
    description:   'Seguidores netos ganados en el mes sumando Instagram, TikTok y LinkedIn de todos los proyectos. La tarjeta muestra el desglose por red. Requiere el módulo Marketing.',
  },
  objetivos_cumplidos: {
    key:           'objetivos_cumplidos',
    name:          'Objetivos de marketing cumplidos',
    unit:          '%',
    lowerIsBetter: false,
    frequency:     'monthly',
    description:   'Porcentaje de objetivos de marketing alcanzados (en verde) en el mes, sobre el total evaluable. La tarjeta lista los no cumplidos. Requiere el módulo Marketing.',
  },
}

const EOS_AUTO_KEYS = Object.keys(EOS_AUTO_METRICS)

function isAutoKey(k) {
  return typeof k === 'string' && Object.prototype.hasOwnProperty.call(EOS_AUTO_METRICS, k)
}

// Catálogo como array (para exponerlo al frontend).
function autoCatalogList() {
  return EOS_AUTO_KEYS.map(k => ({ ...EOS_AUTO_METRICS[k] }))
}

module.exports = { EOS_AUTO_METRICS, EOS_AUTO_KEYS, isAutoKey, autoCatalogList }
