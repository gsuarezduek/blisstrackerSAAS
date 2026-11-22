import { useState, useEffect } from 'react'
import api from '../../api/client'
import AgentLink from '../AgentLink'
import AgentAvatar from '../ui/AgentAvatar'
import RoleBadge from '../RoleBadge'
import { AGENT_COLORS, agentChipClass } from '../../utils/agentColor'
import { invalidateMyAgents } from '../../hooks/useMyAgents'

// Bloque "Agentes de IA" del panel Equipo.
//
// Va APARTE de la lista de personas, no mezclado: esa tabla muestra email, horario de
// jornada, rol de admin y desactivación con reasignación de tareas, y nada de eso aplica
// a un agente. Mezclarlos reproduce exactamente el "está todo mezclado" que esto viene a
// resolver — lo que se buscaba es poder mirar a los agentes como equipo, no volverlos
// filas de un roster de personas.
//
// Edita solo la IDENTIDAD (nombre, color, rol, qué hace). El token y los canales de
// salida siguen en Preferencias → Agentes IA, que es del dueño.

function fmtDateTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AgentsTeamBlock({ roles = [] }) {
  const [agents, setAgents] = useState(null)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ label: '', color: '', teamRole: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/agents').then(r => setAgents(r.data)).catch(() => setAgents([]))
  }, [])

  function startEdit(a) {
    setEditId(a.id)
    setError('')
    setForm({
      label: a.label || '',
      // '' = sin override, vuelve al color derivado del nombre.
      color: a.color || '',
      teamRole: a.teamRole || '',
      description: a.description || '',
    })
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { data: updated } = await api.patch(`/agents/${editId}`, form)
      setAgents(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
      // El nombre y el color de un agente se muestran en los selectores de "Delegar a
      // mi agente", que leen del cache del hook.
      invalidateMyAgents()
      setEditId(null)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  if (agents === null) return null
  if (agents.length === 0) {
    return (
      <div className="mt-6">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Agentes de IA</p>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Todavía no hay agentes conectados. Se conectan desde Preferencias → Agentes IA.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
          Agentes de IA · {agents.length}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Su trabajo suma a las horas del proyecto, no a la evaluación de la persona
        </p>
      </div>

      <div className="space-y-2">
        {agents.map(a => {
          const isEditing = editId === a.id
          return (
            <div key={a.id} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <AgentLink agentId={a.id} as="div" className="flex items-center gap-3 min-w-0 rounded-lg -m-1 p-1 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                  <AgentAvatar agent={a} size="md" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                        {a.label || `Agente #${a.id}`}
                      </p>
                      {a.teamRole && <RoleBadge role={a.teamRole} />}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      de {a.owner?.name ?? '—'}
                      {a.projects.length > 0 && ` · ${a.projects.map(p => p.name).join(', ')}`}
                    </p>
                    {a.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-md">{a.description}</p>}
                  </div>
                </AgentLink>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500">
                    {a.lastUsedAt ? `Último uso ${fmtDateTime(a.lastUsedAt)}` : 'Nunca se conectó'}
                  </span>
                  {/* El backend decide si se puede: dueño o admin/owner. */}
                  <button
                    onClick={() => (isEditing ? setEditId(null) : startEdit(a))}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
                  >
                    {isEditing ? 'Cancelar' : 'Editar'}
                  </button>
                </div>
              </div>

              {isEditing && (
                <form onSubmit={save} className="px-4 pb-4 pt-1 border-t dark:border-gray-700 flex flex-col gap-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Nombre</span>
                      <input
                        value={form.label}
                        onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                        className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Rol de equipo</span>
                      <select
                        value={form.teamRole}
                        onChange={e => setForm(f => ({ ...f, teamRole: e.target.value }))}
                        className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">Sin rol</option>
                        {roles.map(r => <option key={r.name} value={r.name}>{r.label}</option>)}
                      </select>
                    </label>
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Qué hace</span>
                    <input
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Ej: audita keywords y escribe briefs de contenido"
                      className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      Se lo informamos al agente cuando se conecta, así sabe cuál es su trabajo.
                    </span>
                  </label>

                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Color</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* "Automático" es el color derivado del nombre: no hay por qué
                          obligar a elegir uno para que se distinga. */}
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, color: '' }))}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          form.color === ''
                            ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white font-medium'
                            : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        Automático
                      </button>
                      {AGENT_COLORS.map(c => (
                        <button
                          key={c}
                          type="button"
                          title={c}
                          onClick={() => setForm(f => ({ ...f, color: c }))}
                          className={`w-6 h-6 rounded-full ${agentChipClass({ color: c })} ${
                            form.color === c ? 'ring-2 ring-offset-1 ring-gray-900 dark:ring-white dark:ring-offset-gray-800' : ''
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditId(null)}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
