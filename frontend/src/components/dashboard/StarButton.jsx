import { useState } from 'react'
import api from '../../api/client'

// Estrella de prioridad de una tarea (0 = sin destacar, 1 verde, 2 amarilla, 3 roja).
// Cada click rota el nivel en el backend (PATCH /tasks/:id/star, tope de 3 destacadas
// → 409 con mensaje). Compartida entre la fila de tarea y la tarjeta "Ahora".
const COLOR = { 1: 'text-green-500', 2: 'text-amber-400', 3: 'text-red-500' }
const LABEL = { 0: 'Destacar tarea', 1: 'Prioridad baja · click para subir', 2: 'Prioridad media · click para subir', 3: 'Prioridad alta · click para quitar' }

export default function StarButton({ task, onUpdate, size = 'w-5 h-5' }) {
  const [busy, setBusy] = useState(false)
  const level = task.starred ?? 0

  async function toggle() {
    setBusy(true)
    try {
      const { data } = await api.patch(`/tasks/${task.id}/star`)
      onUpdate(data)
    } catch (err) {
      if (err.response?.status === 409) alert(err.response.data.error)
    } finally { setBusy(false) }
  }

  return (
    <button type="button" onClick={toggle} disabled={busy} title={LABEL[level]} aria-label={LABEL[level]}
      className="transition-transform hover:scale-110 disabled:opacity-50">
      {level > 0 ? (
        <svg viewBox="0 0 24 24" fill="currentColor" className={`${size} ${COLOR[level]}`}>
          <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" className={`${size} text-gray-300 dark:text-gray-600 hover:text-amber-400`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
        </svg>
      )}
    </button>
  )
}
