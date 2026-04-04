import { useState, useEffect } from 'react'
import api from '../../api/client'

const FREQ_OPTIONS = [
  { value: 'daily',      label: 'Diaria' },
  { value: 'weekly',     label: 'Semanal' },
  { value: 'monthly',    label: 'Mensual' },
  { value: 'first_week', label: 'Primera semana del mes' },
]

const FREQ_LABEL = { daily: 'Diaria', weekly: 'Semanal', monthly: 'Mensual', first_week: 'Primera semana' }

const emptyTask = () => ({ id: crypto.randomUUID(), task: '', frequency: 'monthly', detail: '' })
const emptyDep  = () => ({ id: crypto.randomUUID(), direction: 'delivers', roleName: '', description: '' })

const inputCls = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

function RemoveBtn({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors flex-shrink-0"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
      </svg>
    </button>
  )
}

export default function RoleExpectationsTab() {
  const [roles, setRoles] = useState([])
  const [expectations, setExpectations] = useState({}) // roleName → data
  const [editingRole, setEditingRole] = useState(null)
  const [form, setForm] = useState({ description: '', recurrentTasks: [], dependencies: [] })
  const [saving, setSaving] = useState(false)
  const [savedRole, setSavedRole] = useState(null)

  useEffect(() => {
    Promise.all([api.get('/roles'), api.get('/role-expectations')]).then(([r, e]) => {
      setRoles(r.data.filter(r => r.name !== 'ADMIN'))
      const map = {}
      for (const exp of e.data) map[exp.roleName] = exp
      setExpectations(map)
    })
  }, [])

  function startEdit(role) {
    setSavedRole(null)
    const exp = expectations[role.name]
    setForm({
      description:    exp?.description    || '',
      recurrentTasks: (exp?.recurrentTasks || []).map(t => ({ ...t, id: t.id || crypto.randomUUID() })),
      dependencies:   (exp?.dependencies  || []).map(d => ({ ...d, id: d.id || crypto.randomUUID() })),
    })
    setEditingRole(role.name)
  }

  function cancelEdit() {
    setEditingRole(null)
    setSavedRole(null)
  }

  async function handleSave(roleName) {
    setSaving(true)
    try {
      const { data } = await api.put(`/role-expectations/${roleName}`, {
        description:    form.description,
        recurrentTasks: form.recurrentTasks.map(({ id, ...rest }) => rest),
        dependencies:   form.dependencies.map(({ id, ...rest }) => rest),
      })
      setExpectations(prev => ({ ...prev, [roleName]: data }))
      setSavedRole(roleName)
      setEditingRole(null)
    } finally {
      setSaving(false)
    }
  }

  const addTask    = () => setForm(f => ({ ...f, recurrentTasks: [...f.recurrentTasks, emptyTask()] }))
  const removeTask = id => setForm(f => ({ ...f, recurrentTasks: f.recurrentTasks.filter(t => t.id !== id) }))
  const updateTask = (id, field, value) => setForm(f => ({
    ...f, recurrentTasks: f.recurrentTasks.map(t => t.id === id ? { ...t, [field]: value } : t),
  }))

  const addDep    = () => setForm(f => ({ ...f, dependencies: [...f.dependencies, emptyDep()] }))
  const removeDep = id => setForm(f => ({ ...f, dependencies: f.dependencies.filter(d => d.id !== id) }))
  const updateDep = (id, field, value) => setForm(f => ({
    ...f, dependencies: f.dependencies.map(d => d.id === id ? { ...d, [field]: value } : d),
  }))

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Conocimiento de Roles</h2>
        <span className="text-xs bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 rounded-full px-2.5 py-0.5 font-medium">IA</span>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Configurá las expectativas de cada rol para que el insight diario detecte tareas faltantes y dependencias entre roles.
      </p>

      {roles.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No hay roles creados</p>
      )}

      <div className="space-y-3">
        {roles.map(role => {
          const exp = expectations[role.name]
          const isEditing = editingRole === role.name
          const wasSaved  = savedRole === role.name

          return (
            <div key={role.name} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl overflow-hidden">
              {isEditing ? (
                // ── Edit mode ──────────────────────────────────────────────────
                <div className="p-5 space-y-5">

                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <p className="text-base font-semibold text-gray-900 dark:text-white">{role.label}</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={cancelEdit}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleSave(role.name)}
                        disabled={saving}
                        className="px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-60"
                      >
                        {saving ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>

                  {/* Descripción */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Descripción del rol
                    </p>
                    <textarea
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      rows={3}
                      placeholder="ej: Gestiona la comunicación y el calendario de contenidos de los clientes."
                      className={inputCls}
                    />
                  </div>

                  {/* Tareas recurrentes */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Tareas recurrentes
                      </p>
                      <button
                        type="button"
                        onClick={addTask}
                        className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        + Agregar
                      </button>
                    </div>

                    {form.recurrentTasks.length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4 border border-dashed border-gray-200 dark:border-gray-600 rounded-xl">
                        Sin tareas recurrentes
                      </p>
                    )}

                    <div className="space-y-3">
                      {form.recurrentTasks.map(t => (
                        <div key={t.id} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 rounded-xl p-3">
                          <div className="flex-1 space-y-2">
                            <input
                              value={t.task}
                              onChange={e => updateTask(t.id, 'task', e.target.value)}
                              placeholder="ej: Entrega de calendario de contenidos a Diseño"
                              className={inputCls}
                            />
                            <div className="flex gap-2">
                              <select
                                value={t.frequency}
                                onChange={e => updateTask(t.id, 'frequency', e.target.value)}
                                className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 flex-shrink-0"
                              >
                                {FREQ_OPTIONS.map(o => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                              <input
                                value={t.detail}
                                onChange={e => updateTask(t.id, 'detail', e.target.value)}
                                placeholder="detalle (ej: antes del día 3)"
                                className={`${inputCls} flex-1`}
                              />
                            </div>
                          </div>
                          <RemoveBtn onClick={() => removeTask(t.id)} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dependencias */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Dependencias con otros roles
                      </p>
                      <button
                        type="button"
                        onClick={addDep}
                        className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        + Agregar
                      </button>
                    </div>

                    {form.dependencies.length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4 border border-dashed border-gray-200 dark:border-gray-600 rounded-xl">
                        Sin dependencias configuradas
                      </p>
                    )}

                    <div className="space-y-3">
                      {form.dependencies.map(d => (
                        <div key={d.id} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 rounded-xl p-3">
                          <div className="flex-1 space-y-2">
                            <div className="flex gap-2">
                              <select
                                value={d.direction}
                                onChange={e => updateDep(d.id, 'direction', e.target.value)}
                                className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 flex-shrink-0"
                              >
                                <option value="delivers">Entrega a</option>
                                <option value="receives">Recibe de</option>
                              </select>
                              <input
                                value={d.roleName}
                                onChange={e => updateDep(d.id, 'roleName', e.target.value)}
                                placeholder="nombre del rol (ej: DESIGNER)"
                                className={`${inputCls} flex-1`}
                              />
                            </div>
                            <input
                              value={d.description}
                              onChange={e => updateDep(d.id, 'description', e.target.value)}
                              placeholder="ej: Entrega briefings antes del día 5 de cada mes"
                              className={inputCls}
                            />
                          </div>
                          <RemoveBtn onClick={() => removeDep(d.id)} />
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              ) : (
                // ── View mode ──────────────────────────────────────────────────
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-base font-semibold text-gray-900 dark:text-white">{role.label}</p>
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{role.name}</span>
                        {wasSaved && (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Guardado</span>
                        )}
                      </div>
                      {exp ? (
                        <div className="space-y-1.5 mt-2">
                          {exp.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 leading-snug">{exp.description}</p>
                          )}
                          {exp.recurrentTasks?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {exp.recurrentTasks.map((t, i) => (
                                <span key={i} className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border border-primary-100 dark:border-primary-800 rounded-full px-2.5 py-0.5">
                                  {t.task} · {FREQ_LABEL[t.frequency] || t.frequency}
                                </span>
                              ))}
                            </div>
                          )}
                          {exp.dependencies?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {exp.dependencies.map((d, i) => (
                                <span key={i} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full px-2.5 py-0.5">
                                  {d.direction === 'delivers' ? '→' : '←'} {d.roleName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Sin expectativas configuradas</p>
                      )}
                    </div>
                    <button
                      onClick={() => startEdit(role)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
