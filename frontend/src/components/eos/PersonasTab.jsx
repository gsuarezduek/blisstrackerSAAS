import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'
import { avatarUrl } from '../../utils/avatarUrl'

// ═══════════════════════════════════════════════════════════════════════════════
// UI primitivos compartidos
// ═══════════════════════════════════════════════════════════════════════════════

function SectionCard({ title, desc, onHelp, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          {desc && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>}
        </div>
        {onHelp && (
          <button onClick={onHelp} className="shrink-0 text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">? Ayuda</button>
        )}
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 mt-4 pt-4">{children}</div>
    </div>
  )
}

function HelpModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
          <button onClick={onClose} className="w-full py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors">Entendido</button>
        </div>
      </div>
    </div>
  )
}

function Avatar({ src, name, size = 'sm' }) {
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
  return (
    <img src={avatarUrl(src)} alt={name} title={name}
      className={`${sz} rounded-full object-cover shrink-0 border border-gray-200 dark:border-gray-600`}
    />
  )
}

function ConfirmModal({ message, onConfirm, onCancel }) {
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
// 1. ANALIZADOR DE PERSONAS
// ═══════════════════════════════════════════════════════════════════════════════

const RATING_CYCLE  = [null, '+', '+/-', '-']
const RATING_LABEL  = { '+': '+', '+/-': '+/-', '-': '−' }
const RATING_COLOR  = {
  '+':   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-green-200 dark:border-green-800',
  '+/-': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  '-':   'bg-red-100   text-red-700   dark:bg-red-900/40   dark:text-red-400   border-red-200   dark:border-red-800',
  null:  'bg-gray-100  text-gray-400  dark:bg-gray-700     dark:text-gray-500  border-gray-200  dark:border-gray-600',
}

const GWC_COLUMNS = [
  { key: 'gwc_get',      label: 'G',  title: '¿Lo entiende?' },
  { key: 'gwc_want',     label: 'W',  title: '¿Lo quiere?' },
  { key: 'gwc_capacity', label: 'C',  title: '¿Tiene capacidad?' },
]

function PeopleAnalyzer({ members, coreValues, ratingsMap, onRatingChange }) {
  if (coreValues.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Primero definí los <strong className="text-gray-700 dark:text-gray-300">Valores Medulares</strong> en la sección Visión para poder evaluar a las personas.
        </p>
      </div>
    )
  }

  const allColumns = [
    ...coreValues.map(v => ({ key: v, label: v.length > 12 ? v.slice(0, 11) + '…' : v, title: v, isGwc: false })),
    ...GWC_COLUMNS.map(g => ({ ...g, isGwc: true })),
  ]

  function nextRating(current) {
    const idx = RATING_CYCLE.indexOf(current ?? null)
    return RATING_CYCLE[(idx + 1) % RATING_CYCLE.length]
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 min-w-[140px]">Persona</th>
            {/* Separator header */}
            {allColumns.map((col, i) => (
              <th key={col.key} className={`py-2 px-1 text-center text-xs font-medium min-w-[44px] ${
                col.isGwc && i === coreValues.length ? 'pl-4 border-l border-gray-200 dark:border-gray-700' : ''
              }`}>
                <span
                  title={col.title}
                  className={`block truncate ${col.isGwc ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  {col.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {members.map(member => {
            const userRatings = ratingsMap[member.id] || {}
            return (
              <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <Avatar src={member.avatar} name={member.name} />
                    <span className="text-sm text-gray-800 dark:text-gray-200 truncate max-w-[100px]">{member.name}</span>
                  </div>
                </td>
                {allColumns.map((col, i) => {
                  const rating = userRatings[col.key] ?? null
                  return (
                    <td key={col.key} className={`py-2 px-1 text-center ${
                      col.isGwc && i === coreValues.length ? 'pl-4 border-l border-gray-200 dark:border-gray-700' : ''
                    }`}>
                      <button
                        onClick={() => onRatingChange(member.id, col.key, nextRating(rating))}
                        title={`${col.title} — clic para cambiar`}
                        className={`w-10 h-7 rounded-lg text-xs font-semibold border transition-colors ${RATING_COLOR[rating]}`}
                      >
                        {rating ? RATING_LABEL[rating] : '·'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
        {[
          { r: '+',   label: 'Por encima de las expectativas' },
          { r: '+/-', label: 'Cumple las expectativas' },
          { r: '-',   label: 'Por debajo de las expectativas' },
        ].map(({ r, label }) => (
          <div key={r} className="flex items-center gap-1.5">
            <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold border ${RATING_COLOR[r]}`}>{RATING_LABEL[r]}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-4 pl-4 border-l border-gray-200 dark:border-gray-700">
          <span className="text-xs font-bold text-primary-600 dark:text-primary-400">GWC</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">Get it · Want it · Capacity to do it</span>
        </div>
      </div>
    </div>
  )
}

function PeopleAnalyzerHelp() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        El <strong className="text-gray-900 dark:text-white">Analizador de Personas</strong> evalúa a cada miembro del equipo en dos dimensiones: sus <em>Valores Medulares</em> y el <em>GWC</em> de su puesto.
      </p>
      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Cómo calificar los Valores Medulares</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">Para cada valor medular, evaluá si la persona lo vive consistentemente en su trabajo diario:</p>
        <div className="space-y-2">
          {[
            { r: '+',   color: 'text-green-600', desc: 'La persona exhibe este valor de manera consistente. Es un ejemplo para el equipo.' },
            { r: '+/-', color: 'text-amber-600', desc: 'La persona vive este valor la mayoría del tiempo pero no siempre. Hay margen de mejora.' },
            { r: '-',   color: 'text-red-600',   desc: 'La persona raramente o nunca exhibe este valor. Requiere atención.' },
          ].map(({ r, color, desc }) => (
            <div key={r} className="flex items-start gap-3">
              <span className={`font-bold text-sm ${color} w-8 shrink-0`}>{r}</span>
              <p className="text-sm text-gray-600 dark:text-gray-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">GWC — Get it · Want it · Capacity</p>
        <div className="space-y-2">
          {[
            { label: 'G — ¿Lo entiende?',        desc: '¿La persona comprende naturalmente qué implica su rol, cómo encaja en la empresa y qué se espera de ella?' },
            { label: 'W — ¿Lo quiere?',           desc: '¿La persona genuinamente quiere hacer ese trabajo? No lo hace por obligación ni por el dinero solamente.' },
            { label: 'C — ¿Tiene capacidad?',     desc: '¿Tiene el conocimiento, las habilidades y la energía para desempeñar el rol de manera excelente?' },
          ].map(({ label, desc }) => (
            <div key={label}>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-3 leading-relaxed">
          Una persona es "la persona correcta en el puesto correcto" cuando tiene <strong className="text-gray-900 dark:text-white">+ en todos los valores medulares y G, W y C en su rol</strong>.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. REGLA DE LAS 3 FALTAS
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
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Seleccioná una persona…</option>
              {available.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({strikesMap[m.id]?.length ?? 0}/3 faltas)
                </option>
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
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={4}
              maxLength={1000}
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

function ThreeStrikes({ members, strikesMap, onAddStrike, onRemoveStrike }) {
  const [expanded,     setExpanded]     = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [confirmDel,   setConfirmDel]   = useState(null) // { strikeId }

  async function handleAdd(userId, reason) {
    setSaving(true)
    try {
      await onAddStrike(userId, reason)
      setShowAddModal(false)
    } finally { setSaving(false) }
  }

  async function handleRemove(strikeId) {
    await onRemoveStrike(strikeId)
    setConfirmDel(null)
  }

  const membersWithStrikes = members
    .map(m => ({ ...m, strikes: strikesMap[m.id] || [] }))
    .filter(m => m.strikes.length > 0)
  const membersClean = members.filter(m => !strikesMap[m.id]?.length)

  return (
    <div className="space-y-5">
      {/* Reglas */}
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

      {/* Lista de personas con faltas */}
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
            <button
              onClick={() => setExpanded(expanded === m.id ? null : m.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
            >
              <Avatar src={m.avatar} name={m.name} />
              <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">{m.name}</span>
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
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors shrink-0" title="Eliminar falta">
                      ✕
                    </button>
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

      {showAddModal && (
        <AddStrikeModal members={members} strikesMap={strikesMap} onSave={handleAdd} onClose={() => setShowAddModal(false)} saving={saving} />
      )}
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

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ORGANIGRAMA DE RENDICIÓN DE CUENTAS
// ═══════════════════════════════════════════════════════════════════════════════

function NodeModal({ node, members, onSave, onClose, saving }) {
  const [seat, setSeat]                     = useState(node?.seat ?? '')
  const [userId, setUserId]                 = useState(node?.userId ? String(node.userId) : '')
  const [accs, setAccs]                     = useState(node?.accountabilities ?? [])
  const [accDraft, setAccDraft]             = useState('')

  const isNew = !node?.id

  function addAcc() {
    if (!accDraft.trim() || accs.length >= 10) return
    setAccs([...accs, accDraft.trim()])
    setAccDraft('')
  }

  function removeAcc(i) { setAccs(accs.filter((_, idx) => idx !== i)) }

  function handleSave() {
    if (!seat.trim()) return
    onSave({ seat: seat.trim(), userId: userId ? Number(userId) : null, accountabilities: accs })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{isNew ? 'Agregar puesto' : 'Editar puesto'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del puesto</label>
            <input type="text" value={seat} onChange={e => setSeat(e.target.value)} maxLength={100}
              placeholder="Ej: Visionario, Integrador, Director de Ventas…"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Persona asignada</label>
            <select value={userId} onChange={e => setUserId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Sin asignar</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsabilidades clave</label>
            {accs.length > 0 && (
              <ul className="space-y-1 mb-2">
                {accs.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span className="text-gray-400">·</span>
                    <span className="flex-1">{a}</span>
                    <button onClick={() => removeAcc(i)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                  </li>
                ))}
              </ul>
            )}
            {accs.length < 10 && (
              <div className="flex gap-2">
                <input type="text" value={accDraft} onChange={e => setAccDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAcc() } }}
                  placeholder="Agregar responsabilidad…" maxLength={200}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button onClick={addAcc} disabled={!accDraft.trim()}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl transition-colors disabled:opacity-40">
                  +
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={!seat.trim() || saving}
            className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AccountabilityNodeCard({ node, members, depth, onEdit, onDelete, onAddChild }) {
  const person = node.userId ? members.find(m => m.id === node.userId) : null

  return (
    <div className={`group flex items-stretch gap-0 ${depth > 0 ? '' : ''}`}>
      <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{node.seat}</p>
            {person ? (
              <div className="flex items-center gap-1.5 mt-1">
                <Avatar src={person.avatar} name={person.name} size="sm" />
                <span className="text-xs text-gray-500 dark:text-gray-400">{person.name}</span>
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">Sin asignar</p>
            )}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => onAddChild(node.id)} title="Agregar hijo" className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 text-xs">＋</button>
            <button onClick={() => onEdit(node)}        title="Editar"       className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs">✏️</button>
            <button onClick={() => onDelete(node.id)}   title="Eliminar"     className="p-1 text-gray-400 hover:text-red-500 text-xs">✕</button>
          </div>
        </div>
        {node.accountabilities.length > 0 && (
          <ul className="mt-2 space-y-0.5 pl-1 border-t border-gray-100 dark:border-gray-700 pt-2">
            {node.accountabilities.map((a, i) => (
              <li key={i} className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1">
                <span className="text-gray-300 dark:text-gray-600 shrink-0">·</span> {a}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function AccountabilityTree({ nodes, parentId = null, members, depth = 0, onEdit, onDelete, onAddChild }) {
  const children = nodes
    .filter(n => n.parentId === parentId)
    .sort((a, b) => a.order - b.order)

  if (children.length === 0) return null

  return (
    <div className={depth === 0 ? 'space-y-3' : 'ml-6 pl-4 border-l-2 border-gray-200 dark:border-gray-700 mt-3 space-y-3'}>
      {children.map(node => (
        <div key={node.id}>
          <AccountabilityNodeCard
            node={node} members={members} depth={depth}
            onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild}
          />
          <AccountabilityTree
            nodes={nodes} parentId={node.id} members={members} depth={depth + 1}
            onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild}
          />
        </div>
      ))}
    </div>
  )
}

function AccountabilityChart({ members, nodes, onCreateNode, onUpdateNode, onDeleteNode }) {
  const [modalState, setModalState] = useState(null) // { mode: 'add'|'edit', node?, parentId? }
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  async function handleSave(data) {
    setSaving(true)
    try {
      if (modalState.mode === 'add') {
        await onCreateNode({ parentId: modalState.parentId ?? null, ...data })
      } else {
        await onUpdateNode(modalState.node.id, data)
      }
      setModalState(null)
    } finally { setSaving(false) }
  }

  async function handleDelete(nodeId) {
    await onDeleteNode(nodeId)
    setConfirmDel(null)
  }

  return (
    <div className="space-y-4">
      {nodes.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">El organigrama está vacío. Comenzá agregando el puesto raíz.</p>
          <button onClick={() => setModalState({ mode: 'add', parentId: null })}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors">
            + Agregar puesto raíz
          </button>
        </div>
      ) : (
        <>
          <AccountabilityTree
            nodes={nodes} members={members}
            onEdit={node => setModalState({ mode: 'edit', node })}
            onDelete={nodeId => setConfirmDel({ nodeId })}
            onAddChild={parentId => setModalState({ mode: 'add', parentId })}
          />
          <button onClick={() => setModalState({ mode: 'add', parentId: null })}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded-xl hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
            + Agregar puesto raíz
          </button>
        </>
      )}

      {modalState && (
        <NodeModal
          node={modalState.mode === 'edit' ? modalState.node : null}
          members={members}
          onSave={handleSave}
          onClose={() => setModalState(null)}
          saving={saving}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          message="¿Eliminás este puesto? Los puestos dependientes se moverán un nivel arriba."
          onConfirm={() => handleDelete(confirmDel.nodeId)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}

function AccountabilityHelp() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
        El <strong className="text-gray-900 dark:text-white">Organigrama de Rendición de Cuentas</strong> (Accountability Chart) es diferente a un organigrama tradicional. No muestra jerarquías de autoridad, sino <em>quién es responsable de qué función</em> dentro de la empresa.
      </p>
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Estructura típica EOS</p>
        {[
          'Nivel 1: Visionario + Integrador (o el liderazgo máximo)',
          'Nivel 2: Ventas & Marketing, Operaciones, Finanzas & Admin',
          'Nivel 3: Roles específicos debajo de cada función',
        ].map(l => (
          <p key={l} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
            <span className="text-primary-400 shrink-0">→</span> {l}
          </p>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Claves para construirlo</p>
        {[
          'Cada puesto tiene entre 3 y 7 responsabilidades clave, no más.',
          'Una sola persona puede estar en el puesto correcto; si no, hay que resolverlo.',
          'El organigrama refleja la realidad actual, no la aspiracional.',
          'Revisarlo cada trimestre para asegurarse de que sigue siendo preciso.',
        ].map(l => (
          <p key={l} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
            <span className="text-primary-400 shrink-0">·</span> {l}
          </p>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PersonasTab — componente principal
// ═══════════════════════════════════════════════════════════════════════════════

export default function PersonasTab() {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [showHelp, setShowHelp] = useState(null)

  useEffect(() => {
    api.get('/eos/personas')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // ── People Analyzer
  async function handleRatingChange(userId, valueKey, rating) {
    const res = await api.patch('/eos/people-analyzer', { userId, valueKey, rating })
    setData(prev => {
      const ratingsMap = { ...prev.ratingsMap }
      if (!ratingsMap[userId]) ratingsMap[userId] = {}
      if (rating) {
        ratingsMap[userId] = { ...ratingsMap[userId], [valueKey]: rating }
      } else {
        const { [valueKey]: _, ...rest } = ratingsMap[userId]
        ratingsMap[userId] = rest
      }
      return { ...prev, ratingsMap }
    })
    return res.data
  }

  // ── Strikes
  async function handleAddStrike(userId, reason) {
    const res = await api.post('/eos/strikes', { userId, reason })
    const strike = res.data
    setData(prev => {
      const strikesMap = { ...prev.strikesMap }
      strikesMap[userId] = [...(strikesMap[userId] || []), strike]
      return { ...prev, strikesMap }
    })
  }

  async function handleRemoveStrike(strikeId) {
    await api.delete(`/eos/strikes/${strikeId}`)
    setData(prev => {
      const strikesMap = {}
      for (const [uid, strikes] of Object.entries(prev.strikesMap)) {
        const remaining = strikes.filter(s => s.id !== strikeId).map((s, i) => ({ ...s, strikeNumber: i + 1 }))
        strikesMap[uid] = remaining
      }
      return { ...prev, strikesMap }
    })
  }

  // ── Accountability Chart
  async function handleCreateNode(data) {
    const res = await api.post('/eos/accountability', data)
    setData(prev => ({ ...prev, nodes: [...prev.nodes, res.data] }))
  }

  async function handleUpdateNode(id, changes) {
    const res = await api.patch(`/eos/accountability/${id}`, changes)
    setData(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id === id ? res.data : n) }))
  }

  async function handleDeleteNode(id) {
    await api.delete(`/eos/accountability/${id}`)
    setData(prev => ({
      ...prev,
      nodes: prev.nodes
        .filter(n => n.id !== id)
        .map(n => n.parentId === id ? { ...n, parentId: prev.nodes.find(x => x.id === id)?.parentId ?? null } : n),
    }))
  }

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  const { members, coreValues, ratingsMap, strikesMap, nodes } = data

  return (
    <div className="space-y-6">

      {/* ── 1. Analizador de Personas ── */}
      <SectionCard
        title="Analizador de Personas"
        desc="Evaluá a cada miembro del equipo contra los Valores Medulares y el GWC de su puesto."
        onHelp={() => setShowHelp('analyzer')}
      >
        <PeopleAnalyzer
          members={members}
          coreValues={coreValues}
          ratingsMap={ratingsMap}
          onRatingChange={handleRatingChange}
        />
      </SectionCard>

      {/* ── 2. Regla de las 3 Faltas ── */}
      <SectionCard
        title="Regla de las 3 Faltas"
        desc="Protocolo para acompañar y, cuando es necesario, separar a quienes no viven los valores medulares."
      >
        <ThreeStrikes
          members={members}
          strikesMap={strikesMap}
          onAddStrike={handleAddStrike}
          onRemoveStrike={handleRemoveStrike}
        />
      </SectionCard>

      {/* ── 3. Organigrama de Rendición de Cuentas ── */}
      <SectionCard
        title="Organigrama de Rendición de Cuentas"
        desc="Define quién es responsable de cada función clave de la empresa."
        onHelp={() => setShowHelp('accountability')}
      >
        <AccountabilityChart
          members={members}
          nodes={nodes}
          onCreateNode={handleCreateNode}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
        />
      </SectionCard>

      {/* ── Modales de ayuda ── */}
      {showHelp === 'analyzer' && (
        <HelpModal title="¿Cómo usar el Analizador de Personas?" onClose={() => setShowHelp(null)}>
          <PeopleAnalyzerHelp />
        </HelpModal>
      )}
      {showHelp === 'accountability' && (
        <HelpModal title="¿Cómo construir el Organigrama de Rendición de Cuentas?" onClose={() => setShowHelp(null)}>
          <AccountabilityHelp />
        </HelpModal>
      )}

    </div>
  )
}
