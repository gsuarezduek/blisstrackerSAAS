import { useState } from 'react'
import api from '../../api/client'
import { LEAVE_TYPE_LABELS } from './shared'

export { LEAVE_TYPE_LABELS }

export const REQUEST_STATUS = {
  pending:  { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  approved: { label: 'Aprobada',  color: 'bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400'  },
  rejected: { label: 'Rechazada', color: 'bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400'    },
}

// Editar una licencia ya existente (incluso revisada). La lista y la aprobación
// viven en Ausencias → Solicitudes (ausencias.jsx).
export function EditModal({ request, onClose, onDone }) {
  const [startDate, setStart] = useState(request.startDate)
  const [endDate, setEnd]     = useState(request.endDate)
  const [type, setType]       = useState(request.type)
  const [status, setStatus]   = useState(request.status)
  const [reviewNote, setNote] = useState(request.reviewNote || '')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      const { data } = await api.patch(`/vacation/admin/requests/${request.id}/edit`, {
        startDate, endDate, type, status, reviewNote,
      })
      onDone(data)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">Editar solicitud</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{request.user.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Desde</label>
              <input type="date" value={startDate} onChange={e => setStart(e.target.value)} className={inputCls} required />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Hasta</label>
              <input type="date" value={endDate} onChange={e => setEnd(e.target.value)} className={inputCls} required />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Tipo</label>
            <select value={type} onChange={e => setType(e.target.value)} className={inputCls}>
              {Object.entries(LEAVE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Estado</label>
            <div className="flex gap-2">
              {[
                ['approved', '✅ Aprobada', 'green'],
                ['rejected', '❌ Rechazada', 'red'],
                ['pending',  '⏳ Pendiente', 'yellow'],
              ].map(([v, l]) => (
                <label key={v} className={`flex-1 flex items-center justify-center gap-1.5 cursor-pointer border-2 rounded-xl px-2 py-2 text-xs font-medium transition-all ${
                  status === v
                    ? v === 'approved' ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                    : v === 'rejected' ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                    : 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                }`}>
                  <input type="radio" name="edit-status" value={v} checked={status === v} onChange={() => setStatus(v)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Nota para el usuario</label>
            <textarea rows={2} value={reviewNote} onChange={e => setNote(e.target.value)}
              placeholder="Opcional"
              className={inputCls + ' resize-none'} />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">Cancelar</button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 text-sm font-medium text-white rounded-lg bg-primary-600 hover:bg-primary-700 transition-colors disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
