// Navegación del panel RRHH: secciones por tarea (no por tipo de dato).
// Hoy = lo que pide una decisión; Personas = directorio + legajo; Ausencias =
// solicitudes y saldos; Asistencia = ingresos; Productividad (opcional).
export const RRHH_SECTIONS = [
  { id: 'hoy',        label: 'Hoy' },
  { id: 'personas',   label: 'Personas' },
  { id: 'ausencias',  label: 'Ausencias', views: [
    { id: 'calendario',  label: 'Calendario' },
    { id: 'solicitudes', label: 'Solicitudes' },
    { id: 'saldos',      label: 'Saldos' },
  ] },
  { id: 'asistencia', label: 'Asistencia' },
  { id: 'productividad', label: 'Productividad', requiresProductivity: true },
]

export const DEFAULT_TAB = 'hoy'

// Pestañas del panel anterior → sección/vista nueva. Las siguen usando links de
// notificaciones viejas, emails ya enviados y marcadores del navegador.
export const LEGACY_TABS = {
  dashboard:  { tab: 'hoy' },
  legajos:    { tab: 'personas' },
  licencias:  { tab: 'ausencias', view: 'solicitudes' },
  vacaciones: { tab: 'ausencias', view: 'saldos' },
  beneficios: { tab: 'ausencias', view: 'saldos' },
  ingresos:   { tab: 'asistencia' },
}

// Vistas que existieron en una versión anterior de Ausencias → vista actual.
export const LEGACY_VIEWS = { vacaciones: 'saldos', beneficios: 'saldos' }

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
