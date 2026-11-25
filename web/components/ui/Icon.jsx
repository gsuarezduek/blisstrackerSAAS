// Copiado de frontend/src/components/ui/Icon.jsx — mismo trazo y mismo criterio
// (hereda currentColor, aria-hidden salvo que se le pase un label).
export function Icon({ as: Component, size = 16, strokeWidth = 1.75, className = '', label, ...rest }) {
  if (!Component) return null
  return (
    <Component
      size={size}
      strokeWidth={strokeWidth}
      className={`shrink-0 ${className}`}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      {...rest}
    />
  )
}

export default Icon
