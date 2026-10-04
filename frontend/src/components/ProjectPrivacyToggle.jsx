import { useState } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import api from '../api/client'
import { Icon } from './ui/Icon'
import ConfirmModal from './ConfirmModal'

// Tarjeta "Privacidad" en la pestaña Ajustes del proyecto. Lo puede marcar/desmarcar
// cualquier integrante del equipo (ProjectMember) o admin/owner — mismo criterio que
// canEdit del resto de esta pestaña. Al marcar privado, el backend valida que nadie
// ajeno al equipo tenga tareas abiertas y devuelve 409 con el detalle si las hay.
export default function ProjectPrivacyToggle({ project, canEdit, onUpdated }) {
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [blockers, setBlockers] = useState(null)
  const isPrivate = !!project.isPrivate

  async function handleConfirm() {
    setSaving(true)
    setError('')
    setBlockers(null)
    try {
      const { data: updated } = await api.patch(`/projects/${project.id}/privacy`, { isPrivate: !isPrivate })
      onUpdated(updated)
    } catch (err) {
      if (err.response?.data?.code === 'PRIVATE_BLOCKED_BY_TASKS') {
        setBlockers(err.response.data.users || [])
      }
      setError(err.response?.data?.error || 'No se pudo cambiar la privacidad del proyecto')
    } finally {
      // Cierra el modal tanto en éxito como en error — el detalle del error
      // (ej. quién bloquea el cambio) queda visible en la tarjeta de abajo.
      setConfirming(false)
      setSaving(false)
    }
  }

  if (!canEdit) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Privacidad</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 flex items-center gap-1.5">
            <Icon as={isPrivate ? Lock : LockOpen} size={14} className="text-gray-400 dark:text-gray-500" />
            {isPrivate
              ? 'Privado — solo lo ve su equipo y los admins. El resto del workspace ve que existe, pero no su contenido.'
              : 'Abierto — cualquier integrante del workspace puede verlo y trabajar acá.'}
          </p>
        </div>
        <button
          onClick={() => { setError(''); setBlockers(null); setConfirming(true) }}
          className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {isPrivate ? 'Volver a hacerlo abierto' : 'Marcar como privado'}
        </button>
      </div>

      {error && !confirming && (
        <div className="mt-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl px-3 py-2">
          <p>{error}</p>
          {blockers?.length > 0 && (
            <ul className="mt-1.5 ml-4 list-disc">
              {blockers.map(b => (
                <li key={b.id}>{b.name} — {b.taskCount} tarea{b.taskCount !== 1 ? 's' : ''} abierta{b.taskCount !== 1 ? 's' : ''}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmModal
        open={confirming}
        title={isPrivate ? 'Volver a hacer público el proyecto' : 'Marcar el proyecto como privado'}
        message={isPrivate
          ? 'Todo el workspace va a poder volver a entrar y ver tareas, accesos, briefs, reuniones, archivos y el chat de este proyecto.'
          : 'Solo el equipo del proyecto y los admins van a poder entrar: tareas, accesos, briefs, reuniones, archivos y el chat. El resto del workspace va a seguir viendo el nombre (ej. en Actividad), pero no el contenido.'}
        confirmLabel={isPrivate ? 'Hacerlo abierto' : 'Marcar como privado'}
        danger={!isPrivate}
        loading={saving}
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}
