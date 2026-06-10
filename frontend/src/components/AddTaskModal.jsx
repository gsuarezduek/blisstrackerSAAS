import { useState, useEffect, useRef, useMemo } from 'react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function ProjectCombobox({ projects, value, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const selected = projects.find(p => String(p.id) === value)

  const filtered = query.trim() === ''
    ? projects
    : projects.filter(p => p.name.toLowerCase().includes(query.toLowerCase()))

  // Cerrar al hacer click fuera
  useEffect(() => {
    function handleClick(e) {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(project) {
    onChange(String(project.id))
    setQuery('')
    setOpen(false)
  }

  function handleInputChange(e) {
    setQuery(e.target.value)
    setOpen(true)
    onChange('') // limpiar selección mientras busca
  }

  function handleFocus() {
    setQuery('')
    setOpen(true)
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex items-center w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent transition-shadow ${open ? 'ring-2 ring-primary-500 border-transparent' : 'border-gray-300 dark:border-gray-600'}`}
      >
        <input
          ref={inputRef}
          type="text"
          value={open ? query : (selected?.name ?? '')}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder="Buscar proyecto..."
          className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 min-w-0"
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>

      {open && (
        <ul className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">Sin resultados</li>
          )}
          {filtered.map(p => (
            <li
              key={p.id}
              onMouseDown={() => handleSelect(p)}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                String(p.id) === value
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium'
                  : 'text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {p.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Validación liviana: solo detecta lo claramente insuficiente
function getGtdWarning(desc) {
  const trimmed = desc.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length < 10) return 'La descripción es muy corta. ¿Qué resultado específico buscás?'
  if (trimmed.length > 140) return 'Esta tarea parece demasiado amplia. Considerá dividirla en pasos más concretos.'
  return null
}

export default function AddTaskModal({ onAdd, onClose, lockedProject, alertaGTD }) {
  const { user } = useAuth()
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState(lockedProject ? String(lockedProject.id) : '')
  const [projects, setProjects] = useState([])
  const [members, setMembers] = useState([])
  const [assigneeId, setAssigneeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [showGtdWarning, setShowGtdWarning] = useState(false)

  // Opciones de tarea recurrente / futura (mutuamente excluyentes con la tarea normal)
  const [taskMode, setTaskMode] = useState('normal') // 'normal' | 'recurring' | 'future'
  const [frequency, setFrequency] = useState('weekly') // daily | weekly | monthly | annual
  const [weekdays, setWeekdays] = useState([]) // 0=domingo … 6=sábado (solo weekly)
  const [recurDate, setRecurDate] = useState(() => new Date().toLocaleDateString('en-CA')) // calendario: monthly usa el día, annual usa día+mes
  const [endMode, setEndMode] = useState('never') // never | custom
  const [endDate, setEndDate] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [optErr, setOptErr] = useState('')

  const todayStr = new Date().toLocaleDateString('en-CA')
  const toggleWeekday = (d) => setWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b))

  const gtdWarning = useMemo(() => getGtdWarning(description), [description])

  useEffect(() => {
    if (lockedProject) return
    api.get('/projects').then(r => {
      setProjects(r.data)
      if (r.data.length > 0) setProjectId(String(r.data[0].id))
    })
  }, [lockedProject])

  // Todos los integrantes activos del workspace: cualquiera puede ser asignado,
  // sea o no del equipo del proyecto.
  useEffect(() => {
    api.get('/workspaces/current/members')
      .then(r => setMembers(r.data.filter(m => m.active)))
      .catch(() => {})
  }, [])

  // Reset assignee to self when project changes
  useEffect(() => {
    setAssigneeId(user ? String(user.id) : '')
  }, [projectId, user])

  // Separar el equipo del proyecto (los que trabajan principalmente acá) del
  // resto del workspace, sin impedir asignar a estos últimos.
  const projectMemberIds = new Set((lockedProject
    ? (lockedProject.members ?? [])
    : (projects.find(p => String(p.id) === projectId)?.members ?? [])
  ).map(pm => pm.user.id))

  const teamOptions  = members.filter(m => projectMemberIds.has(m.id))
  const otherOptions = members.filter(m => !projectMemberIds.has(m.id))

  async function doSubmit() {
    setLoading(true)
    try {
      const body = { description: description.trim(), projectId }
      if (assigneeId && assigneeId !== String(user?.id)) body.targetUserId = assigneeId
      if (taskMode === 'future') {
        body.scheduledFor = scheduledDate
      } else if (taskMode === 'recurring') {
        body.recurrence = {
          frequency,
          ...(frequency === 'weekly' ? { weekdays } : {}),
          ...(frequency === 'monthly' ? { dayOfMonth: Number(recurDate.slice(8, 10)) } : {}),
          ...(frequency === 'annual' ? { dayOfMonth: Number(recurDate.slice(8, 10)), month: Number(recurDate.slice(5, 7)) } : {}),
          ...(endMode === 'custom' && endDate ? { endDate } : {}),
        }
      }
      const { data } = await api.post('/tasks', body)
      onAdd(data)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  function validateOptions() {
    if (taskMode === 'future') {
      if (!scheduledDate) return 'Elegí la fecha en que debe aparecer la tarea.'
      if (scheduledDate <= todayStr) return 'La fecha debe ser posterior a hoy.'
    }
    if (taskMode === 'recurring') {
      if (frequency === 'weekly' && weekdays.length === 0) return 'Elegí al menos un día de la semana.'
      if ((frequency === 'monthly' || frequency === 'annual') && !recurDate) return 'Elegí desde el calendario el día en que se repite.'
      if (endMode === 'custom' && !endDate) return 'Elegí la fecha de finalización o seleccioná "Nunca".'
      if (endMode === 'custom' && endDate && endDate < todayStr) return 'La fecha de finalización no puede ser anterior a hoy.'
    }
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim() || !projectId) return
    const err = validateOptions()
    if (err) { setOptErr(err); return }
    setOptErr('')
    if (gtdWarning && !showGtdWarning) {
      setShowGtdWarning(true)
      return
    }
    await doSubmit()
  }

  const submitLabel = loading ? 'Guardando...'
    : showGtdWarning ? 'Guardar igual'
    : taskMode === 'recurring' ? 'Crear tarea recurrente'
    : taskMode === 'future' ? 'Programar tarea'
    : 'Agregar tarea'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Nueva tarea</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
            <textarea
              autoFocus
              required
              rows={3}
              value={description}
              onChange={e => { setDescription(e.target.value); setShowGtdWarning(false) }}
              className={`w-full border dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none transition-colors ${
                showGtdWarning
                  ? 'border-amber-400 focus:ring-amber-400'
                  : 'border-gray-300 dark:border-gray-600 focus:ring-primary-500'
              }`}
              placeholder="¿Qué vas a hacer?"
            />
            {showGtdWarning && gtdWarning && (
              <div className="mt-2 flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 p-3">
                <span className="text-amber-500 flex-shrink-0 mt-0.5">⚠️</span>
                <div className="text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-medium mb-1">Sugerencia GTD</p>
                  <p>{gtdWarning}</p>
                </div>
              </div>
            )}
            {alertaGTD && (
              <div className="mt-2 flex gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
                <span className="text-blue-500 flex-shrink-0 mt-0.5 text-base">💡</span>
                <div className="text-xs text-blue-800 dark:text-blue-300">
                  <p className="font-medium mb-1">Tu coach de hoy detectó tareas vagas</p>
                  <p className="whitespace-pre-wrap">{alertaGTD}</p>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proyecto / Cliente</label>
            {lockedProject ? (
              <div className="w-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
                {lockedProject.name}
              </div>
            ) : (
              <ProjectCombobox projects={projects} value={projectId} onChange={setProjectId} />
            )}
          </div>

          {members.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asignar a</label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {teamOptions.length > 0 && (
                  <optgroup label="Equipo del proyecto">
                    {teamOptions.map(u => (
                      <option key={u.id} value={String(u.id)}>
                        {u.name}{String(u.id) === String(user?.id) ? ' (yo)' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherOptions.length > 0 && (
                  <optgroup label="Otros del workspace">
                    {otherOptions.map(u => (
                      <option key={u.id} value={String(u.id)}>
                        {u.name}{String(u.id) === String(user?.id) ? ' (yo)' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !projectId}
              className={`flex-1 text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                showGtdWarning
                  ? 'bg-amber-500 hover:bg-amber-600'
                  : 'bg-primary-600 hover:bg-primary-700'
              }`}
            >
              {submitLabel}
            </button>
          </div>

          {/* Opciones avanzadas: tarea recurrente / futura */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setTaskMode(m => m === 'recurring' ? 'normal' : 'recurring'); setOptErr('') }}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium border transition-colors ${
                  taskMode === 'recurring'
                    ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 text-primary-700 dark:text-primary-400'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                🔁 Tarea recurrente
              </button>
              <button
                type="button"
                onClick={() => { setTaskMode(m => m === 'future' ? 'normal' : 'future'); setOptErr('') }}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium border transition-colors ${
                  taskMode === 'future'
                    ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 text-primary-700 dark:text-primary-400'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                📅 Tarea futura
              </button>
            </div>

            {taskMode === 'recurring' && (
              <div className="space-y-3 rounded-lg bg-gray-50 dark:bg-gray-700/40 p-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Tipo de recurrencia</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[['daily', 'Diaria'], ['weekly', 'Semanal'], ['monthly', 'Mensual'], ['annual', 'Anual']].map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setFrequency(val)}
                        className={`rounded-md py-1.5 text-xs font-medium border transition-colors ${
                          frequency === val
                            ? 'bg-primary-600 border-primary-600 text-white'
                            : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {frequency === 'weekly' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Se repite el</label>
                    <div className="flex gap-1">
                      {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((lbl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleWeekday(idx)}
                          className={`flex-1 rounded-md py-1.5 text-[11px] font-medium border transition-colors ${
                            weekdays.includes(idx)
                              ? 'bg-primary-600 border-primary-600 text-white'
                              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(frequency === 'monthly' || frequency === 'annual') && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                      {frequency === 'monthly' ? 'Día del mes en que aparece' : 'Fecha en que aparece'}
                    </label>
                    <input
                      type="date"
                      value={recurDate}
                      onChange={e => setRecurDate(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    {recurDate && (
                      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        {frequency === 'monthly'
                          ? `Se repite el día ${Number(recurDate.slice(8, 10))} de cada mes.`
                          : `Se repite cada año el ${Number(recurDate.slice(8, 10))} de ${MONTH_NAMES[Number(recurDate.slice(5, 7)) - 1]}.`}
                        {frequency === 'monthly' && Number(recurDate.slice(8, 10)) > 28 && ' En meses más cortos se ajusta al último día.'}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Fecha de finalización</label>
                  <div className="flex gap-2 items-center">
                    <select
                      value={endMode}
                      onChange={e => setEndMode(e.target.value)}
                      className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="never">Nunca</option>
                      <option value="custom">Personalizada</option>
                    </select>
                    {endMode === 'custom' && (
                      <input
                        type="date"
                        min={todayStr}
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {taskMode === 'future' && (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 p-3">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Aparece el día</label>
                <input
                  type="date"
                  min={todayStr}
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">La tarea aparecerá en tu dashboard ese día.</p>
              </div>
            )}

            {optErr && <p className="text-xs text-red-500">{optErr}</p>}
          </div>
        </form>
      </div>
    </div>
  )
}
