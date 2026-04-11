import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'

const FREQ_OPTIONS = [
  { value: 'monday',     label: 'Lunes (inicio de semana)' },
  { value: 'daily',      label: 'Lunes a viernes (diaria)' },
  { value: 'friday',     label: 'Viernes (cierre de semana)' },
  { value: 'weekly',     label: 'Semanal' },
  { value: 'first_week', label: 'Primera semana del mes' },
  { value: 'monthly',    label: 'Mensual' },
]

const FREQ_LABEL = {
  monday:     'Lunes',
  daily:      'Diaria',
  friday:     'Viernes',
  weekly:     'Semanal',
  first_week: 'Primera semana',
  monthly:    'Mensual',
}

const inputCls = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

function RemoveBtn({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors flex-shrink-0 p-0.5"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
      </svg>
    </button>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
      {children}
    </p>
  )
}

function emptyTask()  { return { id: crypto.randomUUID(), task: '', frequency: 'daily', detail: '' } }
function emptyDep()   { return { id: crypto.randomUUID(), direction: 'delivers', roleName: '', description: '' } }
function emptyResult(){ return { id: crypto.randomUUID(), text: '' } }
function emptyResp()  { return { id: crypto.randomUUID(), category: '', items: [] } }

export default function RoleExpectationsTab() {
  const [roles, setRoles]             = useState([])
  const [expectations, setExpectations] = useState({})
  const [editingRole, setEditingRole] = useState(null)
  const [form, setForm]               = useState({
    description: '',
    expectedResults: [],
    operationalResponsibilities: [],
    recurrentTasks: [],
    dependencies: [],
  })
  const [saving, setSaving]     = useState(false)
  const [savedRole, setSavedRole] = useState(null)
  const formRef = useRef(form)

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
      description: exp?.description || '',
      expectedResults: (exp?.expectedResults || []).map(t =>
        typeof t === 'string' ? { id: crypto.randomUUID(), text: t } : { id: crypto.randomUUID(), text: t }
      ),
      operationalResponsibilities: (exp?.operationalResponsibilities || []).map(r => ({
        id: crypto.randomUUID(),
        category: r.category || '',
        items: (r.items || []).map(item => ({ id: crypto.randomUUID(), text: item })),
      })),
      recurrentTasks: (exp?.recurrentTasks || []).map(t => ({ ...t, id: t.id || crypto.randomUUID() })),
      dependencies:   (exp?.dependencies  || []).map(d => ({ ...d, id: d.id || crypto.randomUUID() })),
    })
    setEditingRole(role.name)
  }

  function cancelEdit() { setEditingRole(null); setSavedRole(null) }

  async function handleSave(roleName) {
    // Leer siempre el form más reciente desde la ref, no desde el closure
    const current = formRef.current
    setSaving(true)
    try {
      const { data } = await api.put(`/role-expectations/${roleName}`, {
        description: current.description,
        expectedResults: current.expectedResults.map(r => r.text).filter(Boolean),
        operationalResponsibilities: current.operationalResponsibilities
          .filter(r => r.category)
          .map(({ category, items }) => ({
            category,
            items: items.map(i => i.text).filter(Boolean),
          })),
        recurrentTasks: current.recurrentTasks.map(({ id, ...rest }) => rest),
        dependencies:   current.dependencies.map(({ id, ...rest }) => rest),
      })
      setExpectations(prev => ({ ...prev, [roleName]: data }))
      setSavedRole(roleName)
      setEditingRole(null)
    } finally {
      setSaving(false)
    }
  }

  // ── Resultados esperados ──────────────────────────────────────
  // Mantener ref sincronizado para que handleSave siempre lea el form más reciente
  useEffect(() => { formRef.current = form }, [form])

  const addResult    = () => setForm(f => ({ ...f, expectedResults: [...f.expectedResults, emptyResult()] }))
  const removeResult = id => setForm(f => ({ ...f, expectedResults: f.expectedResults.filter(r => r.id !== id) }))
  const updateResult = (id, text) => setForm(f => ({
    ...f, expectedResults: f.expectedResults.map(r => r.id === id ? { ...r, text } : r),
  }))

  // ── Responsabilidades operativas ──────────────────────────────
  const addResp    = () => setForm(f => ({ ...f, operationalResponsibilities: [...f.operationalResponsibilities, emptyResp()] }))
  const removeResp = id => setForm(f => ({ ...f, operationalResponsibilities: f.operationalResponsibilities.filter(r => r.id !== id) }))
  const updateResp = (id, field, value) => setForm(f => ({
    ...f, operationalResponsibilities: f.operationalResponsibilities.map(r => r.id === id ? { ...r, [field]: value } : r),
  }))
  const addRespItem    = respId => setForm(f => ({
    ...f, operationalResponsibilities: f.operationalResponsibilities.map(r =>
      r.id === respId ? { ...r, items: [...r.items, { id: crypto.randomUUID(), text: '' }] } : r
    ),
  }))
  const removeRespItem = (respId, itemId) => setForm(f => ({
    ...f, operationalResponsibilities: f.operationalResponsibilities.map(r =>
      r.id === respId ? { ...r, items: r.items.filter(i => i.id !== itemId) } : r
    ),
  }))
  const updateRespItem = (respId, itemId, text) => setForm(f => ({
    ...f, operationalResponsibilities: f.operationalResponsibilities.map(r =>
      r.id === respId ? { ...r, items: r.items.map(i => i.id === itemId ? { ...i, text } : i) } : r
    ),
  }))

  // ── Tareas recurrentes ────────────────────────────────────────
  const addTask    = () => setForm(f => ({ ...f, recurrentTasks: [...f.recurrentTasks, emptyTask()] }))
  const removeTask = id => setForm(f => ({ ...f, recurrentTasks: f.recurrentTasks.filter(t => t.id !== id) }))
  const updateTask = (id, field, value) => setForm(f => ({
    ...f, recurrentTasks: f.recurrentTasks.map(t => t.id === id ? { ...t, [field]: value } : t),
  }))

  // ── Dependencias ─────────────────────────────────────────────
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
        Definí el perfil completo de cada rol para que el coach diario y el reporte semanal detecten tareas faltantes, patrones y oportunidades de mejora.
      </p>

      {roles.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No hay roles creados</p>
      )}

      <div className="space-y-3">
        {roles.map(role => {
          const exp = expectations[role.name]
          const isEditing = editingRole === role.name
          const wasSaved  = savedRole  === role.name

          return (
            <div key={role.name} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl overflow-hidden">

              {isEditing ? (
                <div className="p-5 space-y-6">

                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <p className="text-base font-semibold text-gray-900 dark:text-white">{role.label}</p>
                    <div className="flex items-center gap-2">
                      <button onClick={cancelEdit} className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                        Cancelar
                      </button>
                      <button onClick={() => handleSave(role.name)} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-60">
                        {saving ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>

                  {/* 1. Propósito del rol */}
                  <div>
                    <SectionLabel>1. Propósito del rol</SectionLabel>
                    <textarea
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      rows={2}
                      placeholder="ej: Transformar la estrategia de marketing en piezas visuales efectivas y de alto impacto."
                      className={inputCls}
                    />
                  </div>

                  {/* 2. Resultados esperados */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <SectionLabel>2. Resultados esperados</SectionLabel>
                      <button type="button" onClick={addResult} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ Agregar</button>
                    </div>
                    {form.expectedResults.length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-3 border border-dashed border-gray-200 dark:border-gray-600 rounded-xl">Sin resultados configurados</p>
                    )}
                    <div className="space-y-2">
                      {form.expectedResults.map(r => (
                        <div key={r.id} className="flex items-center gap-2">
                          <input
                            value={r.text}
                            onChange={e => updateResult(r.id, e.target.value)}
                            placeholder="ej: Gestionar hasta 8 cuentas activas"
                            className={`${inputCls} flex-1`}
                          />
                          <RemoveBtn onClick={() => removeResult(r.id)} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3. Responsabilidades operativas */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <SectionLabel>3. Responsabilidades operativas</SectionLabel>
                      <button type="button" onClick={addResp} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ Categoría</button>
                    </div>
                    {form.operationalResponsibilities.length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-3 border border-dashed border-gray-200 dark:border-gray-600 rounded-xl">Sin responsabilidades configuradas</p>
                    )}
                    <div className="space-y-3">
                      {form.operationalResponsibilities.map(r => (
                        <div key={r.id} className="bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 rounded-xl p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              value={r.category}
                              onChange={e => updateResp(r.id, 'category', e.target.value)}
                              placeholder="Nombre de la categoría (ej: Diseño y producción de contenido)"
                              className={`${inputCls} flex-1 font-medium`}
                            />
                            <RemoveBtn onClick={() => removeResp(r.id)} />
                          </div>
                          <div className="pl-3 space-y-1.5">
                            {r.items.map(item => (
                              <div key={item.id} className="flex items-center gap-2">
                                <span className="text-gray-400 text-xs flex-shrink-0">—</span>
                                <input
                                  value={item.text}
                                  onChange={e => updateRespItem(r.id, item.id, e.target.value)}
                                  placeholder="ej: Diseñar piezas gráficas para redes sociales"
                                  className={`${inputCls} flex-1`}
                                />
                                <RemoveBtn onClick={() => removeRespItem(r.id, item.id)} />
                              </div>
                            ))}
                            <button type="button" onClick={() => addRespItem(r.id)} className="text-xs text-gray-400 hover:text-primary-500 transition-colors mt-1">
                              + ítem
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 4. Tareas recurrentes */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <SectionLabel>4. Tareas recurrentes</SectionLabel>
                      <button type="button" onClick={addTask} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ Agregar</button>
                    </div>
                    {form.recurrentTasks.length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-3 border border-dashed border-gray-200 dark:border-gray-600 rounded-xl">Sin tareas recurrentes</p>
                    )}
                    <div className="space-y-2">
                      {form.recurrentTasks.map(t => (
                        <div key={t.id} className="flex items-start gap-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 rounded-xl p-3">
                          <div className="flex-1 space-y-2">
                            <input
                              value={t.task}
                              onChange={e => updateTask(t.id, 'task', e.target.value)}
                              placeholder="ej: Entrega de 6 Reels por cliente"
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
                                placeholder="detalle opcional (ej: antes del día 25)"
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
                      <SectionLabel>Dependencias con otros roles</SectionLabel>
                      <button type="button" onClick={addDep} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ Agregar</button>
                    </div>
                    {form.dependencies.length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-3 border border-dashed border-gray-200 dark:border-gray-600 rounded-xl">Sin dependencias configuradas</p>
                    )}
                    <div className="space-y-2">
                      {form.dependencies.map(d => (
                        <div key={d.id} className="flex items-start gap-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 rounded-xl p-3">
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
                // ── View mode ──────────────────────────────────────────────
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-base font-semibold text-gray-900 dark:text-white">{role.label}</p>
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{role.name}</span>
                        {wasSaved && <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Guardado</span>}
                      </div>
                      {exp ? (
                        <div className="space-y-2 mt-2">
                          {exp.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 leading-snug">{exp.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {exp.expectedResults?.length > 0 && (
                              <span className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 rounded-full px-2.5 py-0.5">
                                {exp.expectedResults.length} resultados esperados
                              </span>
                            )}
                            {exp.operationalResponsibilities?.length > 0 && (
                              <span className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-800 rounded-full px-2.5 py-0.5">
                                {exp.operationalResponsibilities.length} áreas de responsabilidad
                              </span>
                            )}
                            {exp.recurrentTasks?.length > 0 && (
                              <span className="text-xs bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border border-primary-100 dark:border-primary-800 rounded-full px-2.5 py-0.5">
                                {exp.recurrentTasks.length} tareas recurrentes
                              </span>
                            )}
                            {exp.dependencies?.length > 0 && (
                              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full px-2.5 py-0.5">
                                {exp.dependencies.length} dependencias
                              </span>
                            )}
                          </div>
                          {/* Preview tareas recurrentes */}
                          {exp.recurrentTasks?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {exp.recurrentTasks.slice(0, 4).map((t, i) => (
                                <span key={i} className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-0.5">
                                  {t.task} · {FREQ_LABEL[t.frequency] || t.frequency}
                                </span>
                              ))}
                              {exp.recurrentTasks.length > 4 && (
                                <span className="text-xs text-gray-400 dark:text-gray-500 px-1 py-0.5">+{exp.recurrentTasks.length - 4} más</span>
                              )}
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
