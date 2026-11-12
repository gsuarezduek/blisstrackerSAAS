import {
  House, FolderKanban, CalendarDays, MessageSquare, Activity, ChartColumn, Trophy,
  Handshake, Megaphone, LayoutGrid, Users, Wallet, Target, Settings2,
} from 'lucide-react'

// FUENTE ÚNICA de qué secciones existen y quién las ve.
//
// Antes este criterio vivía duplicado en `components/Navbar.jsx` (primaryItems /
// moduleItems / adminItems) y en `hooks/useNavDestinations.js` (los destinos del
// buscador Cmd+K), con un comentario que aceptaba la duplicación "para no tocar un
// archivo central sin tests". El costo real: los dos últimos cambios de navegación
// tuvieron que editar ambos archivos, y alcanzaba con olvidarse de uno para que el
// buscador ofreciera una sección que el menú ya no muestra — o al revés.
//
// Qué vive acá: los destinos principales (bloques primary / modules / admin) y los
// booleanos de acceso. Qué NO: las **sub-pestañas** de cada módulo (Marketing · GEO,
// RRHH · Personas…), que solo le sirven al buscador y siguen en `useNavDestinations`.
//
// Convención de ítem: `{ key, to?, exact?, label, icon, keywords? }`.
// - sin `to` = no es una ruta todavía (Chat y Juegos abren un panel flotante): el menú
//   le engancha su `onClick` por `key` y el buscador simplemente lo saltea. El día que
//   tengan página propia, basta con darles `to` acá y aparecen en los dos lados.
// - `keywords` son los nombres por los que la gente busca algo que en el menú se llama
//   distinto ("mis proyectos" → Proyectos).

export function buildNavBlocks({ user, workspace, flags = {}, gamesVisible = false }) {
  const isAdmin = user?.isAdmin === true
  const access  = user?.moduleAccess || {}

  // Acceso por módulo = feature flag del workspace + acceso por rol (los admins ya
  // vienen resueltos en `moduleAccess` desde el backend). Ventas mantiene su criterio
  // histórico `isAdmin || isSales`, equivalente a `moduleAccess.ventas`.
  const allowed = {
    ventas:     !!flags.ventas     && (isAdmin || !!user?.isSales),
    marketing:  !!flags.marketing  && !!access.marketing,
    contenido:  !!flags.contenido  && !!access.contenido,
    rrhh:       !!flags.rrhh       && !!access.rrhh,
    calendario: !!flags.calendario && !!access.calendario,
    finanzas:   !!flags.finanzas   && !!access.finanzas,
    // EOS y Gamification NO tienen acceso configurable por rol: estrictamente admin.
    eos:          isAdmin && !!flags.eos,
    gamification: isAdmin && !!flags.gamification,
    whatsapp:   !!flags.whatsapp,
    productivity: workspace?.productivityEnabled !== false,
  }

  const ventasBase = isAdmin ? '/admin/ventas' : '/ventas'

  // Lo de todos los días. Calendario vive acá (y no en Módulos) porque se usa a diario.
  const primary = [
    { key: 'dashboard', to: '/', exact: true, label: 'Dashboard', icon: House },
    { key: 'projects',  to: '/proyectos', label: 'Proyectos', icon: FolderKanban, keywords: 'mis proyectos clientes cuentas' },
    ...(allowed.calendario ? [{ key: 'calendar', to: '/calendario', label: 'Calendario', icon: CalendarDays }] : []),
    { key: 'chat', label: 'Chat', icon: MessageSquare },
    { key: 'realtime', to: '/realtime', label: 'Actividad', icon: Activity },
    // "Reportes" es el propio, para todo el mundo. El del equipo está en Administración
    // y se llama "Horas por proyecto" — antes los dos se llamaban igual y el admin no
    // tenía forma de llegar al suyo.
    { key: 'reportes', to: '/reportes', label: 'Reportes', icon: ChartColumn, keywords: 'mis reportes mis horas registro' },
    ...(gamesVisible ? [{ key: 'games', label: 'Juegos', icon: Trophy }] : []),
  ]

  // Orden fijo: no se reacomodan según qué otros módulos estén prendidos, así la
  // posición de cada uno es estable entre workspaces.
  const modules = [
    ...(allowed.ventas    ? [{ key: 'ventas',    to: ventasBase,    label: 'Ventas',    icon: Handshake }] : []),
    ...(allowed.marketing ? [{ key: 'marketing', to: '/marketing',  label: 'Marketing', icon: Megaphone }] : []),
    ...(allowed.contenido ? [{ key: 'contenido', to: '/contenido',  label: 'Contenido', icon: LayoutGrid }] : []),
    ...(allowed.rrhh      ? [{ key: 'rrhh',      to: '/admin/rrhh', label: 'RRHH',      icon: Users }] : []),
    ...(allowed.finanzas  ? [{ key: 'finanzas',  to: '/finanzas',   label: 'Finanzas',  icon: Wallet }] : []),
  ]

  const admin = isAdmin ? [
    { key: 'reports', to: '/reports', label: 'Horas por proyecto', icon: ChartColumn, keywords: 'reportes del equipo horas contratadas' },
    ...(allowed.eos          ? [{ key: 'eos',          to: '/admin/eos',          label: 'EOS',          icon: Target }] : []),
    ...(allowed.gamification ? [{ key: 'gamification', to: '/admin/gamification', label: 'Gamification', icon: Trophy }] : []),
    { key: 'panel', to: '/admin', exact: true, label: 'Panel', icon: Settings2 },
  ] : []

  return { primary, modules, admin, allowed, ventasBase, isAdmin }
}
