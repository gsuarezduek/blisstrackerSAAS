import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useFeatureFlag } from './useFeatureFlag'
import { NAV as MARKETING_NAV } from '../components/marketing/marketingNav'
import { buildNavBlocks } from '../lib/navCatalog'

// Destinos navegables por ruta para el Command Palette (Cmd/Ctrl+K). El criterio de
// gating por feature flag + rol NO vive acá: sale de `lib/navCatalog.js`, el mismo
// catálogo que arma la barra lateral (antes estaba duplicado en los dos archivos, y
// cada cambio de navegación había que acordarse de hacerlo dos veces).
//
// Además de las pantallas principales, cada módulo con sub-pestañas (RRHH, EOS,
// Marketing, Ventas, Contenido, Calendario, Admin) suma un destino por sub-pestaña con label
// "Módulo · Sub-pestaña" (ej. "RRHH · Productividad") — así escribir el
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
  const { enabled: finanzasEnabled }     = useFeatureFlag('finanzas')

  if (!user) return []

  // Los destinos principales salen del MISMO catálogo que arma la barra lateral, así
  // el buscador no puede ofrecer una sección que el menú no muestra (ni al revés).
  const { primary, modules, admin, allowed, ventasBase } = buildNavBlocks({
    user,
    workspace,
    gamesVisible: false, // Juegos todavía no tiene ruta propia; nada que ofrecer acá.
    flags: {
      marketing: marketingEnabled, eos: eosEnabled, gamification: gamificationEnabled,
      ventas: ventasEnabled, contenido: contenidoEnabled, rrhh: rrhhEnabled,
      calendario: calendarioEnabled, finanzas: finanzasEnabled, whatsapp: whatsappEnabled,
    },
  })

  const ventasAllowed     = allowed.ventas
  const marketingAllowed  = allowed.marketing
  const contenidoAllowed  = allowed.contenido
  const rrhhAllowed       = allowed.rrhh
  const calendarioAllowed = allowed.calendario
  const finanzasAllowed   = allowed.finanzas
  const productivityEnabled = allowed.productivity

  const destinations = [
    // `.filter(d => d.to)` deja afuera lo que todavía no es una ruta (Chat, Juegos):
    // el día que tengan página propia aparecen acá solos.
    ...[...primary, ...modules, ...admin].filter(d => d.to).map(({ to, label, keywords }) => ({ to, label, keywords })),

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
    for (const t of tabs) destinations.push({ to: `${ventasBase}?tab=${t.id}`, label: `Ventas · ${t.label}` })
  }

  if (marketingAllowed) {
    const disabledSections = workspace?.marketingDisabledSections || []
    for (const group of MARKETING_NAV) {
      if (disabledSections.includes(group.id)) continue
      if (group.subs.length === 0) {
        destinations.push({ to: `/marketing?tab=${group.id}`, label: `Marketing · ${group.label}` })
      } else {
        for (const sub of group.subs) {
          if (sub.soon) continue
          destinations.push({ to: `/marketing?tab=${group.id}&sub=${sub.id}`, label: `Marketing · ${sub.label}` })
          // Herramientas agrupadas dentro de una sub-pestaña (ej. Diagnóstico → GEO,
          // SEO, On-Page…) siguen encontrándose por su propio nombre.
          for (const v of sub.views ?? []) {
            destinations.push({ to: `/marketing?tab=${group.id}&sub=${sub.id}&view=${v.id}`, label: `Marketing · ${v.label}` })
          }
        }
      }
    }
  }

  if (contenidoAllowed) {
    const views = [
      { id: 'calendario', label: 'Calendario' },
      { id: 'tabla',      label: 'Tabla' },
      { id: 'kanban',     label: 'Kanban' },
    ]
    for (const v of views) destinations.push({ to: `/contenido?view=${v.id}`, label: `Contenido · ${v.label}` })
  }

  if (calendarioAllowed) {
    const views = [
      { id: 'semana', label: 'Mi semana' },
      { id: 'equipo', label: 'Equipo' },
      { id: 'mes',    label: 'Mes' },
    ]
    for (const v of views) destinations.push({ to: `/calendario?view=${v.id}`, label: `Calendario · ${v.label}` })
  }

  if (rrhhAllowed) {
    const tabs = [
      { to: '/admin/rrhh',                                label: 'Hoy · Para resolver' },
      { to: '/admin/rrhh?tab=personas',                   label: 'Personas' },
      { to: '/admin/rrhh?tab=tiempo&view=quien-esta',  label: 'Tiempo y asistencia · Quién está y quién no' },
      { to: '/admin/rrhh?tab=tiempo&view=solicitudes', label: 'Tiempo y asistencia · Solicitudes' },
      { to: '/admin/rrhh?tab=tiempo&view=saldos',      label: 'Tiempo y asistencia · Saldos (vacaciones, horas libres, días home)' },
      ...(productivityEnabled ? [{ to: '/admin/rrhh?tab=productividad', label: 'Productividad' }] : []),
    ]
    for (const t of tabs) destinations.push({ to: t.to, label: `RRHH · ${t.label}` })
  }

  if (finanzasAllowed) {
    const tabs = [
      { id: 'ingresos',   label: 'Ingresos' },
      { id: 'egresos',    label: 'Egresos' },
      { id: 'saldos',     label: 'Saldos' },
      { id: 'resumen',    label: 'Resumen' },
      { id: 'clientes',   label: 'Clientes' },
      { id: 'pendientes', label: 'Pendientes' },
    ]
    for (const t of tabs) destinations.push({ to: `/finanzas?tab=${t.id}`, label: `Finanzas · ${t.label}` })
  }

  if (isAdmin && eosEnabled) {
    const tabs = [
      { id: 'vision',      label: 'Visión' },
      { id: 'personas',    label: 'Personas' },
      { id: 'datos',       label: 'Datos' },
      { id: 'asuntos',     label: 'Asuntos' },
      { id: 'procesos',    label: 'Procesos' },
      { id: 'traccion',    label: 'Tracción' },
      { id: 'evaluacion',  label: 'Evaluación' },
    ]
    for (const t of tabs) destinations.push({ to: `/admin/eos?tab=${t.id}`, label: `EOS · ${t.label}` })
  }

  if (isAdmin) {
    const tabs = [
      { id: 'projects', label: 'Proyectos (administrar)' },
      { id: 'team',     label: 'Equipo' },
      { id: 'services', label: 'Servicios' },
      { id: 'roles',    label: 'Roles' },
      { id: 'legajo',   label: 'Legajo' },
      { id: 'empresa',  label: 'Empresa' },
    ]
    for (const t of tabs) destinations.push({ to: `/admin?tab=${t.id}`, label: `Panel · ${t.label}` })
  }

  return destinations
}
