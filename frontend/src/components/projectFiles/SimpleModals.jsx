import { useState } from 'react'
import api from '../../api/client'
import { fileDeepLink } from './projectFilesHelpers'

// ─── Modales chicos (nueva carpeta / renombrar / copiar enlace / confirmar borrado) ───

export function NewFolderModal({ projectId, parentId, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true); setError('')
    try {
      const { data } = await api.post(`/projects/${projectId}/files/folders`, { name: trimmed, parentId })
      onCreated(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear la carpeta')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold text-gray-900 dark:text-white mb-3">Nueva carpeta</p>
        <input
          autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de la carpeta"
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {error && <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cancelar</button>
          <button type="submit" disabled={saving || !name.trim()} className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium">
            {saving ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function RenameModal({ projectId, item, onClose, onRenamed }) {
  const [name, setName] = useState(item.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true); setError('')
    try {
      const { data } = await api.patch(`/projects/${projectId}/files/${item.id}`, { name: trimmed })
      onRenamed(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo renombrar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={handleSave} className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold text-gray-900 dark:text-white mb-3">Renombrar</p>
        <input
          autoFocus value={name} onChange={e => setName(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {error && <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cancelar</button>
          <button type="submit" disabled={saving || !name.trim()} className="text-sm px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function CopyLinkModal({ projectId, item, onClose }) {
  const [copied, setCopied] = useState(false)
  const link = fileDeepLink(projectId, item)

  async function handleCopy() {
    try { await navigator.clipboard.writeText(link) } catch { /* fallback: seleccionar el input */ }
    setCopied(true)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">Enlace a "{item.name}"</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Pegalo en la descripción o un comentario de una tarea — cualquiera del equipo lo abre directo en este archivo.</p>
        <div className="flex items-center gap-2">
          <input readOnly value={link} onFocus={e => e.target.select()} className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-xs" />
          <button onClick={handleCopy} className="text-sm px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium shrink-0">
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cerrar</button>
        </div>
      </div>
    </div>
  )
}

// `items` siempre es un array (1 = borrado individual desde el menú ⋯, N =
// acción en lote). `onConfirm` recibe el array y decide cómo borrarlos.
export function ConfirmDeleteModal({ items, onClose, onConfirm }) {
  const [saving, setSaving] = useState(false)
  const hasFolder = items.some(it => it.type === 'folder')

  async function handleConfirm() {
    setSaving(true)
    try { await onConfirm(items) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <p className="text-sm font-bold text-gray-900 dark:text-white mb-2">
          Eliminar {items.length > 1 ? `${items.length} elementos` : (items[0].type === 'folder' ? 'carpeta' : 'archivo')}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {items.length > 1
            ? <>Se van a mover <strong>{items.length} elementos</strong>{hasFolder ? ' (y el contenido de las carpetas)' : ''} a la Papelera.</>
            : items[0].type === 'folder'
              ? <>Se va a mover <strong>"{items[0].name}"</strong> y todo su contenido (subcarpetas y archivos) a la Papelera.</>
              : <>Se va a mover <strong>"{items[0].name}"</strong> a la Papelera.</>}
          {' '}Se puede restaurar desde ahí durante un tiempo.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">Cancelar</button>
          <button onClick={handleConfirm} disabled={saving} className="text-sm px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium">
            {saving ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}
