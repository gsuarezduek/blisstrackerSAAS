// Criterio único de "strike activo" (mismo rol que `lib/projectModules.js` o
// `HUMAN_TASK_WHERE` en `lib/agentTasks.js`): lo consultan el panel de Desempeño,
// el tope de faltas al registrar una nueva y los contadores de RRHH. Un criterio
// duplicado acá es una persona que figura con 2 faltas en una pantalla y con 1 en
// la otra.
//
// Un strike deja de estar activo de dos maneras, a propósito distintas:
//  · VENCE solo, a los `Workspace.strikeExpiryMonths` de registrado (default 12,
//    0 = no vencen). Es lo que hace que una falta de hace tres años deje de pesar
//    sin que nadie tenga que acordarse de sacarla.
//  · LO LEVANTAN a mano, con motivo. Cubre el que se cargó por error y el que se
//    resolvió antes de tiempo.
// Nunca se borra: el historial es el punto de la regla de las 3 faltas.

// Vencimiento de un strike creado en `createdAt` con la política del workspace.
// null = no vence por tiempo.
function strikeExpiresAt(createdAt, months) {
  const m = Number(months)
  if (!Number.isFinite(m) || m <= 0) return null
  const d = new Date(createdAt)
  d.setMonth(d.getMonth() + m)
  return d
}

// ¿Esta fila sigue contando? (para una fila ya cargada)
function isStrikeActive(strike, now = new Date()) {
  if (!strike) return false
  if (strike.liftedAt) return false
  return !strike.expiresAt || new Date(strike.expiresAt) > now
}

// Lo mismo, como `where` de Prisma. `expiresAt: null` cuenta como "no vence":
// son los strikes creados mientras el workspace tenía el vencimiento apagado.
function activeStrikeWhere(now = new Date()) {
  return {
    liftedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  }
}

// Por qué dejó de estar activo, para la UI. null = sigue activo.
function strikeInactiveReason(strike, now = new Date()) {
  if (!strike || isStrikeActive(strike, now)) return null
  return strike.liftedAt ? 'lifted' : 'expired'
}

// Forma pública de un strike. `strikeNumber` se recalcula en LECTURA sobre los
// activos y no se lee de la columna: como los strikes vencen solos, el número que
// le tocaba al crearlo deja de ser cierto con el tiempo, y renumerar la tabla
// pediría un cron que corra todos los días para algo que se deriva en una línea.
// La columna queda como el número que tuvo al registrarse.
function shapeStrikes(rows, now = new Date()) {
  const sorted = [...rows].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  let activeIdx = 0
  return sorted.map(s => {
    const active = isStrikeActive(s, now)
    if (active) activeIdx++
    return {
      id: s.id,
      userId: s.userId,
      strikeNumber: active ? activeIdx : null,
      reason: s.reason,
      agreement: s.agreement ?? null,
      createdAt: s.createdAt,
      createdBy: s.createdBy ? { id: s.createdBy.id, name: s.createdBy.name } : null,
      expiresAt: s.expiresAt ?? null,
      liftedAt: s.liftedAt ?? null,
      liftReason: s.liftReason ?? null,
      liftedBy: s.liftedBy ? { id: s.liftedBy.id, name: s.liftedBy.name } : null,
      active,
      inactiveReason: strikeInactiveReason(s, now),
    }
  })
}

const MAX_ACTIVE_STRIKES = 3

module.exports = {
  MAX_ACTIVE_STRIKES,
  strikeExpiresAt,
  isStrikeActive,
  activeStrikeWhere,
  strikeInactiveReason,
  shapeStrikes,
}
