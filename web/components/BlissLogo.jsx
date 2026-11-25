/**
 * Logo de BlissTracker. Versión del sitio público del BlissLogo de la app, con una
 * diferencia: acá no hay ThemeContext (el sitio público no tiene modo oscuro), así
 * que la variante clara/oscura del lockup se pide siempre explícita con `dark`.
 *
 * Se usa <img> y no next/image a propósito: son SVG, que ya pesan lo mínimo y que
 * next/image no optimiza (necesitaría dangerouslyAllowSVG). Lo que sí importa para
 * no mover el layout es declarar width/height, y eso va acá.
 */
const SOURCES = {
  icon:      { src: '/blisstracker_logo.svg', width: 40,  height: 40 },
  loading:   { src: '/logo-loading.svg',      width: 40,  height: 40 },
  honeycomb: { src: '/logo-honeycomb.svg',    width: 120, height: 120 },
  lockup:      { src: '/logo-lockup.svg',      width: 160, height: 32 },
  lockupDark:  { src: '/logo-lockup-dark.svg', width: 160, height: 32 },
}

export default function BlissLogo({ variant = 'icon', dark = false, className = '', alt = 'BlissTracker', ...props }) {
  const key = variant === 'lockup' && dark ? 'lockupDark' : variant
  const { src, width, height } = SOURCES[key] ?? SOURCES.icon
  return <img src={src} alt={alt} width={width} height={height} className={className} {...props} />
}
