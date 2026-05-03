import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'

// ═══════════════════════════════════════════════════════════════════════════════
// Constantes de estado
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS = {
  not_started: {
    label: 'Sin documentar',
    short: 'Sin doc.',
    dot:   'bg-gray-300 dark:bg-gray-600',
    badge: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
    ring:  'border-gray-200 dark:border-gray-700',
  },
  documented: {
    label: 'Documentado',
    short: 'Doc.',
    dot:   'bg-amber-400',
    badge: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    ring:  'border-amber-200 dark:border-amber-800',
  },
  followed: {
    label: 'Seguido por todos',
    short: 'FBA ✓',
    dot:   'bg-green-500',
    badge: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    ring:  'border-green-200 dark:border-green-800',
  },
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI primitivos
// ═══════════════════════════════════════════════════════════════════════════════

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-5">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel}  className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium">Eliminar</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Modal crear / editar proceso
// ═══════════════════════════════════════════════════════════════════════════════

function ProcessModal({ process, members, onSave, onClose, saving }) {
  const [name,    setName]    = useState(process?.name    ?? '')
  const [ownerId, setOwnerId] = useState(process?.ownerId != null ? String(process.ownerId) : '')
  const isNew = !process?.id

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {isNew ? 'Nuevo proceso' : 'Editar proceso'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del proceso</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={200}
              placeholder="Ej: RRHH, Ventas, Operaciones, Finanzas…"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsable</label>
            <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Sin asignar</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
          <button
            onClick={() => onSave({ name: name.trim(), ownerId: ownerId ? Number(ownerId) : null })}
            disabled={!name.trim() || saving}
            className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Lista lateral de procesos
// ═══════════════════════════════════════════════════════════════════════════════

function ProcessList({ processes, members, selectedId, onSelect, onAdd, onEdit, onDelete }) {
  const [confirm, setConfirm] = useState(null)

  const byStatus = { followed: 0, documented: 1, not_started: 2 }
  const sorted   = [...processes].sort((a, b) => byStatus[a.status] - byStatus[b.status] || a.order - b.order)

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Procesos</span>
        <button onClick={onAdd}
          className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">
          + Agregar
        </button>
      </div>

      {/* Progress summary */}
      {processes.length > 0 && (
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
          {Object.entries(STATUS).map(([k, v]) => {
            const count = processes.filter(p => p.status === k).length
            return (
              <div key={k} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                <span className="text-xs text-gray-500 dark:text-gray-400">{count}</span>
              </div>
            )
          })}
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            {processes.filter(p => p.status === 'followed').length}/{processes.length} FBA
          </span>
        </div>
      )}

      {/* Items */}
      {sorted.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">Sin procesos todavía</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {sorted.map(p => {
            const owner = p.ownerId ? members.find(m => m.id === p.ownerId) : null
            const st    = STATUS[p.status]
            const isSelected = p.id === selectedId

            return (
              <li key={p.id}>
                <button
                  onClick={() => onSelect(p.id)}
                  className={`group w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                    isSelected
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                  }`}
                >
                  {/* Status dot */}
                  <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${st.dot}`} />

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary-700 dark:text-primary-300' : 'text-gray-800 dark:text-gray-200'}`}>
                      {p.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {owner ? (
                        <div className="flex items-center gap-1">
                          <img src={avatarUrl(owner.avatar)} alt={owner.name}
                            className="w-4 h-4 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
                          <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[70px]">{owner.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-600 italic">Sin responsable</span>
                      )}
                      <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{p.steps.length} paso{p.steps.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  {/* Actions on hover */}
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); onEdit(p) }}
                      title="Editar"
                      className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs">✎</button>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirm(p.id) }}
                      title="Eliminar"
                      className="p-1 text-gray-400 hover:text-red-500 text-xs">✕</button>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {confirm && (
        <ConfirmModal
          message="¿Eliminás este proceso? Se borrarán también todos sus pasos."
          onConfirm={() => { onDelete(confirm); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Paso individual (editable inline, auto-save)
// ═══════════════════════════════════════════════════════════════════════════════

function StepItem({ step, isFirst, isLast, onUpdate, onDelete, onMoveUp, onMoveDown }) {
  const [title,    setTitle]    = useState(step.title)
  const [desc,     setDesc]     = useState(step.description ?? '')
  const [showDesc, setShowDesc] = useState(!!step.description)
  const [confirmDel, setConfirmDel] = useState(false)
  const titleTimer = useRef(null)
  const descTimer  = useRef(null)

  // Sincronizar si el paso cambia desde afuera (ej: reordenamiento)
  useEffect(() => {
    setTitle(step.title)
    setDesc(step.description ?? '')
  }, [step.id])

  function handleTitleChange(val) {
    setTitle(val)
    clearTimeout(titleTimer.current)
    if (val.trim()) {
      titleTimer.current = setTimeout(() => onUpdate(step.id, { title: val.trim() }), 700)
    }
  }

  function handleDescChange(val) {
    setDesc(val)
    clearTimeout(descTimer.current)
    descTimer.current = setTimeout(() => onUpdate(step.id, { description: val.trim() || null }), 700)
  }

  function toggleDesc() {
    setShowDesc(v => {
      if (v && desc.trim()) {
        // Ocultamos pero no borramos el contenido
      }
      return !v
    })
  }

  return (
    <div className="group flex items-start gap-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      {/* Número */}
      <span className="text-xs font-bold text-gray-300 dark:text-gray-600 w-5 pt-1.5 text-right shrink-0 select-none">
        {step.order + 1}
      </span>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={title}
          onChange={e => handleTitleChange(e.target.value)}
          placeholder="Título del paso…"
          className="w-full text-sm text-gray-800 dark:text-gray-200 bg-transparent border-none outline-none focus:bg-gray-50 dark:focus:bg-gray-700/50 rounded px-1.5 py-0.5 -mx-1.5 transition-colors"
        />
        <button
          onClick={toggleDesc}
          className="text-xs text-gray-400 dark:text-gray-600 hover:text-primary-500 dark:hover:text-primary-400 mt-0.5 ml-1 transition-colors">
          {showDesc ? '▲ descripción' : (desc ? '▼ descripción' : '+ descripción')}
        </button>
        {showDesc && (
          <textarea
            value={desc}
            onChange={e => handleDescChange(e.target.value)}
            rows={2}
            placeholder="Descripción del paso… (quién lo hace, cuándo, cómo)"
            className="w-full mt-1.5 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-2.5 py-2 resize-none outline-none focus:ring-1 focus:ring-primary-400 transition-colors"
          />
        )}
      </div>

      {/* Acciones */}
      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
        <button onClick={onMoveUp}   disabled={isFirst} title="Subir"
          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 text-xs transition-colors leading-none">▲</button>
        <button onClick={onMoveDown} disabled={isLast}  title="Bajar"
          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 text-xs transition-colors leading-none">▼</button>
        <button onClick={() => setConfirmDel(true)} title="Eliminar"
          className="p-1 text-gray-400 hover:text-red-500 text-xs transition-colors leading-none">✕</button>
      </div>

      {confirmDel && (
        <ConfirmModal
          message="¿Eliminás este paso?"
          onConfirm={() => onDelete(step.id)}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Panel de detalle del proceso seleccionado
// ═══════════════════════════════════════════════════════════════════════════════

function ProcessDetail({ process, members, onUpdate, onStepCreate, onStepUpdate, onStepDelete, onStepMove, onEdit }) {
  const [desc,      setDesc]      = useState(process.description ?? '')
  const [newStep,   setNewStep]   = useState('')
  const [addingStep, setAddingStep] = useState(false)
  const descTimer = useRef(null)
  const newStepRef = useRef(null)

  // Resetear al cambiar de proceso
  useEffect(() => {
    setDesc(process.description ?? '')
  }, [process.id])

  function handleDescChange(val) {
    setDesc(val)
    clearTimeout(descTimer.current)
    descTimer.current = setTimeout(() => onUpdate(process.id, { description: val.trim() || null }), 800)
  }

  function handleStatusChange(status) {
    onUpdate(process.id, { status })
  }

  async function handleAddStep() {
    if (!newStep.trim()) return
    setAddingStep(true)
    await onStepCreate(process.id, newStep.trim())
    setNewStep('')
    setAddingStep(false)
    newStepRef.current?.focus()
  }

  const steps = [...process.steps].sort((a, b) => a.order - b.order)
  const owner = process.ownerId ? members.find(m => m.id === process.ownerId) : null
  const st    = STATUS[process.status]

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      {/* Header del proceso */}
      <div className={`border-b-2 ${st.ring} px-6 py-4`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
              {process.name}
            </h3>
            {owner ? (
              <div className="flex items-center gap-1.5 mt-1.5">
                <img src={avatarUrl(owner.avatar)} alt={owner.name}
                  className="w-5 h-5 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
                <span className="text-xs text-gray-500 dark:text-gray-400">{owner.name}</span>
              </div>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 block italic">Sin responsable asignado</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Selector de estado */}
            <select
              value={process.status}
              onChange={e => handleStatusChange(e.target.value)}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-400 ${st.badge} ${st.ring}`}>
              {Object.entries(STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {/* Botón editar nombre/responsable */}
            <button onClick={() => onEdit(process)}
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Editar nombre y responsable">✎</button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Descripción general */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Descripción general
          </label>
          <textarea
            value={desc}
            onChange={e => handleDescChange(e.target.value)}
            rows={3}
            placeholder="Describí el propósito de este proceso, cuándo aplica y qué resultado produce…"
            className="w-full px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 transition-colors placeholder-gray-400"
          />
          <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">Se guarda automáticamente</p>
        </div>

        {/* Pasos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Pasos del proceso
            </label>
            <span className="text-xs text-gray-400 dark:text-gray-500">{steps.length} paso{steps.length !== 1 ? 's' : ''}</span>
          </div>

          {steps.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic py-3 text-center">
              Sin pasos documentados. Agregá el primero abajo.
            </p>
          )}

          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {steps.map((step, idx) => (
              <StepItem
                key={step.id}
                step={step}
                isFirst={idx === 0}
                isLast={idx === steps.length - 1}
                onUpdate={(stepId, data) => onStepUpdate(process.id, stepId, data)}
                onDelete={stepId => onStepDelete(process.id, stepId)}
                onMoveUp={() => onStepMove(process.id, step.id, 'up')}
                onMoveDown={() => onStepMove(process.id, step.id, 'down')}
              />
            ))}
          </div>

          {/* Agregar paso */}
          <div className="flex gap-2 mt-3">
            <input
              ref={newStepRef}
              type="text"
              value={newStep}
              onChange={e => setNewStep(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddStep() }}
              placeholder="Agregar paso… (Enter para guardar)"
              className="flex-1 px-3 py-2 text-sm border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-colors"
            />
            <button onClick={handleAddStep} disabled={!newStep.trim() || addingStep}
              className="px-3 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium disabled:opacity-40 transition-colors">
              {addingStep ? '…' : '+'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ProcesosTab — componente principal
// ═══════════════════════════════════════════════════════════════════════════════

export default function ProcesosTab() {
  const [members,    setMembers]    = useState([])
  const [processes,  setProcesses]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [modal,      setModal]      = useState(null)   // { mode: 'add'|'edit', process? }
  const [saving,     setSaving]     = useState(false)

  useEffect(() => {
    api.get('/eos/processes')
      .then(res => {
        setMembers(res.data.members)
        setProcesses(res.data.processes)
        if (res.data.processes.length > 0) setSelectedId(res.data.processes[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const selectedProcess = processes.find(p => p.id === selectedId) ?? null

  // ── CRUD procesos

  async function handleSaveProcess(data) {
    setSaving(true)
    try {
      if (modal.mode === 'add') {
        const res = await api.post('/eos/processes', data)
        setProcesses(prev => [...prev, res.data])
        setSelectedId(res.data.id)
      } else {
        const res = await api.patch(`/eos/processes/${modal.process.id}`, data)
        setProcesses(prev => prev.map(p => p.id === modal.process.id ? { ...p, ...res.data } : p))
      }
      setModal(null)
    } finally { setSaving(false) }
  }

  const handleUpdateProcess = useCallback(async (id, data) => {
    const res = await api.patch(`/eos/processes/${id}`, data)
    setProcesses(prev => prev.map(p => p.id === id ? { ...p, ...res.data } : p))
  }, [])

  async function handleDeleteProcess(id) {
    await api.delete(`/eos/processes/${id}`)
    setProcesses(prev => {
      const next = prev.filter(p => p.id !== id)
      if (selectedId === id) setSelectedId(next[0]?.id ?? null)
      return next
    })
  }

  // ── CRUD pasos

  const handleStepCreate = useCallback(async (processId, title) => {
    const res = await api.post(`/eos/processes/${processId}/steps`, { title })
    setProcesses(prev => prev.map(p =>
      p.id === processId ? { ...p, steps: [...p.steps, res.data] } : p
    ))
  }, [])

  const handleStepUpdate = useCallback(async (processId, stepId, data) => {
    const res = await api.patch(`/eos/processes/${processId}/steps/${stepId}`, data)
    setProcesses(prev => prev.map(p =>
      p.id === processId
        ? { ...p, steps: p.steps.map(s => s.id === stepId ? { ...s, ...res.data } : s) }
        : p
    ))
  }, [])

  const handleStepDelete = useCallback(async (processId, stepId) => {
    await api.delete(`/eos/processes/${processId}/steps/${stepId}`)
    setProcesses(prev => prev.map(p =>
      p.id === processId
        ? { ...p, steps: p.steps.filter(s => s.id !== stepId).map((s, i) => ({ ...s, order: i })) }
        : p
    ))
  }, [])

  const handleStepMove = useCallback(async (processId, stepId, direction) => {
    const proc  = processes.find(p => p.id === processId)
    if (!proc)  return
    const steps = [...proc.steps].sort((a, b) => a.order - b.order)
    const idx   = steps.findIndex(s => s.id === stepId)
    const swap  = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= steps.length) return

    const [a, b] = [steps[idx], steps[swap]]
    const [ao, bo] = [a.order, b.order]

    // Actualizar localmente de inmediato
    setProcesses(prev => prev.map(p =>
      p.id === processId
        ? { ...p, steps: p.steps.map(s => {
              if (s.id === a.id) return { ...s, order: bo }
              if (s.id === b.id) return { ...s, order: ao }
              return s
            }) }
        : p
    ))

    // Persistir los dos cambios
    await Promise.all([
      api.patch(`/eos/processes/${processId}/steps/${a.id}`, { order: bo }),
      api.patch(`/eos/processes/${processId}/steps/${b.id}`, { order: ao }),
    ])
  }, [processes])

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="space-y-5">
      {/* Info del concepto */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-6 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Procesos</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Identificá, documentá y estandarizá los 6–10 procesos centrales del negocio para que <strong className="text-gray-700 dark:text-gray-300">todos los sigan</strong>.
            </p>
          </div>
          {/* Leyenda de estados */}
          <div className="flex flex-wrap gap-3">
            {Object.entries(STATUS).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${v.dot}`} />
                <span className="text-xs text-gray-500 dark:text-gray-400">{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Estado vacío total */}
      {processes.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <p className="text-3xl mb-3">⚙️</p>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sin procesos documentados</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
            Los procesos centrales son los 6–10 que, si todos los siguen correctamente, hacen que el negocio funcione bien. Comenzá agregando el primero.
          </p>
          <button onClick={() => setModal({ mode: 'add' })}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors">
            + Agregar primer proceso
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Lista */}
          <div className="lg:col-span-1">
            <ProcessList
              processes={processes}
              members={members}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAdd={() => setModal({ mode: 'add' })}
              onEdit={p => setModal({ mode: 'edit', process: p })}
              onDelete={handleDeleteProcess}
            />
          </div>

          {/* Detalle */}
          <div className="lg:col-span-2">
            {selectedProcess ? (
              <ProcessDetail
                key={selectedProcess.id}
                process={selectedProcess}
                members={members}
                onUpdate={handleUpdateProcess}
                onStepCreate={handleStepCreate}
                onStepUpdate={handleStepUpdate}
                onStepDelete={handleStepDelete}
                onStepMove={handleStepMove}
                onEdit={p => setModal({ mode: 'edit', process: p })}
              />
            ) : (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl flex items-center justify-center py-16">
                <p className="text-sm text-gray-400 dark:text-gray-500">Seleccioná un proceso para ver o editar su contenido</p>
              </div>
            )}
          </div>
        </div>
      )}

      {modal && (
        <ProcessModal
          process={modal.mode === 'edit' ? modal.process : null}
          members={members}
          onSave={handleSaveProcess}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}
    </div>
  )
}
