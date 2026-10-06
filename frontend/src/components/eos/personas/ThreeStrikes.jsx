import { useState } from 'react'
import RoleBadge from '../../RoleBadge'
import { Avatar, ConfirmModal } from './personasUI'

// ═══════════════════════════════════════════════════════════════════════════════
// Regla de las 3 Faltas
// ═══════════════════════════════════════════════════════════════════════════════

const STRIKES_RULES = [
  {
    number: 1,
    title: 'Conversación directa',
    color: 'text-amber-600 dark:text-amber-400',
    bg:    'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    dot:   'bg-amber-400',
    desc:  'La persona muestra un comportamiento que no es consistente con los Valores Medulares de la organización. El líder tiene una conversación directa, honesta y constructiva: le explica con claridad qué comportamiento está en conflicto con los valores y qué se espera que cambie. No hay sanciones, solo claridad y una oportunidad.',
  },
  {
    number: 2,
    title: 'Plan de mejora de 30 días',
    color: 'text-orange-600 dark:text-orange-400',
    bg:    'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    dot:   'bg-orange-400',
    desc:  'Si el comportamiento persiste después de la primera conversación, se acuerda formalmente un período de mejora (generalmente 30 días). Se documenta qué debe cambiar, cómo se va a medir el progreso y cuál será la consecuencia si no hay cambio. El líder hace seguimiento activo y acompaña a la persona durante ese período.',
  },
  {
    number: 3,
    title: 'La persona debe irse',
    color: 'text-red-600 dark:text-red-400',
    bg:    'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    dot:   'bg-red-500',
    desc:  'Si el comportamiento no cambió al finalizar el período acordado, la persona debe dejar la organización. Esta decisión no se negocia, no se pospone ni tiene excepciones. Mantener a alguien que no comparte los valores medulares daña la cultura, la moral del resto del equipo y la visión de la empresa.',
  },
]

function StrikesDots({ count, max = 3 }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => {
        const active = i < count
        const color = count === 1 ? 'bg-amber-400' : count === 2 ? 'bg-orange-400' : 'bg-red-500'
        return <span key={i} className={`w-2.5 h-2.5 rounded-full ${active ? color : 'bg-gray-200 dark:bg-gray-700'}`} />
      })}
    </div>
  )
}

function AddStrikeModal({ members, strikesMap, onSave, onClose, saving }) {
  const [userId, setUserId] = useState('')
  const [reason, setReason] = useState('')

  const available = members.filter(m => (strikesMap[m.id]?.length ?? 0) < 3)
  const selectedStrikes = userId ? (strikesMap[Number(userId)]?.length ?? 0) : 0
  const nextNumber = selectedStrikes + 1

  function handleSave() {
    if (!userId || !reason.trim()) return
    onSave(Number(userId), reason.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Registrar falta</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Persona</label>
            <select value={userId} onChange={e => setUserId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Seleccioná una persona…</option>
              {available.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({strikesMap[m.id]?.length ?? 0}/3 faltas)</option>
              ))}
            </select>
          </div>
          {userId && (
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${STRIKES_RULES[nextNumber - 1].bg}`}>
              <span className={`text-sm font-bold ${STRIKES_RULES[nextNumber - 1].color}`}>Falta {nextNumber}</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">{STRIKES_RULES[nextNumber - 1].title}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Razón / Comportamiento observado</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)}
              rows={4} maxLength={1000}
              placeholder="Describí específicamente el comportamiento observado y en qué valor medular impacta…"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={!userId || !reason.trim() || saving}
            className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Registrar falta'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ThreeStrikes({ members, strikesMap, onAddStrike, onRemoveStrike }) {
  const [expanded,     setExpanded]     = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [confirmDel,   setConfirmDel]   = useState(null)

  async function handleAdd(userId, reason) {
    setSaving(true)
    try { await onAddStrike(userId, reason); setShowAddModal(false) }
    finally { setSaving(false) }
  }

  async function handleRemove(strikeId) {
    await onRemoveStrike(strikeId)
    setConfirmDel(null)
  }

  const membersWithStrikes = members.map(m => ({ ...m, strikes: strikesMap[m.id] || [] })).filter(m => m.strikes.length > 0)
  const membersClean = members.filter(m => !strikesMap[m.id]?.length)

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {STRIKES_RULES.map(rule => (
          <div key={rule.number} className={`flex items-start gap-3 p-3.5 rounded-xl border ${rule.bg}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${rule.dot}`}>{rule.number}</span>
            <div>
              <p className={`text-sm font-semibold ${rule.color}`}>{rule.title}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">{rule.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Registro de faltas</p>
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors">
            + Registrar falta
          </button>
        </div>
        {membersWithStrikes.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 italic py-4 text-center">No hay faltas registradas.</p>
        )}
        {membersWithStrikes.map(m => (
          <div key={m.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button onClick={() => setExpanded(expanded === m.id ? null : m.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left">
              <Avatar src={m.avatar} name={m.name} />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{m.name}</span>
              <RoleBadge role={m.teamRole} userId={m.id} />
              <span className="flex-1" />
              <StrikesDots count={m.strikes.length} />
              <span className="text-gray-400 text-xs ml-2">{expanded === m.id ? '▲' : '▼'}</span>
            </button>
            {expanded === m.id && (
              <div className="border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {m.strikes.map(s => (
                  <div key={s.id} className="flex items-start gap-3 px-4 py-3">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5 ${STRIKES_RULES[s.strikeNumber - 1].dot}`}>
                      {s.strikeNumber}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                        {new Date(s.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {s.createdBy && ` · Registrado por ${s.createdBy.name}`}
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{s.reason}</p>
                    </div>
                    <button onClick={() => setConfirmDel({ strikeId: s.id })}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors shrink-0" title="Eliminar falta">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {membersClean.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {membersClean.map(m => (
              <div key={m.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-full">
                <Avatar src={m.avatar} name={m.name} size="sm" />
                <span className="text-xs text-green-700 dark:text-green-400 font-medium">{m.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {showAddModal && <AddStrikeModal members={members} strikesMap={strikesMap} onSave={handleAdd} onClose={() => setShowAddModal(false)} saving={saving} />}
      {confirmDel && (
        <ConfirmModal
          message="¿Eliminás esta falta? Los números de las faltas restantes se reordenarán."
          onConfirm={() => handleRemove(confirmDel.strikeId)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}
