import { useState, useEffect } from 'react'

// Reemplaza a window.prompt() al marcar un lead como Perdido: mismo estilo que
// ConfirmModal, pero pide texto libre en vez de solo confirmar. El motivo se guarda
// en Lead.lostReason y se muestra en la ficha del lead y como tooltip del badge de
// estado en el pipeline/tabla — ver "Motivo de pérdida" en LeadDetail.
export default function LostReasonModal({ open, loading = false, onConfirm, onCancel }) {
  const [reason, setReason] = useState('')

  useEffect(() => { if (open) setReason('') }, [open])

  if (!open) return null

  function submit() {
    const trimmed = reason.trim()
    if (!trimmed || loading) return
    onConfirm(trimmed)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">Motivo de la pérdida</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Queda guardado en el lead — se ve en su ficha y como referencia rápida en el pipeline.</p>
        </div>
        <textarea
          autoFocus
          rows={3}
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          placeholder="Ej. Eligió otra agencia, presupuesto, dejó de responder…"
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
            disabled={loading || !reason.trim()}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
          >
            {loading ? 'Un momento…' : 'Marcar como perdido'}
          </button>
        </div>
      </div>
    </div>
  )
}
