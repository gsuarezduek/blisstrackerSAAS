// Secciones que se prenden/apagan POR PROYECTO (ver concepto "Secciones por
// proyecto (Marketing, Contenido, Briefs)" en CLAUDE.md). Para Marketing y Contenido
// son un segundo filtro, independiente del feature flag del workspace: el flag dice
// si el workspace tiene el módulo, esto si ESTE proyecto lo usa. Un proyecto apagado
// no aparece en la sección, ni en su selector, ni en los agregados cross-proyecto,
// ni en los snapshots mensuales. Briefs no tiene flag de workspace (está siempre
// disponible), así que su toggle de proyecto es la única palanca.
//
// Criterio único para todo el backend (mismo rol que HUMAN_TASK_WHERE en
// lib/agentTasks.js): nadie escribe `marketingEnabled: true` a mano.
const PROJECT_MODULE_FIELD = {
  marketing: 'marketingEnabled',
  contenido: 'contenidoEnabled',
  briefs:    'briefsEnabled',
}

const PROJECT_MODULE_LABEL = {
  marketing: 'Marketing',
  contenido: 'Contenido',
  briefs:    'Briefs',
}

// Las secciones que un proyecto NUEVO estrena apagadas. El default del modelo sigue
// siendo `true` para no tocar los proyectos que ya existen; esto aplica solo al alta
// (ver `createProject`). Briefs arranca apagado porque es un relevamiento que la
// mayoría de las cuentas no completa: que la pestaña aparezca vacía en todas no
// ayuda a nadie, y prenderlo es un click en la ficha.
const PROJECT_MODULE_OFF_BY_DEFAULT_ON_CREATE = ['briefs']

// `where` sobre Project — para `prisma.project.findMany({ where: { ...MARKETING_PROJECT_WHERE } })`.
const MARKETING_PROJECT_WHERE = { marketingEnabled: true }
const CONTENIDO_PROJECT_WHERE = { contenidoEnabled: true }

// `where` sobre un modelo que CUELGA de Project (ProjectIntegration, TrackedKeyword,
// ProjectCompetitor…): `{ ...marketingProjectRelationWhere() }` se compone con el
// resto del filtro de `project` que ya tenga la query.
function projectModuleWhere(key) {
  const field = PROJECT_MODULE_FIELD[key]
  if (!field) throw new Error(`Módulo de proyecto desconocido: ${key}`)
  return { [field]: true }
}

// ¿El proyecto (una fila ya cargada) tiene el módulo prendido? `undefined` cuenta
// como prendido: el campo puede no venir en el `select` de quien llama, y en ese caso
// el default del modelo es `true` — nunca se esconde algo por no haberlo pedido.
function isProjectModuleEnabled(project, key) {
  const field = PROJECT_MODULE_FIELD[key]
  if (!field) throw new Error(`Módulo de proyecto desconocido: ${key}`)
  return project?.[field] !== false
}

module.exports = {
  PROJECT_MODULE_FIELD,
  PROJECT_MODULE_LABEL,
  PROJECT_MODULE_OFF_BY_DEFAULT_ON_CREATE,
  MARKETING_PROJECT_WHERE,
  CONTENIDO_PROJECT_WHERE,
  projectModuleWhere,
  isProjectModuleEnabled,
}
