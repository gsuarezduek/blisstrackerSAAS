import { Link } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { Icon } from './ui/Icon'
import { isWorkspaceSubdomain } from '../utils/domain'

// Ruta desconocida dentro de la app. Antes el catch-all hacía
// `<Navigate to="/" replace />`, que llevaba a la landing con status 200 — un soft 404
// que hacía que Google indexara URLs inexistentes como si fueran la home. La landing ya
// no está acá (vive en el sitio público) y este host va con noindex, así que lo único
// que hace falta es decirle a la persona qué pasó y dejarle a mano la vuelta.
export default function NotFoundScreen() {
  const inWorkspace = isWorkspaceSubdomain()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <p className="mb-4"><Icon as={FileQuestion} size={40} className="inline-block text-gray-300 dark:text-gray-600" /></p>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Esta página no existe</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Puede que el link esté mal escrito, o que la pantalla haya cambiado de dirección.
        </p>
        <Link
          to={inWorkspace ? '/' : '/login'}
          className="inline-block bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          {inWorkspace ? 'Ir al dashboard' : 'Ir al login'}
        </Link>
      </div>
    </div>
  )
}
