// Estrella de prioridad de una pieza — mismo formato y colores que Task.starred
// (TaskCard.jsx): ciclo 0 (sin marcar) → 1 (verde) → 2 (amarillo) → 3 (rojo) → 0.
// A diferencia de las tareas, acá el estado es COMPARTIDO por todo el equipo del
// proyecto (no por usuario): cualquiera con acceso de escritura puede togglearla,
// y todos ven la misma prioridad. Tope de 3 piezas destacadas a la vez por
// proyecto — lo valida el backend (content.controller.js#starPiece).
const COLOR_BY_LEVEL = {
  0: 'text-gray-300 dark:text-gray-600 hover:text-green-400',
  1: 'text-green-400',
  2: 'text-yellow-400',
  3: 'text-red-500',
}

export default function ContentStarButton({ starred = 0, onClick, disabled, size = 'w-4 h-4', className = '' }) {
  const level = starred || 0
  const colorClass = COLOR_BY_LEVEL[level] ?? COLOR_BY_LEVEL[0]

  function handleClick(e) {
    // Las cards/filas donde vive este botón suelen tener su propio onClick
    // (abrir el detalle) — sin esto, togglear la estrella también abriría el modal.
    e.stopPropagation()
    if (!disabled) onClick?.()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={level ? 'Cambiar prioridad' : 'Destacar pieza'}
      className={`transition-transform hover:scale-110 disabled:opacity-50 disabled:hover:scale-100 shrink-0 ${className}`}
    >
      {level === 0 ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`${size} ${colorClass}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`${size} ${colorClass}`}>
          <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  )
}
