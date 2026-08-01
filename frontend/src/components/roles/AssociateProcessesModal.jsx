import { useState, useEffect } from 'react'
import api from '../../api/client'

const STATUS_DOT = {
  not_started: 'bg-gray-300 dark:bg-gray-600',
  documented:  'bg-amber-400',
  followed:    'bg-green-500',
}

// Como EOSProcess.ownerRole es un único valor por proceso, "asociar procesos a un
// rol" significa togglear qué procesos tienen a este rol como dueño; al guardar se
// hace un PATCH /eos/processes/:id por cada proceso que cambió de estado.
export default function AssociateProcessesModal({ roleName, roleLabel, onClose, onSaved }) {
  const [processes, setProcesses] = useState([])
  const [roles, setRoles] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/eos/processes')
      .then(r => {
        const list = r.data.processes ?? []
        setProcesses(list)
        setRoles(r.data.roles ?? [])
        setSelected(new Set(list.filter(p => p.ownerRole === roleName).map(p => p.id)))
      })
      .catch(() => setError('No se pudieron cargar los procesos'))
      .finally(() => setLoading(false))
  }, [roleName])

  const labelFor = name => roles.find(r => r.name === name)?.label ?? name

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const changed = processes.filter(p => (p.ownerRole === roleName) !== selected.has(p.id))
      await Promise.all(changed.map(p =>
        api.patch(`/eos/processes/${p.id}`, { ownerRole: selected.has(p.id) ? roleName : null })
      ))
      onSaved?.()
      onClose()
    } catch {
      setError('No se pudo guardar. Intentá de nuevo.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Asociar procesos</h2>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none disabled:opacity-50">×</button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Elegí qué procesos tienen a <span className="font-medium">{roleLabel}</span> como rol responsable.
        </p>

        {loading ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Cargando procesos…</p>
        ) : processes.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No hay procesos creados todavía.</p>
        ) : (
          <div className="space-y-1 overflow-y-auto pr-1 -mr-1">
            {processes.map(p => {
              const otherOwner = p.ownerRole && p.ownerRole !== roleName ? labelFor(p.ownerRole) : null
              return (
                <label key={p.id} className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[p.status] || STATUS_DOT.not_started}`} />
                      <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{p.name}</span>
                    </div>
                    {otherOwner && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Actualmente de {otherOwner} — se reasignará</p>
                    )}
                  </div>
                </label>
              )
            })}
          </div>
        )}

        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

        <div className="flex gap-2 mt-5 flex-shrink-0">
          <button onClick={onClose} disabled={saving} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || loading} className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
