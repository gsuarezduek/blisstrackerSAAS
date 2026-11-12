import { Icon } from './ui/Icon'
import { Pin } from 'lucide-react'

// "Esta selección la heredaste de donde venías."
//
// El proyecto fijado (context/ProjectContext.jsx) viaja entre secciones para no tener
// que elegirlo de nuevo. El riesgo de eso es mirar datos filtrados sin saber por qué,
// así que la adopción se ANUNCIA en el momento en que ocurre — una vez, y descartable.
// El selector de la sección ya muestra el nombre del proyecto; esto explica cómo llegó.
export default function ActiveProjectHint({ projectName, onDismiss, onClear }) {
  if (!projectName) return null
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-primary-200 dark:border-primary-900/50 bg-primary-50 dark:bg-primary-900/20 px-3 py-2 text-sm">
      <Icon as={Pin} size={15} className="mt-0.5 flex-shrink-0 text-primary-600 dark:text-primary-400" />
      <p className="flex-1 text-primary-900 dark:text-primary-200">
        Mostrando <strong>{projectName}</strong>, el proyecto en el que venís trabajando.
        {onClear && (
          <>
            {' · '}
            <button type="button" onClick={onClear} className="font-medium underline hover:no-underline">
              Ver todos
            </button>
          </>
        )}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="flex-shrink-0 text-primary-400 hover:text-primary-700 dark:hover:text-primary-200 transition-colors"
        aria-label="Entendido"
      >
        ✕
      </button>
    </div>
  )
}
