import { useState } from 'react'
import { adminMemberOptions } from '../../../utils/adminMembers'
import { AutoBadge } from './ScorecardNav'

// ═══════════════════════════════════════════════════════════════════════════════
// Modal crear / editar métrica
// ═══════════════════════════════════════════════════════════════════════════════

const UNITS = ['', '#', '$', '%', 'hs', 'días', 'km', 'kg', 'leads', 'clientes', 'ventas', 'tickets']

export function MetricModal({ metric, members, onSave, onClose, saving }) {
  const isAuto = !!metric?.autoKey
  const [name,          setName]          = useState(metric?.name      ?? '')
  const [ownerId,       setOwnerId]       = useState(metric?.ownerId   != null ? String(metric.ownerId) : '')
  const [goal,          setGoal]          = useState(metric?.goal      != null ? String(metric.goal)    : '')
  const [lowerIsBetter, setLowerIsBetter] = useState(metric?.lowerIsBetter ?? false)
  const [unit,          setUnit]          = useState(metric?.unit      ?? '')
  const [frequency,     setFrequency]     = useState(metric?.frequency ?? 'weekly')

  function handleSave() {
    if (isAuto) {
      onSave({ goal: goal !== '' ? Number(goal) : null })
      return
    }
    if (!name.trim()) return
    onSave({
      name:      name.trim(),
      ownerId:   ownerId   ? Number(ownerId)  : null,
      goal:      goal !== '' ? Number(goal)   : null,
      lowerIsBetter,
      unit:      unit.trim() || null,
      frequency,
    })
  }

  const isNew = !metric?.id

  // Edición de un dato automático: solo la meta es editable (el resto sale del catálogo).
  if (isAuto) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
           onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {metric.name} <AutoBadge />
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Dato calculado por el sistema. Definí su meta {metric.frequency === 'monthly' ? 'mensual' : 'semanal'} ({metric.lowerIsBetter ? 'menor es mejor' : 'mayor es mejor'}):
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Meta {metric.unit ? `(${metric.unit})` : ''}
            </label>
            <input type="number" value={goal} onChange={e => setGoal(e.target.value)}
              placeholder="Ej: 3"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">Dejala vacía para no marcar verde/rojo.</p>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {isNew ? 'Nueva métrica' : 'Editar métrica'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre de la métrica</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={200}
              placeholder="Ej: Nuevos leads, Facturación mensual, Propuestas enviadas…"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Frecuencia</label>
            <div className="flex gap-2">
              {[
                { v: 'weekly',  label: 'Semanal',  desc: 'S1 – S52 por año' },
                { v: 'monthly', label: 'Mensual',  desc: 'Ene – Dic por año' },
              ].map(opt => (
                <button key={opt.v} type="button" onClick={() => setFrequency(opt.v)}
                  className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    frequency === opt.v
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                  }`}>
                  <div>{opt.label}</div>
                  <div className="text-xs opacity-60 font-normal mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meta</label>
              <input type="number" value={goal} onChange={e => setGoal(e.target.value)}
                placeholder="Ej: 10"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unidad</label>
              <input type="text" value={unit} onChange={e => setUnit(e.target.value)} maxLength={20}
                list="unit-suggestions" placeholder="Ej: leads"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <datalist id="unit-suggestions">
                {UNITS.filter(Boolean).map(u => <option key={u} value={u} />)}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">¿Cuándo está en verde?</label>
            <div className="flex gap-2">
              {[
                { v: false, label: 'Mayor es mejor', desc: 'Verde si ≥ la meta', hint: 'leads, ventas, facturación' },
                { v: true,  label: 'Menor es mejor', desc: 'Verde si ≤ la meta', hint: 'tardanzas, errores, costos' },
              ].map(opt => (
                <button key={String(opt.v)} type="button" onClick={() => setLowerIsBetter(opt.v)}
                  className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all text-left ${
                    lowerIsBetter === opt.v
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                  }`}>
                  <div>{opt.label}</div>
                  <div className="text-xs opacity-60 font-normal mt-0.5">{opt.desc}</div>
                  <div className="text-[10px] opacity-50 font-normal mt-0.5">Ej: {opt.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsable</label>
            <select value={ownerId} onChange={e => setOwnerId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Sin asignar</option>
              {adminMemberOptions(members, ownerId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={!name.trim() || saving}
            className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ConfirmModal
// ═══════════════════════════════════════════════════════════════════════════════

export function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-5">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel}  className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors">Eliminar</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// AutoMetricPicker — agregar un dato automático desde el catálogo
// ═══════════════════════════════════════════════════════════════════════════════

export function AutoMetricPicker({ catalog, onAdd, onClose, saving }) {
  const available = catalog.filter(c => !c.added)
  const [goals, setGoals] = useState({})

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            Datos automáticos <AutoBadge />
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Métricas que el sistema calcula solo con datos que ya tiene. Se actualizan automáticamente.
          Las mensuales se llenan a mes vencido.
        </p>

        {available.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
            Ya agregaste todos los datos automáticos disponibles.
          </div>
        ) : (
          <div className="space-y-3">
            {available.map(c => (
              <div key={c.key} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                      {c.name}
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                        {c.frequency === 'monthly' ? 'Mensual' : 'Semanal'}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{c.description}</p>
                  </div>
                  <button
                    onClick={() => onAdd(c.key, goals[c.key])}
                    disabled={saving}
                    className="shrink-0 px-3 py-1.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    Agregar
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <label className="text-xs text-gray-500 dark:text-gray-400">
                    Meta {c.frequency === 'monthly' ? 'mensual' : 'semanal'} {c.unit ? `(${c.unit})` : ''} · {c.lowerIsBetter ? 'menor es mejor' : 'mayor es mejor'}
                  </label>
                  <input
                    type="number"
                    value={goals[c.key] ?? ''}
                    onChange={e => setGoals(g => ({ ...g, [c.key]: e.target.value }))}
                    placeholder="opcional"
                    className="w-24 px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5">
          <button onClick={onClose} className="w-full py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cerrar</button>
        </div>
      </div>
    </div>
  )
}
