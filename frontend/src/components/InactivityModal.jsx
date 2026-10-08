import { Pause } from 'lucide-react'
import { Icon } from './ui/Icon'
export default function InactivityModal({
  phase,           // 'auto_paused' | null
  taskDescription,
  onDismiss,       // "Pausar tarea" — cierra modal, tarea queda pausada
  onResume,        // "Continuar trabajando" — reanuda la tarea
}) {
  if (phase !== 'auto_paused') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="text-center mb-5">
          <div className="mb-3"><Icon as={Pause} size={32} className="inline-block text-primary-500" /></div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Tarea pausada por inactividad
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            La tarea fue pausada automáticamente tras 60 minutos sin actividad.
          </p>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2 line-clamp-2">
            "{taskDescription}"
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onResume}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl py-3 transition-colors"
          >
            Continuar trabajando
          </button>
          <button
            onClick={onDismiss}
            className="w-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-xl py-3 transition-colors"
          >
            Pausar tarea
          </button>
        </div>
      </div>
    </div>
  )
}
