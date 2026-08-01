import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/client'
import EmptyState from '../EmptyState'

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

// Campo de listado simple (una lista de textos con + Agregar / quitar). Reutilizado por
// Formación, Habilidades, Resultados esperados y Herramientas — mismo shape, distinto label.
function ListField({ label, placeholder, addLabel = '+ Agregar', items, onAdd, onRemove, onChange, emptyMsg = 'Sin elementos cargados' }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <SectionLabel>{label}</SectionLabel>
        <button type="button" onClick={onAdd} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">{addLabel}</button>
      </div>
      {items.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-3 border border-dashed border-gray-200 dark:border-gray-600 rounded-xl">{emptyMsg}</p>
      )}
      <div className="space-y-2">
        {items.map(it => (
          <div key={it.id} className="flex items-center gap-2">
            <input
              value={it.text}
              onChange={e => onChange(it.id, e.target.value)}
              placeholder={placeholder}
              className={`${inputCls} flex-1`}
            />
            <RemoveBtn onClick={() => onRemove(it.id)} />
          </div>
        ))}
      </div>
    </div>
  )
}

function emptyListItem() { return { id: crypto.randomUUID(), text: '' } }
function emptyTask()  { return { id: crypto.randomUUID(), task: '', frequency: 'daily', detail: '' } }
function emptyDep()   { return { id: crypto.randomUUID(), direction: 'delivers', roleName: '', description: '' } }
function emptyResp()  { return { id: crypto.randomUUID(), category: '', items: [] } }
function emptyGuide() { return { id: crypto.randomUUID(), label: '', url: '', testUrl: '' } }

function emptyForm() {
  return {
    description: '',
    educationLevel: '',
    experienceRequired: '',
    training: [],
    skills: [],
    expectedResults: [],
    operationalResponsibilities: [],
    recurrentTasks: [],
    tools: [],
    roleTestUrl: '',
    guides: [],
    dependencies: [],
  }
}

function buildFormFromExp(exp) {
  const toListItems = arr => (arr || []).map(t => ({ id: crypto.randomUUID(), text: t }))
  return {
    description: exp?.description || '',
    educationLevel: exp?.educationLevel || '',
    experienceRequired: exp?.experienceRequired || '',
    training: toListItems(exp?.training),
    skills: toListItems(exp?.skills),
    expectedResults: toListItems(exp?.expectedResults),
    operationalResponsibilities: (exp?.operationalResponsibilities || []).map(r => ({
      id: crypto.randomUUID(),
      category: r.category || '',
      items: (r.items || []).map(item => ({ id: crypto.randomUUID(), text: item })),
    })),
    recurrentTasks: (exp?.recurrentTasks || []).map(t => ({ ...t, id: t.id || crypto.randomUUID() })),
    tools: toListItems(exp?.tools),
    roleTestUrl: exp?.roleTestUrl || '',
    guides: (exp?.guides || []).map(g => ({ id: crypto.randomUUID(), label: g.label || '', url: g.url || '', testUrl: g.testUrl || '' })),
    dependencies: (exp?.dependencies || []).map(d => ({ ...d, id: d.id || crypto.randomUUID() })),
  }
}

export default function RolesTab() {
  const [searchParams] = useSearchParams()
  const [roles, setRoles] = useState([])
  const [expectations, setExpectations] = useState({})
  const [editingRole, setEditingRole] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [savedRole, setSavedRole] = useState(null)
  const formRef = useRef(form)

  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [roleToDelete, setRoleToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { formRef.current = form }, [form])

  useEffect(() => {
    Promise.all([api.get('/roles'), api.get('/role-expectations')]).then(([r, e]) => {
      const rolesList = r.data.filter(x => x.name !== 'ADMIN')
      setRoles(rolesList)
      const map = {}
      for (const exp of e.data) map[exp.roleName] = exp
      setExpectations(map)

      // Deep link desde /docs (botón "Editar rol →"): abre directo la ficha de ese rol.
      const wanted = searchParams.get('role')
      const target = wanted && rolesList.find(x => x.name === wanted)
      if (target) {
        setForm(buildFormFromExp(map[target.name]))
        setEditingRole(target.name)
      }
    })
    // Solo al montar — el deep link se resuelve una vez, no en cada cambio de la URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startEdit(role) {
    setSavedRole(null)
    setForm(buildFormFromExp(expectations[role.name]))
    setEditingRole(role.name)
  }

  function cancelEdit() { setEditingRole(null); setSavedRole(null) }

  async function handleCreateRole(e) {
    e.preventDefault()
    setCreateError('')
    setCreating(true)
    try {
      const name = newLabel.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
      const { data } = await api.post('/roles', { name, label: newLabel.trim() })
      setRoles(prev => [...prev, data])
      setNewLabel('')
      // Primero cargamos el rol — ahora abrimos directo su ficha para completar la info.
      setSavedRole(null)
      setForm(emptyForm())
      setEditingRole(data.name)
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Error al crear rol')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteRole(role) {
    setDeleteError('')
    setDeleting(true)
    try {
      await api.delete(`/roles/${role.id}`)
      setRoles(prev => prev.filter(r => r.id !== role.id))
      if (editingRole === role.name) cancelEdit()
      setRoleToDelete(null)
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Error al eliminar rol')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSave(roleName) {
    // Leer siempre el form más reciente desde la ref, no desde el closure
    const current = formRef.current
    setSaving(true)
    try {
      const { data } = await api.put(`/role-expectations/${roleName}`, {
        description: current.description,
        educationLevel: current.educationLevel,
        experienceRequired: current.experienceRequired,
        training: current.training.map(t => t.text).filter(Boolean),
        skills: current.skills.map(t => t.text).filter(Boolean),
        expectedResults: current.expectedResults.map(r => r.text).filter(Boolean),
        operationalResponsibilities: current.operationalResponsibilities
          .filter(r => r.category)
          .map(({ category, items }) => ({
            category,
            items: items.map(i => i.text).filter(Boolean),
          })),
        recurrentTasks: current.recurrentTasks.map(({ id, ...rest }) => rest),
        tools: current.tools.map(t => t.text).filter(Boolean),
        roleTestUrl: current.roleTestUrl,
        guides: current.guides
          .filter(g => g.label && g.url)
          .map(({ id, ...rest }) => rest),
        dependencies: current.dependencies.map(({ id, ...rest }) => rest),
      })
      setExpectations(prev => ({ ...prev, [roleName]: data }))
      setSavedRole(roleName)
      setEditingRole(null)
    } finally {
      setSaving(false)
    }
  }

  // ── Campos de listado simple (Formación, Habilidades, Resultados esperados, Herramientas) ──
  const addListItem    = key => setForm(f => ({ ...f, [key]: [...f[key], emptyListItem()] }))
  const removeListItem = (key, id) => setForm(f => ({ ...f, [key]: f[key].filter(i => i.id !== id) }))
  const updateListItem = (key, id, text) => setForm(f => ({
    ...f, [key]: f[key].map(i => i.id === id ? { ...i, text } : i),
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

  // ── Guías asociadas ────────────────────────────────────────────
  const addGuide    = () => setForm(f => ({ ...f, guides: [...f.guides, emptyGuide()] }))
  const removeGuide = id => setForm(f => ({ ...f, guides: f.guides.filter(g => g.id !== id) }))
  const updateGuide = (id, field, value) => setForm(f => ({
    ...f, guides: f.guides.map(g => g.id === id ? { ...g, [field]: value } : g),
  }))

  // ── Dependencias con otros roles ──────────────────────────────
  const addDep    = () => setForm(f => ({ ...f, dependencies: [...f.dependencies, emptyDep()] }))
  const removeDep = id => setForm(f => ({ ...f, dependencies: f.dependencies.filter(d => d.id !== id) }))
  const updateDep = (id, field, value) => setForm(f => ({
    ...f, dependencies: f.dependencies.map(d => d.id === id ? { ...d, [field]: value } : d),
  }))

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Roles</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Cargá el rol y después completá su ficha: propósito, competencias, resultados esperados y todo lo que el equipo puede consultar en Docs → Roles.
      </p>

      {/* Alta de rol */}
      <form onSubmit={handleCreateRole} className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-4 mb-6 flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre del rol</label>
          <input
            required
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="ej: Social Media Manager"
            className="mt-1 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {creating ? 'Creando...' : '+ Agregar rol'}
        </button>
      </form>
      {createError && <p className="mb-4 text-sm text-red-500">{createError}</p>}
      {deleteError && <p className="mb-4 text-sm text-red-500">{deleteError}</p>}

      {roles.length === 0 && (
        <EmptyState icon="🏷️" message="No hay roles creados todavía" />
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
                    <div>
                      <p className="text-base font-semibold text-gray-900 dark:text-white">{role.label}</p>
                      <p className="text-xs font-mono text-gray-400 dark:text-gray-500">{role.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={cancelEdit} className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                        Cancelar
                      </button>
                      <button onClick={() => handleSave(role.name)} disabled={saving} className="px-4 py-2 rounded-xl text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-60">
                        {saving ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>

                  {/* Propósito del puesto */}
                  <div>
                    <SectionLabel>Propósito del puesto</SectionLabel>
                    <textarea
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      rows={2}
                      placeholder="ej: Transformar la estrategia de marketing en piezas visuales efectivas y de alto impacto."
                      className={inputCls}
                    />
                  </div>

                  {/* Competencia mínima del puesto */}
                  <div>
                    <SectionLabel>Competencia mínima del puesto</SectionLabel>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Grado de estudio</label>
                        <input
                          value={form.educationLevel}
                          onChange={e => setForm(f => ({ ...f, educationLevel: e.target.value }))}
                          placeholder="ej: Secundario completo"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Experiencia</label>
                        <input
                          value={form.experienceRequired}
                          onChange={e => setForm(f => ({ ...f, experienceRequired: e.target.value }))}
                          placeholder="ej: 2+ años en un rol similar"
                          className={inputCls}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Formación (conocimientos específicos) */}
                  <ListField
                    label="Formación (conocimientos específicos para el rol)"
                    placeholder="ej: Marketing digital"
                    emptyMsg="Sin conocimientos específicos cargados"
                    items={form.training}
                    onAdd={() => addListItem('training')}
                    onRemove={id => removeListItem('training', id)}
                    onChange={(id, v) => updateListItem('training', id, v)}
                  />

                  {/* Habilidades */}
                  <ListField
                    label="Habilidades"
                    placeholder="ej: Comunicación efectiva"
                    emptyMsg="Sin habilidades cargadas"
                    items={form.skills}
                    onAdd={() => addListItem('skills')}
                    onRemove={id => removeListItem('skills', id)}
                    onChange={(id, v) => updateListItem('skills', id, v)}
                  />

                  {/* Resultados esperados */}
                  <ListField
                    label="Resultados esperados"
                    placeholder="ej: Gestionar hasta 8 cuentas activas"
                    emptyMsg="Sin resultados configurados"
                    items={form.expectedResults}
                    onAdd={() => addListItem('expectedResults')}
                    onRemove={id => removeListItem('expectedResults', id)}
                    onChange={(id, v) => updateListItem('expectedResults', id, v)}
                  />

                  {/* Responsabilidades */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <SectionLabel>Responsabilidades</SectionLabel>
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

                  {/* Tareas frecuentes */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <SectionLabel>Tareas frecuentes</SectionLabel>
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

                  {/* Herramientas y conocimientos */}
                  <ListField
                    label="Herramientas y conocimientos"
                    placeholder="ej: Canva, Google Ads, Excel avanzado"
                    addLabel="+ Agregar"
                    emptyMsg="Sin herramientas cargadas"
                    items={form.tools}
                    onAdd={() => addListItem('tools')}
                    onRemove={id => removeListItem('tools', id)}
                    onChange={(id, v) => updateListItem('tools', id, v)}
                  />

                  {/* Test del rol */}
                  <div>
                    <SectionLabel>Test del rol</SectionLabel>
                    <input
                      value={form.roleTestUrl}
                      onChange={e => setForm(f => ({ ...f, roleTestUrl: e.target.value }))}
                      placeholder="Link a una evaluación general del puesto (opcional)"
                      className={inputCls}
                    />
                  </div>

                  {/* Guías asociadas */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <SectionLabel>Guías asociadas</SectionLabel>
                      <button type="button" onClick={addGuide} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ Agregar guía</button>
                    </div>
                    {form.guides.length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-3 border border-dashed border-gray-200 dark:border-gray-600 rounded-xl">Sin guías asociadas</p>
                    )}
                    <div className="space-y-2">
                      {form.guides.map(g => (
                        <div key={g.id} className="flex items-start gap-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 rounded-xl p-3">
                          <div className="flex-1 space-y-2">
                            <input
                              value={g.label}
                              onChange={e => updateGuide(g.id, 'label', e.target.value)}
                              placeholder="Nombre de la guía (ej: Guía de tono de marca)"
                              className={inputCls}
                            />
                            <input
                              value={g.url}
                              onChange={e => updateGuide(g.id, 'url', e.target.value)}
                              placeholder="Link a la guía"
                              className={inputCls}
                            />
                            <input
                              value={g.testUrl}
                              onChange={e => updateGuide(g.id, 'testUrl', e.target.value)}
                              placeholder="Link al test de esta guía (opcional)"
                              className={inputCls}
                            />
                          </div>
                          <RemoveBtn onClick={() => removeGuide(g.id)} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dependencias con otros roles — alimenta el insight diario y el reporte semanal de IA */}
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <SectionLabel>Dependencias con otros roles</SectionLabel>
                      <button type="button" onClick={addDep} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ Agregar</button>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                      No se muestra en Docs — solo alimenta el contexto del coach diario y el reporte semanal de IA.
                    </p>
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
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                                {exp.recurrentTasks.length} tareas frecuentes
                              </span>
                            )}
                            {exp.training?.length > 0 && (
                              <span className="text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 rounded-full px-2.5 py-0.5">
                                {exp.training.length} formación
                              </span>
                            )}
                            {exp.skills?.length > 0 && (
                              <span className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800 rounded-full px-2.5 py-0.5">
                                {exp.skills.length} habilidades
                              </span>
                            )}
                            {exp.tools?.length > 0 && (
                              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full px-2.5 py-0.5">
                                {exp.tools.length} herramientas
                              </span>
                            )}
                            {exp.guides?.length > 0 && (
                              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full px-2.5 py-0.5">
                                {exp.guides.length} guías
                              </span>
                            )}
                            {exp.dependencies?.length > 0 && (
                              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full px-2.5 py-0.5">
                                {exp.dependencies.length} dependencias
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Sin información cargada todavía</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => startEdit(role)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setRoleToDelete(role)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )
        })}
      </div>

      {roleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !deleting && setRoleToDelete(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md p-5"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 dark:text-white">¿Eliminar el rol "{roleToDelete.name}"?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Esta acción no se puede deshacer. Los miembros con este rol quedarán sin rol asignado.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setRoleToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteRole(roleToDelete)}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {deleting ? 'Eliminando…' : 'Eliminar rol'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
