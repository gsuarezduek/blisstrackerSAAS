import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useFeatureFlag } from './useFeatureFlag'
import { NAV as MARKETING_NAV } from '../components/marketing/marketingNav'

// Destinos navegables por ruta para el Command Palette (Cmd/Ctrl+K). Reimplementa,
// a propósito en un hook separado (no compartido), el mismo criterio de gating por
// feature flag + rol que ya usa Navbar.jsx (links/moduleSublinks/adminSublinks) —
// se prefirió esta pequeña duplicación a refactorizar ese archivo central, de alto
// tráfico y sin cobertura de tests, para un feature secundario.
//
// Además de las pantallas principales, cada módulo con sub-pestañas (RRHH, EOS,
// Marketing, Ventas, Contenido, Calendario, Admin) suma un destino por sub-pestaña con label
// "Módulo · Sub-pestaña" (ej. "👥 RRHH · 📊 Productividad") — así escribir el
// nombre del módulo ("EOS") matchea el destino principal Y todas sus sub-pestañas
// (aparecen agrupadas por el propio orden del array, `scoreMatch` empata en el
// mismo índice), y escribir directamente el nombre de una sub-pestaña ("Productividad")
// también la encuentra sin pasar por el módulo. Los catálogos de tabs/subs se
// duplican acá a mano (mismo criterio que el resto del hook) salvo Marketing, que
// ya tiene su NAV exportado y reutilizado por varios consumidores.
export default function useNavDestinations() {
  const { user } = useAuth()
  const { workspace } = useWorkspace()
  const isAdmin = user?.isAdmin === true

  const { enabled: marketingEnabled }    = useFeatureFlag('marketing')
  const { enabled: eosEnabled }          = useFeatureFlag('eos')
  const { enabled: gamificationEnabled } = useFeatureFlag('gamification')
  const { enabled: ventasEnabled }       = useFeatureFlag('ventas')
  const { enabled: contenidoEnabled }    = useFeatureFlag('contenido')
  const { enabled: rrhhEnabled }         = useFeatureFlag('rrhh')
  const { enabled: calendarioEnabled }   = useFeatureFlag('calendario')
  const { enabled: whatsappEnabled }     = useFeatureFlag('whatsapp')

  if (!user) return []

  const ventasAllowed    = ventasEnabled && (isAdmin || user?.isSales)
  const marketingAllowed = marketingEnabled && !!user?.moduleAccess?.marketing
  const contenidoAllowed = contenidoEnabled && !!user?.moduleAccess?.contenido
  const rrhhAllowed      = rrhhEnabled && !!user?.moduleAccess?.rrhh
  const calendarioAllowed = calendarioEnabled && !!user?.moduleAccess?.calendario
  const productivityEnabled = workspace?.productivityEnabled !== false
  const ventasBase = isAdmin ? '/admin/ventas' : '/ventas'

  const destinations = [
    { to: '/', label: 'Dashboard' },
    { to: '/my-projects', label: 'Mis Proyectos' },
    { to: '/realtime', label: 'Actividad' },
    ...(!isAdmin ? [{ to: '/my-reports', label: 'Mis Reportes' }] : []),

    ...(ventasAllowed ? [{ to: ventasBase, label: '💰 Ventas' }] : []),
    ...(marketingAllowed ? [{ to: '/marketing', label: '🎯 Marketing' }] : []),
    ...(contenidoAllowed ? [{ to: '/contenido', label: '📅 Contenido' }] : []),
    ...(rrhhAllowed ? [{ to: '/admin/rrhh', label: '👥 RRHH' }] : []),
    ...(calendarioAllowed ? [{ to: '/calendario', label: '🗓️ Calendario' }] : []),

    // Administración — mismo gate isAdmin que el dropdown en Navbar.jsx (líneas 398/571).
    ...(isAdmin ? [
      { to: '/reports', label: '📈 Reportes' },
      ...(eosEnabled ? [{ to: '/admin/eos', label: '🔷 EOS' }] : []),
      ...(gamificationEnabled ? [{ to: '/admin/gamification', label: '🏆 Gamification' }] : []),
      { to: '/admin', label: '⚙️ Panel' },
    ] : []),

    { to: '/profile', label: 'Mi Perfil' },
    { to: '/docs', label: 'Docs' },
    { to: '/preferences', label: 'Preferencias' },
    ...(isAdmin ? [{ to: '/billing', label: 'Facturación' }] : []),
    ...(user?.isSuperAdmin ? [{ to: '/superadmin', label: 'Super Admin' }] : []),
  ]

  if (ventasAllowed) {
    const tabs = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'pipeline',  label: 'Pipeline' },
      { id: 'metricas',  label: 'Métricas' },
      { id: 'empresas',  label: 'Empresas' },
      ...(whatsappEnabled ? [{ id: 'whatsapp', label: 'WhatsApp' }] : []),
    ]
    for (const t of tabs) destinations.push({ to: `${ventasBase}?tab=${t.id}`, label: `💰 Ventas · ${t.label}` })
  }

  if (marketingAllowed) {
    const disabledSections = workspace?.marketingDisabledSections || []
    for (const group of MARKETING_NAV) {
      if (disabledSections.includes(group.id)) continue
      if (group.subs.length === 0) {
        destinations.push({ to: `/marketing?tab=${group.id}`, label: `🎯 Marketing · ${group.label}` })
      } else {
        for (const sub of group.subs) {
          if (sub.soon) continue
          destinations.push({ to: `/marketing?tab=${group.id}&sub=${sub.id}`, label: `🎯 Marketing · ${sub.label}` })
        }
      }
    }
  }

  if (contenidoAllowed) {
    const views = [
      { id: 'calendario', label: '📅 Calendario' },
      { id: 'tabla',      label: '📋 Tabla' },
      { id: 'kanban',     label: '🗂 Kanban' },
    ]
    for (const v of views) destinations.push({ to: `/contenido?view=${v.id}`, label: `📅 Contenido · ${v.label}` })
  }

  if (calendarioAllowed) {
    const views = [
      { id: 'semana', label: '🗓️ Mi semana' },
      { id: 'equipo', label: '👥 Equipo' },
      { id: 'mes',    label: '📅 Mes' },
    ]
    for (const v of views) destinations.push({ to: `/calendario?view=${v.id}`, label: `🗓️ Calendario · ${v.label}` })
  }

  if (rrhhAllowed) {
    const tabs = [
      { id: 'dashboard',  label: '🏠 Dashboard' },
      { id: 'ingresos',   label: '🕐 Ingresos' },
      { id: 'legajos',    label: '📋 Legajos' },
      { id: 'licencias',  label: '📋 Licencias' },
      { id: 'vacaciones', label: '🏖️ Vacaciones' },
      { id: 'beneficios', label: '🎁 Beneficios' },
      ...(productivityEnabled ? [{ id: 'productividad', label: '📊 Productividad' }] : []),
    ]
    for (const t of tabs) destinations.push({ to: `/admin/rrhh?tab=${t.id}`, label: `👥 RRHH · ${t.label}` })
  }

  if (isAdmin && eosEnabled) {
    const tabs = [
      { id: 'vision',      label: '🧭 Visión' },
      { id: 'personas',    label: '👥 Personas' },
      { id: 'datos',       label: '📊 Datos' },
      { id: 'asuntos',     label: '🔍 Asuntos' },
      { id: 'procesos',    label: '⚙️ Procesos' },
      { id: 'traccion',    label: '🚀 Tracción' },
      { id: 'evaluacion',  label: '📋 Evaluación' },
    ]
    for (const t of tabs) destinations.push({ to: `/admin/eos?tab=${t.id}`, label: `🔷 EOS · ${t.label}` })
  }

  if (isAdmin) {
    const tabs = [
      { id: 'projects', label: '📁 Proyectos' },
      { id: 'team',     label: '👥 Equipo' },
      { id: 'services', label: '🛠 Servicios' },
      { id: 'roles',    label: '🏷 Roles' },
      { id: 'legajo',   label: '📋 Legajo' },
      { id: 'empresa',  label: '🏢 Empresa' },
    ]
    for (const t of tabs) destinations.push({ to: `/admin?tab=${t.id}`, label: `⚙️ Panel · ${t.label}` })
  }

  return destinations
}
