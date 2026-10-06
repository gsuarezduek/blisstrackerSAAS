import { avatarUrl } from '../../../utils/avatarUrl'

// ═══════════════════════════════════════════════════════════════════════════════
// UI primitivos compartidos
// ═══════════════════════════════════════════════════════════════════════════════

export function SectionCard({ title, desc, onHelp, onHistory, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          {desc && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {onHistory && (
            <button onClick={onHistory} className="text-xs text-gray-500 dark:text-gray-400 hover:underline font-medium">📈 Historial</button>
          )}
          {onHelp && (
            <button onClick={onHelp} className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">? Ayuda</button>
          )}
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 mt-4 pt-4">{children}</div>
    </div>
  )
}

export function HelpModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
          <button onClick={onClose} className="w-full py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors">Entendido</button>
        </div>
      </div>
    </div>
  )
}

export function Avatar({ src, name, size = 'sm' }) {
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
  return (
    <img src={avatarUrl(src)} alt={name} title={name}
      className={`${sz} rounded-full object-cover shrink-0 border border-gray-200 dark:border-gray-600`}
    />
  )
}

export function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-5">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel}  className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors">Eliminar</button>
        </div>
      </div>
    </div>
  )
}
