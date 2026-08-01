// Modal de confirmación genérico y controlado — reemplaza a window.confirm() en las
// acciones destructivas de mayor severidad (pierde estilo nativo, bloquea el hilo y
// no se puede testear/personalizar). Uso: estado local `useState(false/null)` +
// <ConfirmModal open={...} onConfirm={...} onCancel={...} />, igual que los modales
// de confirmación ya existentes en el repo (ej. borrado de tarea en TaskCard.jsx).
export default function ConfirmModal({
  open,
  title = 'Confirmar',
  message,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{title}</h3>
          {message && <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line">{message}</p>}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {loading ? 'Un momento…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
