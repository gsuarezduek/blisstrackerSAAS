import { useState, useEffect } from 'react'

// Reemplaza a window.prompt() al pedir un motivo de texto libre — mismo estilo
// que ConfirmModal, pero con un textarea en vez de solo confirmar. Genérico:
// lo usan tanto marcar un lead como Perdido (Lead.lostReason, obligatorio) como
// archivarlo (Lead.archivedReason, opcional) — ver "Motivo de pérdida" y
// "Archivado de leads" en LeadDetail/PipelineTab/DashboardTab.
export default function ReasonModal({
  open, loading = false, onConfirm, onCancel,
  title = 'Motivo de la pérdida',
  description = 'Queda guardado en el lead — se ve en su ficha y como referencia rápida en el pipeline.',
  placeholder = 'Ej. Eligió otra agencia, presupuesto, dejó de responder…',
  confirmLabel = 'Marcar como perdido',
  confirmColor = 'bg-red-500 hover:bg-red-600',
  required = true,
}) {
  const [reason, setReason] = useState('')

  useEffect(() => { if (open) setReason('') }, [open])

  if (!open) return null

  function submit() {
    const trimmed = reason.trim()
    if ((required && !trimmed) || loading) return
    onConfirm(trimmed || null)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <textarea
          autoFocus
          rows={3}
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          placeholder={placeholder}
          value={reason}
          onChange={e => setReason(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={loading || (required && !reason.trim())}
            className={`flex-1 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${confirmColor}`}
          >
            {loading ? 'Un momento…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
