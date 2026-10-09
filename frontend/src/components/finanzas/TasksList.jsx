import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import { taskOriginLabel } from './financeCatalog'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm'

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

// Modal simple "+ Agregar tarea" (manual): título, detalle, fecha.
function NewTaskModal({ onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!title.trim()) { setError('Título requerido'); return }
    setSaving(true); setError('')
    try {
      await api.post('/finanzas/tasks', { title: title.trim(), detail: detail.trim() || undefined, date: date || undefined })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 pr-8">Nueva tarea</h2>
        <div className="space-y-3">
          <input autoFocus className={input} placeholder="Título" value={title} onChange={e => setTitle(e.target.value)} />
          <input className={input} placeholder="Detalle (opcional)" value={detail} onChange={e => setDetail(e.target.value)} />
          <input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium">Cancelar</button>
            <button disabled={saving} onClick={handleSave} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">Agregar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PostponeInline({ onConfirm, onCancel }) {
  const [date, setDate] = useState('')
  return (
    <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <input type="date" className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2 py-1 text-xs" value={date} onChange={e => setDate(e.target.value)} />
      <button onClick={() => date && onConfirm(date)} disabled={!date} className="text-xs font-medium text-primary-600 dark:text-primary-400 disabled:opacity-40">OK</button>
      <button onClick={onCancel} className="text-xs text-gray-400">×</button>
    </div>
  )
}

// Tareas (sección 4.6): contador + "+ Agregar tarea" + filas con etiqueta de
// tipo, título, detalle, monto, acción ("Hecho"/"Acreditado"...), Posponer, Ver›.
export default function TasksList({ tasks, onChanged, onNavigate }) {
  const [showNew, setShowNew] = useState(false)
  const [postponing, setPostponing] = useState(null)

  async function markDone(task) {
    await api.patch(`/finanzas/tasks/${task.id}`, { status: 'done' })
    onChanged()
  }
  async function postpone(task, date) {
    await api.patch(`/finanzas/tasks/${task.id}`, { status: 'postponed', postponedUntil: date })
    setPostponing(null)
    onChanged()
  }

  const actionLabel = (task) => task.origin === 'check' ? 'Acreditado' : 'Hecho'

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tareas <span className="text-gray-400 font-normal">· {tasks.length} pendiente{tasks.length === 1 ? '' : 's'}</span></h3>
        <button onClick={() => setShowNew(true)} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1">
          <Icon as={Plus} size={13} /> Agregar tarea
        </button>
      </div>

      <div className="space-y-1.5">
        {tasks.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin pendientes — todo al día.</p>}
        {tasks.map(t => (
          <div key={t.id} className="flex items-center gap-3 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2">
            {t.origin && <span className="text-[11px] bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded-full px-2 py-0.5 shrink-0">{taskOriginLabel(t.origin)}</span>}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 dark:text-white truncate">{t.title}</p>
              {(t.detail || t.date) && <p className="text-xs text-gray-400 truncate">{t.detail}{t.detail && t.date ? ' · ' : ''}{fmtDate(t.date)}</p>}
            </div>
            {t.amount != null && <span className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">{fmtMoney(t.amount, 'ARS')}</span>}
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => markDone(t)} className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-2.5 py-1 text-xs font-medium">{actionLabel(t)}</button>
              {postponing === t.id ? (
                <PostponeInline onConfirm={(date) => postpone(t, date)} onCancel={() => setPostponing(null)} />
              ) : (
                <button onClick={() => setPostponing(t.id)} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">Posponer</button>
              )}
              {t.origin && onNavigate && (
                <button onClick={() => onNavigate(t)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">Ver ›</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showNew && <NewTaskModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); onChanged() }} />}
    </div>
  )
}
