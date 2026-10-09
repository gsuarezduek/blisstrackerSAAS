import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { Card, CardHeader } from '../../pages/project-detail/ui.jsx'
import api from '../../api/client'
import { NEXT_ACTION_RECURRENCES } from './financeCatalog'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

// "Próximas acciones" (sección 4.5, columna lateral): lista + "+" que abre un
// form inline (texto, fecha, repetición). Al completar una recurrente, el
// backend genera sola la siguiente ocurrencia (3.7).
export default function NextActionsList({ itemId, actions, onChanged }) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [recurrence, setRecurrence] = useState('once')
  const [saving, setSaving] = useState(false)

  const pending = actions.filter(a => !a.completed)
  const done = actions.filter(a => a.completed)

  async function handleAdd() {
    if (!text.trim()) return
    setSaving(true)
    try {
      await api.post('/finanzas/next-actions', { itemId, text: text.trim(), date, recurrence })
      setText(''); setAdding(false)
      onChanged()
    } finally { setSaving(false) }
  }

  async function toggle(action) {
    await api.patch(`/finanzas/next-actions/${action.id}`, { completed: !action.completed })
    onChanged()
  }

  return (
    <Card>
      <CardHeader title="Próximas acciones" action={
        <button onClick={() => setAdding(v => !v)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><Icon as={Plus} size={16} /></button>
      } />
      <div className="px-4 pb-4 space-y-2">
        {adding && (
          <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 space-y-2 mb-2">
            <input autoFocus className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm"
              placeholder="Nueva acción…" value={text} onChange={e => setText(e.target.value)} />
            <div className="flex gap-2">
              <input type="date" className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs" value={date} onChange={e => setDate(e.target.value)} />
              <select className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs" value={recurrence} onChange={e => setRecurrence(e.target.value)}>
                {NEXT_ACTION_RECURRENCES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <button disabled={saving} onClick={handleAdd} className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-1.5 text-xs font-medium disabled:opacity-50">Agregar</button>
          </div>
        )}

        {pending.length === 0 && done.length === 0 && <p className="text-xs text-gray-400">Sin próximas acciones.</p>}

        {pending.map(a => (
          <label key={a.id} className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={false} onChange={() => toggle(a)} />
            <span className="flex-1">
              <span className="text-gray-900 dark:text-white block">{a.text}</span>
              <span className="text-xs text-gray-400">{fmtDate(a.date)}{a.recurrence !== 'once' ? ` · se repite ${a.recurrence === 'monthly' ? 'cada mes' : 'cada año'}` : ''}</span>
            </span>
          </label>
        ))}

        {done.length > 0 && (
          <details className="pt-1">
            <summary className="text-xs text-gray-400 cursor-pointer">{done.length} resuelta{done.length === 1 ? '' : 's'}</summary>
            <div className="mt-1 space-y-1">
              {done.map(a => (
                <label key={a.id} className="flex items-start gap-2 text-sm cursor-pointer opacity-50">
                  <input type="checkbox" className="mt-0.5" checked={true} onChange={() => toggle(a)} />
                  <span className="text-gray-700 dark:text-gray-300 line-through">{a.text}</span>
                </label>
              ))}
            </div>
          </details>
        )}
      </div>
    </Card>
  )
}
