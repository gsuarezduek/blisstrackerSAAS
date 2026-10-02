// Ícono de línea único para toda la app (lucide-react). Se usa solo donde el
// ícono agrega información o reemplaza texto por falta de espacio — nunca como
// decoración al lado de una palabra que ya dice lo mismo. Hereda el color del
// texto (currentColor) y tiene trazo fino para no competir con el contenido.
//
//   import { Icon } from '../components/ui/Icon'
//   import { Repeat } from 'lucide-react'
//   <Icon as={Repeat} size={14} />
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
