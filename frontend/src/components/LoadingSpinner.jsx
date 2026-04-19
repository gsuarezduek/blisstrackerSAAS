/**
 * LoadingSpinner — usa el SVG animado del logo BlissTracker.
 *
 * size: 'sm' (w-8 h-8) | 'md' (w-12 h-12, default) | 'lg' (w-16 h-16) | 'xl' (w-24 h-24)
 * fullPage: true → centra verticalmente en toda la pantalla
 * className: clases adicionales para el wrapper
 */
export default function LoadingSpinner({ size = 'md', fullPage = false, className = '' }) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  }
  const imgClass = sizes[size] || sizes.md

  if (fullPage) {
    return (
      <div className={`flex items-center justify-center h-screen bg-white dark:bg-gray-900 ${className}`}>
        <img src="/logo-loading.svg" alt="Cargando..." className={`${imgClass}`} />
      </div>
    )
  }

  return (
    <div className={`flex justify-center items-center ${className}`}>
      <img src="/logo-loading.svg" alt="Cargando..." className={imgClass} />
    </div>
  )
}
