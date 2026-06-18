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
  tardanzas: {
    key:           'tardanzas',
    name:          'Tardanzas',
    unit:          null,            // es un conteo de llegadas tarde; el número habla solo
    lowerIsBetter: true,            // menos es mejor
    description:   'Cantidad de llegadas tarde del equipo en la semana (primer ingreso vs horario + tolerancia). La tarjeta muestra el top 3 de quienes más llegaron tarde.',
  },
  ocupacion: {
    key:           'ocupacion',
    name:          'Ocupación',
    unit:          '%',
    lowerIsBetter: false,           // más es mejor
    description:   'Horas trabajadas del equipo sobre horas disponibles (según el horario cargado de cada uno). Solo cuenta a quienes tienen horario. La tarjeta muestra el top 3 que menos aprovecharon sus horas.',
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
