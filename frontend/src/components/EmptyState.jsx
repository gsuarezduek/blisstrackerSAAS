// Placeholder genérico para listas vacías ("Todavía no hay X. Agregá el primero.") —
// unifica el patrón repetido de <p className="text-sm text-gray-400 text-center py-8">
// que aparecía con estilos ligeramente distintos en cada tab.
export default function EmptyState({ icon, title, message, action, className = '' }) {
  return (
    <div className={`text-center py-8 px-4 ${className}`}>
      {icon && <div className="text-3xl mb-2 opacity-60">{icon}</div>}
      {title && <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{title}</p>}
      {message && <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
