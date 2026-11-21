import { useState, useRef, useEffect } from 'react'
import api from '../../api/client'
import { checklistProgress } from '../../utils/format'
import { Plus, X, Pencil, ArrowUpRight } from 'lucide-react'
import { Icon } from '../ui/Icon'

// Subtareas de una tarea (checklist). Un solo componente para los tres lugares donde
// aparece, con `variant`:
//   'full'    → NowCard y el detalle de la tarea: lista completa, agregar, editar,
//               borrar y "convertir en tarea".
//   'compact' → expandido dentro de una fila del Dashboard (TaskCard): tildar y borrar,
//               sin editar ni convertir. La fila es angosta y el gesto que importa ahí
//               es ir tildando mientras se trabaja.
//
// Las subtareas NO son Task (ver Task.checklist en schema.prisma): son texto + tilde.
// Todas las llamadas devuelven la lista completa de la tarea, así que acá se reemplaza
// el array entero y se avisa al padre con onUpdate({ ...task, checklist }) — así el
// badge "2/4" de la fila y el progreso de NowCard quedan en sincronía sin refetch.
//
// El tilde es optimista: se pinta al instante y se revierte si el servidor falla. Es el
// gesto más repetido de la feature y esperar el round-trip lo haría sentir pesado.
export default function TaskChecklist({ task, onUpdate, variant = 'full' }) {
  const items = Array.isArray(task.checklist) ? task.checklist : []
  const progress = checklistProgress(task)
  const compact = variant === 'compact'

  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const addRef = useRef(null)
  const editRef = useRef(null)

  useEffect(() => { if (adding) addRef.current?.focus() }, [adding])
  useEffect(() => { if (editingId) editRef.current?.focus() }, [editingId])

  function apply(checklist) {
    onUpdate({ ...task, checklist })
  }

  function fail(err, previous) {
    if (previous) apply(previous)
    if (err.response?.data?.error) alert(err.response.data.error)
  }

  async function toggle(item) {
    const previous = items
    apply(items.map(i => (i.id === item.id ? { ...i, done: !i.done } : i)))
    try {
      const { data } = await api.patch(`/tasks/${task.id}/checklist/${item.id}`, { done: !item.done })
      apply(data)
    } catch (err) { fail(err, previous) }
  }

  // Un pegado de varias líneas entra como varias subtareas (el backend parte por \n y
  // limpia viñetas), así que el campo se queda abierto para seguir sumando.
  async function add() {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      const { data } = await api.post(`/tasks/${task.id}/checklist`, { text: value })
      apply(data)
      setText('')
      addRef.current?.focus()
    } catch (err) { fail(err) } finally { setBusy(false) }
  }

  async function remove(item) {
    const previous = items
    apply(items.filter(i => i.id !== item.id))
    try {
      const { data } = await api.delete(`/tasks/${task.id}/checklist/${item.id}`)
      apply(data)
    } catch (err) { fail(err, previous) }
  }

  async function saveEdit(item) {
    const value = editText.trim()
    setEditingId(null)
    if (!value || value === item.text) return
    const previous = items
    apply(items.map(i => (i.id === item.id ? { ...i, text: value } : i)))
    try {
      const { data } = await api.patch(`/tasks/${task.id}/checklist/${item.id}`, { text: value })
      apply(data)
    } catch (err) { fail(err, previous) }
  }

  // La subtarea que creció: sale del checklist y pasa a ser una tarea de verdad en el
  // mismo proyecto. El Dashboard la verá en su próximo refresco; acá solo se actualiza
  // el checklist, que es lo que cambió en esta tarea.
  async function toTask(item) {
    if (!window.confirm(`"${item.text}" va a dejar de ser una subtarea y se va a crear como tarea propia en ${task.project?.name || 'el proyecto'}.`)) return
    try {
      const { data } = await api.post(`/tasks/${task.id}/checklist/${item.id}/to-task`)
      apply(data.checklist)
    } catch (err) { fail(err) }
  }

  if (items.length === 0 && compact) return null

  return (
    <div className={compact ? 'mt-2' : ''}>
      {!compact && (
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Subtareas</h4>
          {progress && (
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
              {progress.done} de {progress.total}
            </span>
          )}
        </div>
      )}

      {/* Barra de progreso: en una lista de 4 pasos, el ancho dice de un vistazo cuánto
          queda sin tener que leer los tildes. */}
      {progress && progress.total > 1 && (
        <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all ${progress.complete ? 'bg-green-500' : 'bg-primary-500'}`}
            style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
          />
        </div>
      )}

      <ul className="flex flex-col">
        {items.map(item => (
          <li key={item.id} className="group/item flex items-start gap-2 py-1">
            <button
              type="button"
              onClick={() => toggle(item)}
              aria-checked={item.done}
              role="checkbox"
              title={item.done ? 'Destildar' : 'Marcar como hecha'}
              className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${
                item.done
                  ? 'bg-green-500 border-green-500 text-white'
                  : 'border-gray-300 dark:border-gray-600 hover:border-primary-500'
              }`}
            >
              {item.done && (
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg>
              )}
            </button>

            {editingId === item.id ? (
              <input
                ref={editRef}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onBlur={() => saveEdit(item)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); saveEdit(item) }
                  if (e.key === 'Escape') setEditingId(null)
                }}
                className="flex-1 min-w-0 bg-transparent border-b border-primary-400 text-sm text-gray-900 dark:text-gray-100 focus:outline-none"
              />
            ) : (
              <span
                onClick={() => toggle(item)}
                className={`flex-1 min-w-0 text-sm break-words cursor-pointer ${
                  item.done
                    ? 'text-gray-400 dark:text-gray-500 line-through'
                    : 'text-gray-700 dark:text-gray-200'
                }`}
              >
                {item.text}
              </span>
            )}

            <span className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 focus-within:opacity-100 transition-opacity flex-shrink-0">
              {!compact && editingId !== item.id && (
                <>
                  <button type="button" onClick={() => { setEditingId(item.id); setEditText(item.text) }}
                    title="Editar" className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                    <Icon as={Pencil} size={13} />
                  </button>
                  <button type="button" onClick={() => toTask(item)}
                    title="Convertir en tarea propia" className="p-0.5 text-gray-400 hover:text-primary-600">
                    <Icon as={ArrowUpRight} size={14} />
                  </button>
                </>
              )}
              <button type="button" onClick={() => remove(item)}
                title="Eliminar subtarea" className="p-0.5 text-gray-400 hover:text-red-600">
                <Icon as={X} size={14} />
              </button>
            </span>
          </li>
        ))}
      </ul>

      {!compact && (
        adding ? (
          <div className="flex items-center gap-2 mt-1.5">
            <input
              ref={addRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); add() }
                if (e.key === 'Escape') { setAdding(false); setText('') }
              }}
              placeholder="Agregar subtarea… (podés pegar varias líneas)"
              className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <button type="button" onClick={add} disabled={!text.trim() || busy}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-40">
              {busy ? '…' : 'Agregar'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setText('') }}
              className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              Cancelar
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            className="mt-1.5 inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400">
            <Icon as={Plus} size={14} />
            {items.length === 0 ? 'Agregar subtareas' : 'Agregar otra'}
          </button>
        )
      )}
    </div>
  )
}
