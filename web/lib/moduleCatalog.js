import { ChartColumn, Compass, Handshake, Trophy, CalendarDays, Users, Landmark, CalendarClock } from 'lucide-react'

/**
 * Ícono + nombre de cada módulo opcional. Es un recorte del catálogo de la app
 * (frontend/src/lib/moduleCatalog.js): el sitio público sólo necesita el ícono y el
 * label para las tarjetas de módulos, no el `detail` ni el `tourBody`, que son copy
 * de Preferencias y del onboarding. Si cambia un nombre de módulo, cambia en los dos.
 */
export const MODULE_CATALOG = {
  marketing:    { icon: ChartColumn,   label: 'Marketing' },
  eos:          { icon: Compass,       label: 'EOS / Traction' },
  ventas:       { icon: Handshake,     label: 'Ventas (CRM)' },
  gamification: { icon: Trophy,        label: 'Gamification' },
  contenido:    { icon: CalendarDays,  label: 'Contenido' },
  calendario:   { icon: CalendarClock, label: 'Calendario' },
  rrhh:         { icon: Users,         label: 'RRHH' },
  finanzas:     { icon: Landmark,      label: 'Finanzas' },
}
