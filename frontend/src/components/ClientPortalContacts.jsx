import { useState } from 'react'
import api from '../api/client'
import ConfirmModal from './ConfirmModal'

/**
 * ABM de contactos autorizados del portal de cliente (multi-contacto): alta,
 * activar/desactivar, borrar. Cada acción pega directo a su propio endpoint —
 * no depende de que el admin apriete "Guardar" en el resto del formulario del
 * portal (ClientPortalConfig.jsx), así el ABM queda operativo al instante.
 */
export default function ClientPortalContacts({ projectId, contacts, canEdit, onChanged }) {
  const [email, setEmail]     = useState('')
  const [name, setName]       = useState('')
  const [adding, setAdding]   = useState(false)
  const [error, setError]     = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    if (!email.trim() || adding) return
    setAdding(true); setError('')
    try {
      await api.post(`/projects/${projectId}/client-portal/contacts`, {
        email: email.trim(),
        name:  name.trim() || undefined,
      })
      setEmail(''); setName('')
      onChanged()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo agregar el contacto')
    } finally { setAdding(false) }
  }

  async function toggleActive(contact) {
    try {
      await api.patch(`/projects/${projectId}/client-portal/contacts/${contact.id}`, { active: !contact.active })
      onChanged()
    } catch { /* el listado no cambia — el usuario puede reintentar */ }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/projects/${projectId}/client-portal/contacts/${confirmDelete.id}`)
      setConfirmDelete(null)
      onChanged()
    } finally { setDeleting(false) }
  }

  return (
    <div className="space-y-2">
      {contacts.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">Sin contactos — el cliente no puede ingresar a "Datos Actuales".</p>
      )}

      {contacts.map(c => (
        <div key={c.id} className="flex items-center gap-2 text-sm">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
            c.active
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
            {c.active ? 'Activo' : 'Inactivo'}
          </span>
          <span className="text-gray-700 dark:text-gray-300 truncate flex-1">
            {c.name ? `${c.name} · ` : ''}{c.email}
          </span>
          {canEdit && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => toggleActive(c)} className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                {c.active ? 'Desactivar' : 'Activar'}
              </button>
              <button onClick={() => setConfirmDelete(c)} className="text-xs text-red-500 hover:text-red-700">
                Eliminar
              </button>
            </div>
          )}
        </div>
      ))}

      {canEdit && (
        <form onSubmit={handleAdd} className="flex items-center gap-1.5 pt-1">
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="email@cliente.com"
            className="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-900 rounded-lg"
          />
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="Nombre (opcional)"
            className="w-28 shrink-0 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 dark:bg-gray-900 rounded-lg"
          />
          <button
            type="submit"
            disabled={adding}
            className="text-xs px-2.5 py-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium shrink-0"
          >
            + Agregar
          </button>
        </form>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <ConfirmModal
        open={!!confirmDelete}
        title="Eliminar contacto"
        message={confirmDelete ? `${confirmDelete.email} ya no va a poder ingresar al portal.` : ''}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
