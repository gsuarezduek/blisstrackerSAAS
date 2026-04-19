import { useTheme } from '../context/ThemeContext'

/**
 * BlissLogo — sistema de logo unificado.
 *
 * variant:
 *   'icon'      → ícono solo (hexágono + check). Para navbar, avatares, badges. Cualquier tamaño.
 *   'lockup'    → ícono + wordmark horizontal. Para landing, headers, emails. Auto dark/light.
 *   'loading'   → animación de hexágonos giratorios. Para splash, spinners inline, botones.
 *   'honeycomb' → panal completo. Para secciones hero, about, usos decorativos ≥ 56px.
 *
 * El lockup elige automáticamente la versión clara u oscura según el ThemeContext.
 * Para forzar una versión: variant="lockup" dark={true|false}
 */
export default function BlissLogo({ variant = 'icon', dark, className = '', alt = 'BlissTracker', ...props }) {
  const theme = useTheme()
  const isDark = dark !== undefined ? dark : theme?.dark

  const src = {
    icon:      '/blisstracker_logo.svg',
    loading:   '/logo-loading.svg',
    honeycomb: '/logo-honeycomb.svg',
    lockup:    isDark ? '/logo-lockup-dark.svg' : '/logo-lockup.svg',
  }[variant] ?? '/blisstracker_logo.svg'

  return <img src={src} alt={alt} className={className} {...props} />
}
