import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from './useFeatureFlag'

// Destinos navegables por ruta para el Command Palette (Cmd/Ctrl+K). Reimplementa,
// a propósito en un hook separado (no compartido), el mismo criterio de gating por
// feature flag + rol que ya usa Navbar.jsx (links/moduleSublinks/adminSublinks) —
// se prefirió esta pequeña duplicación a refactorizar ese archivo central, de alto
// tráfico y sin cobertura de tests, para un feature secundario.
export default function useNavDestinations() {
  const { user } = useAuth()
  const isAdmin = user?.isAdmin === true

  const { enabled: marketingEnabled }    = useFeatureFlag('marketing')
  const { enabled: eosEnabled }          = useFeatureFlag('eos')
  const { enabled: gamificationEnabled } = useFeatureFlag('gamification')
  const { enabled: ventasEnabled }       = useFeatureFlag('ventas')
  const { enabled: contenidoEnabled }    = useFeatureFlag('contenido')
  const { enabled: rrhhEnabled }         = useFeatureFlag('rrhh')

  if (!user) return []

  return [
    { to: '/', label: 'Dashboard' },
    { to: '/my-projects', label: 'Mis Proyectos' },
    { to: '/realtime', label: 'Actividad' },
    ...(!isAdmin ? [{ to: '/my-reports', label: 'Mis Reportes' }] : []),

    ...(ventasEnabled && (isAdmin || user?.isSales)
      ? [{ to: isAdmin ? '/admin/ventas' : '/ventas', label: '💰 Ventas' }]
      : []),
    ...(marketingEnabled && user?.moduleAccess?.marketing ? [{ to: '/marketing', label: '🎯 Marketing' }] : []),
    ...(contenidoEnabled && user?.moduleAccess?.contenido ? [{ to: '/contenido', label: '📅 Contenido' }] : []),
    ...(rrhhEnabled && user?.moduleAccess?.rrhh ? [{ to: '/admin/rrhh', label: '👥 RRHH' }] : []),

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
}
