// Navegación del panel RRHH: secciones por tarea (no por tipo de dato).
// Hoy = lo que pide una decisión; Personas = directorio + legajo; Tiempo y
// asistencia = quién estuvo y quién no (+ solicitudes y saldos); Desempeño = el
// Analizador de Personas de EOS (opcional); Productividad (opcional).
//
// "Ausencias" y "Asistencia" eran dos secciones que respondían la misma pregunta
// con dos fuentes distintas (un calendario de licencias por un lado, un listado de
// ingresos por otro) y nunca sobre el mismo recorte de tiempo. Se fusionaron en
// `tiempo`, cuya vista principal cruza las dos sobre el mismo mes.
export const RRHH_SECTIONS = [
  { id: 'hoy',        label: 'Hoy' },
  { id: 'personas',   label: 'Personas' },
  { id: 'tiempo',     label: 'Tiempo y asistencia', views: [
    { id: 'quien-esta',  label: 'Quién está' },
    { id: 'solicitudes', label: 'Solicitudes' },
    { id: 'saldos',      label: 'Saldos' },
  ] },
  // Desempeño existe siempre: sus 1on1 son de RRHH y andan sin EOS. Las otras dos
  // vistas (People Analyzer y Faltas) sí piden el flag `eos` + admin/owner, pero
  // eso se resuelve adentro de la sección — ver `rrhh/desempeno.jsx`.
  { id: 'desempeno',  label: 'Desempeño' },
  { id: 'productividad', label: 'Productividad', requiresProductivity: true },
]

export const DEFAULT_TAB = 'hoy'

// Pestañas del panel anterior → sección/vista nueva. Las siguen usando links de
// notificaciones viejas, emails ya enviados y marcadores del navegador.
export const LEGACY_TABS = {
  dashboard:  { tab: 'hoy' },
  legajos:    { tab: 'personas' },
  licencias:  { tab: 'tiempo', view: 'solicitudes' },
  vacaciones: { tab: 'tiempo', view: 'saldos' },
  beneficios: { tab: 'tiempo', view: 'saldos' },
  ingresos:   { tab: 'tiempo' },
  // Las dos secciones que se fusionaron en "Tiempo y asistencia".
  ausencias:  { tab: 'tiempo' },
  asistencia: { tab: 'tiempo' },
}

// Vistas que existieron en una versión anterior de la sección → vista actual.
// `calendario` era la vista de Ausencias que hoy es la principal de Tiempo.
export const LEGACY_VIEWS = { vacaciones: 'saldos', beneficios: 'saldos', calendario: 'quien-esta' }

export function rrhhSections({ productivityEnabled = true } = {}) {
  return RRHH_SECTIONS.filter(s => !s.requiresProductivity || productivityEnabled)
}

// Resuelve los params de la URL a { tab, view } válidos. `changed` indica que
// hay que reescribir la URL (tab legacy, vista inválida o sección apagada).
export function resolveRrhhNav({ tab, view } = {}, opts = {}) {
  const sections = rrhhSections(opts)
  let t = tab || DEFAULT_TAB
  let v = view || null
  if (LEGACY_TABS[t]) {
    const legacy = LEGACY_TABS[t]
    t = legacy.tab
    v = legacy.view ?? v
  }
  const section = sections.find(s => s.id === t) ?? sections[0]
  t = section.id
  if (section.views) {
    if (LEGACY_VIEWS[v]) v = LEGACY_VIEWS[v]
    if (!section.views.some(x => x.id === v)) v = section.views[0].id
  } else {
    v = null
  }
  const changed = t !== (tab || DEFAULT_TAB) || (v ?? null) !== (view || null)
  return { tab: t, view: v, changed }
}
