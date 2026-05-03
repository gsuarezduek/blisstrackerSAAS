import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../api/client'

// ─── Helpers de tiempo (para VTO) ────────────────────────────────────────────

function currentQuarterStr() {
  const now = new Date()
  return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`
}

function quarterLabel(q) {
  if (!q) return ''
  const [year, qPart] = q.split('-')
  return `${qPart} ${year}`
}

// ─── VTO View ────────────────────────────────────────────────────────────────

function VTOBox({ title, accent, children, className = '' }) {
  return (
    <div className={`border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden ${className}`}>
      <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${accent}`}>
        {title}
      </div>
      <div className="px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 min-h-[60px]">
        {children}
      </div>
    </div>
  )
}

function VTOList({ items, empty = 'No definido' }) {
  if (!items || items.length === 0) return <span className="text-gray-400 italic text-xs">{empty}</span>
  return (
    <ul className="space-y-0.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs">
          <span className="text-gray-400 shrink-0 mt-0.5">·</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function VTOText({ value, empty = 'No definido' }) {
  if (!value?.trim()) return <span className="text-gray-400 italic text-xs">{empty}</span>
  return <p className="text-xs leading-relaxed whitespace-pre-wrap">{value}</p>
}

function VTOView({ data, workspaceName, onClose }) {
  const [rocks,  setRocks]   = useState([])
  const [issues, setIssues]  = useState([])
  const [members, setMembers] = useState([])
  const quarter = currentQuarterStr()

  useEffect(() => {
    Promise.all([
      api.get(`/eos/traction/rocks?quarter=${quarter}`),
      api.get('/eos/issues'),
    ]).then(([rocksRes, issuesRes]) => {
      setRocks(rocksRes.data.rocks)
      setMembers(rocksRes.data.members)
      setIssues(issuesRes.data.issues.filter(i => i.status === 'open' && i.type === 'weekly'))
    }).catch(() => {})
  }, [quarter])

  const accentBlue = 'bg-blue-600 text-white'
  const accentGray = 'bg-gray-700 text-white'

  function ownerName(ownerId) {
    const m = members.find(m => m.id === ownerId)
    return m ? m.name.split(' ')[0] : ''
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Vision/Traction Organizer™</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{workspaceName} · {new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long' })}</p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          ✏️ Editar
        </button>
      </div>

      {/* VTO Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* Col izquierda */}
        <div className="space-y-3">

          {/* Core Values + Core Focus side by side */}
          <div className="grid grid-cols-2 gap-3">
            <VTOBox title="Core Values" accent={accentBlue}>
              <VTOList items={data?.coreValues} empty="Sin valores definidos" />
            </VTOBox>
            <VTOBox title="Core Focus™" accent={accentBlue}>
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Propósito</p>
                  <VTOText value={data?.purpose} empty="Sin definir" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Nicho</p>
                  <VTOText value={data?.niche} empty="Sin definir" />
                </div>
              </div>
            </VTOBox>
          </div>

          {/* 3-Year Picture */}
          <VTOBox title="Imagen a 3 Años™" accent={accentBlue}>
            <div className="space-y-1.5">
              {(data?.threeYearRevenue || data?.threeYearProfit || data?.threeYearHeadcount) && (
                <div className="flex flex-wrap gap-3 text-xs pb-1 border-b border-gray-100 dark:border-gray-700">
                  {data?.threeYearRevenue   && <span><span className="text-gray-400">Ingresos:</span> {data.threeYearRevenue}</span>}
                  {data?.threeYearProfit    && <span><span className="text-gray-400">Rentabilidad:</span> {data.threeYearProfit}</span>}
                  {data?.threeYearHeadcount && <span><span className="text-gray-400">Equipo:</span> {data.threeYearHeadcount}</span>}
                </div>
              )}
              <VTOText value={data?.threeYearDescription} empty="Sin descripción" />
              {data?.threeYearGoals?.length > 0 && (
                <VTOList items={data.threeYearGoals} />
              )}
            </div>
          </VTOBox>

          {/* 1-Year Plan */}
          <VTOBox title="Plan a 1 Año" accent={accentBlue}>
            <div className="space-y-1.5">
              {(data?.oneYearRevenue || data?.oneYearProfit) && (
                <div className="flex flex-wrap gap-3 text-xs pb-1 border-b border-gray-100 dark:border-gray-700">
                  {data?.oneYearRevenue && <span><span className="text-gray-400">Ingresos:</span> {data.oneYearRevenue}</span>}
                  {data?.oneYearProfit  && <span><span className="text-gray-400">Rentabilidad:</span> {data.oneYearProfit}</span>}
                </div>
              )}
              <VTOList items={data?.oneYearGoals} empty="Sin metas anuales" />
            </div>
          </VTOBox>

        </div>

        {/* Col derecha */}
        <div className="space-y-3">

          {/* 10-Year Target */}
          <VTOBox title="Meta a 10 Años™" accent={accentGray} className="min-h-[100px]">
            <VTOText value={data?.tenYearTarget} empty="Sin meta a 10 años" />
          </VTOBox>

          {/* Marketing Strategy */}
          <VTOBox title="Estrategia de Marketing" accent={accentGray}>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Cliente Ideal</p>
                <VTOText value={data?.marketingTarget} empty="Sin definir" />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-0.5">3 Diferenciadores</p>
                <VTOList items={data?.marketingUniques} empty="Sin diferenciadores" />
              </div>
              {data?.marketingProcess && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Proceso Probado</p>
                  <VTOText value={data.marketingProcess} />
                </div>
              )}
              {data?.marketingGuarantee && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase mb-0.5">Garantía</p>
                  <VTOText value={data.marketingGuarantee} />
                </div>
              )}
            </div>
          </VTOBox>

          {/* Rocks */}
          <VTOBox title={`Rocas · ${quarterLabel(quarter)}`} accent={accentGray}>
            {rocks.filter(r => r.status !== 'complete').length === 0 ? (
              <span className="text-gray-400 italic text-xs">Sin rocas para este trimestre</span>
            ) : (
              <ul className="space-y-1">
                {rocks.filter(r => r.status !== 'complete').map(rock => (
                  <li key={rock.id} className="flex items-center gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      rock.status === 'on_track'  ? 'bg-green-500' :
                      rock.status === 'off_track' ? 'bg-red-500'   : 'bg-gray-400'
                    }`} />
                    <span className="flex-1">{rock.title}</span>
                    {rock.ownerId && <span className="text-gray-400">{ownerName(rock.ownerId)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </VTOBox>

          {/* Issues */}
          <VTOBox title="Asuntos" accent={accentGray}>
            {issues.length === 0 ? (
              <span className="text-gray-400 italic text-xs">Sin issues abiertos</span>
            ) : (
              <ul className="space-y-0.5">
                {issues.slice(0, 8).map(issue => (
                  <li key={issue.id} className="flex items-start gap-1.5 text-xs">
                    <span className={`shrink-0 mt-0.5 text-[8px] font-bold ${
                      issue.priority === 'high' ? 'text-red-500' :
                      issue.priority === 'medium' ? 'text-yellow-500' : 'text-gray-400'
                    }`}>●</span>
                    <span>{issue.title}</span>
                  </li>
                ))}
                {issues.length > 8 && <li className="text-xs text-gray-400 pl-3">+{issues.length - 8} más</li>}
              </ul>
            )}
          </VTOBox>

        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI primitivos
// ═══════════════════════════════════════════════════════════════════════════════

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

function SectionCard({ title, desc, saving, saved, onHelp, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          {desc && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {saving  && <span className="text-xs text-gray-400">Guardando…</span>}
          {!saving && saved && <span className="text-xs text-green-500">✓ Guardado</span>}
          {onHelp && (
            <button onClick={onHelp} className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">? Ayuda</button>
          )}
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 mt-4 pt-4">{children}</div>
    </div>
  )
}

// Campo de texto simple dentro de una subsección
function SubField({ label, hint, value, onChange, rows = 3, maxLength = 500, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">{label}</label>
      {hint && <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{hint}</p>}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
      />
    </div>
  )
}

// Campo de texto de una línea
function InlineField({ label, value, onChange, placeholder, maxLength = 200 }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </div>
  )
}

// Lista editable genérica (add/edit/remove)
function ItemsList({ items, onChange, maxItems, minItems = 0, placeholder, emptyMsg }) {
  const [draft,   setDraft]   = useState('')
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')
  const inputRef = useRef(null)

  const canAdd = items.length < maxItems && draft.trim().length > 0

  function handleAdd() {
    if (!canAdd) return
    onChange([...items, draft.trim()])
    setDraft('')
    inputRef.current?.focus()
  }

  function handleRemove(i) { onChange(items.filter((_, idx) => idx !== i)) }

  function startEdit(i)  { setEditing(i); setEditVal(items[i]) }
  function commitEdit(i) {
    if (!editVal.trim()) { setEditing(null); return }
    const next = [...items]; next[i] = editVal.trim()
    onChange(next); setEditing(null)
  }

  return (
    <div className="space-y-3">
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((v, i) => (
            <li key={i} className="flex items-center gap-2 group">
              <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs flex items-center justify-center font-semibold shrink-0">
                {i + 1}
              </span>
              {editing === i ? (
                <input
                  autoFocus value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(i); if (e.key === 'Escape') setEditing(null) }}
                  onBlur={() => commitEdit(i)}
                  className="flex-1 px-2 py-1 text-sm border border-primary-400 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <span className="flex-1 text-sm text-gray-800 dark:text-gray-200 cursor-pointer hover:text-primary-600 dark:hover:text-primary-400" onDoubleClick={() => startEdit(i)} title="Doble clic para editar">{v}</span>
              )}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {editing !== i && <button onClick={() => startEdit(i)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs">✏️</button>}
                <button onClick={() => handleRemove(i)} className="p-1 text-gray-400 hover:text-red-500 text-xs">✕</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">{emptyMsg}</p>
      )}

      {(() => {
        const tooFew  = minItems > 0 && items.length > 0 && items.length < minItems
        const perfect = minItems > 0 && items.length >= minItems
        const atMax   = items.length >= maxItems && minItems === 0
        const color   = tooFew ? 'text-amber-500' : perfect ? 'text-green-500' : atMax ? 'text-amber-500' : 'text-gray-400'
        const label   = tooFew  ? ` · necesitás exactamente ${minItems}`
          : perfect && minItems === maxItems ? ' · ✓ completo'
          : atMax   ? ' · máximo alcanzado'
          : ''
        return <p className={`text-xs font-medium ${color}`}>{items.length} / {maxItems}{label}</p>
      })()}

      {items.length < maxItems && (
        <div className="flex gap-2">
          <input ref={inputRef} type="text" value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
            placeholder={placeholder} maxLength={200}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button onClick={handleAdd} disabled={!canAdd}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            Agregar
          </button>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook: auto-save con debounce
// ═══════════════════════════════════════════════════════════════════════════════

function useDebouncedField(initial, fieldKey, onSave, delay = 800) {
  const [value, setValue]   = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const timer = useRef(null)

  useEffect(() => { setValue(initial) }, [initial])

  function handleChange(next) {
    setValue(next)
    setSaved(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await onSave({ [fieldKey]: next })
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } finally { setSaving(false) }
    }, delay)
  }

  return { value, handleChange, saving, saved }
}

// Lista con auto-save propio
function useDebouncedList(initial, fieldKey, onSave, delay = 800) {
  const [items,  setItems]  = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const timer = useRef(null)

  useEffect(() => { setItems(initial) }, [initial])   // eslint-disable-line

  function handleChange(next) {
    setItems(next)
    setSaved(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await onSave({ [fieldKey]: next })
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } finally { setSaving(false) }
    }, delay)
  }

  return { items, handleChange, saving, saved }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Contenidos de ayuda
// ═══════════════════════════════════════════════════════════════════════════════

function HelpStep({ step, children }) {
  return (
    <div>
      <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-1">{step}</p>
      {children}
    </div>
  )
}

function HelpArrows({ items }) {
  return (
    <ul className="space-y-1 mt-2">
      {items.map(q => (
        <li key={q} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
          <span className="text-primary-400 shrink-0 mt-0.5">→</span> {q}
        </li>
      ))}
    </ul>
  )
}

function HelpBox({ label, items }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
      {label && <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{label}</p>}
      <HelpArrows items={items} />
    </div>
  )
}

function HelpExamples({ items }) {
  return (
    <div className="space-y-1 mt-2">
      {items.map(ex => (
        <p key={ex} className="text-xs text-gray-500 dark:text-gray-400 italic pl-2 border-l-2 border-gray-200 dark:border-gray-600">{ex}</p>
      ))}
    </div>
  )
}

// ── Valores Medulares ────────────────────────────────────────────────────────

const CORE_VALUES_STEPS = [
  { step: 'PASO 1', body: 'Pide que cada miembro elabore un listado de tres personas a quienes, si pudieran clonarlos, llevarían a la organización a dominar el mercado. De preferencia, estos tres nombres debieran venir de adentro de la empresa. Al tener cada persona su listado de tres, pon todos los nombres en una pizarra para que todos puedan verlos.' },
  { step: 'PASO 2', body: 'Repasa los nombres y haz un listado de las características que esas personas representan. ¿Qué cualidades ejemplifican? ¿Qué hacen que los pone en la lista?', examples: ['Excelencia inequívoca','Continuamente busca la perfección','Gana','Hace lo correcto','Compasión','Honestidad e integridad','Anhela el éxito','Es entusiasta, energético, tenaz y competitivo','Fomenta la habilidad y creatividad individual','Rinde cuentas','Atiende a clientes por sobre todas las cosas','Trabaja arduamente','Nunca está satisfecho','Se interesa constantemente en su crecimiento personal','Ayuda primero','Exhibe profesionalismo','Promueve la iniciativa individual','Orientado al crecimiento','Trata a todos con respeto','Da oportunidades en base al mérito','Tiene creatividad, sueños e imaginación','Tiene integridad personal','No es cínico','Exhibe modestia y humildad junto con confianza','Practica atención fanática a la consistencia y detalle','Está comprometido','Entiende el valor de la reputación','Es alegre','Es justo','Promueve el trabajo en equipo'] },
  { step: 'PASO 3', body: 'Redúcelo. Circula cuales son realmente importantes, tacha aquellos que no lo son, y combina aquellos que son similares. La regla es tener entre tres y siete.' },
  { step: 'PASO 4', body: 'A través de discusión de grupo y debate, decide qué valores realmente pertenecen y son realmente medulares. Tu meta es bajarlos a un número entre tres y siete.' },
]

function CoreValuesHelp() {
  return (
    <div className="space-y-5">
      {CORE_VALUES_STEPS.map(({ step, body, examples }) => (
        <HelpStep key={step} step={step}>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{body}</p>
          {examples && (
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {examples.map(ex => <li key={ex} className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1"><span className="text-primary-400 mt-0.5 shrink-0">•</span> {ex}</li>)}
            </ul>
          )}
        </HelpStep>
      ))}
    </div>
  )
}

// ── Enfoque Medular ──────────────────────────────────────────────────────────

function EnfoqueMedularHelp() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">El <strong className="text-gray-900 dark:text-white">Enfoque Medular</strong> es el punto dulce de tu organización: la intersección entre lo que te apasiona y lo que hacés mejor que nadie. Se compone de dos elementos: el <em>Propósito</em> y el <em>Nicho</em>.</p>
      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Propósito / Causa / Pasión</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">Es la razón profunda por la que existe tu empresa, más allá de ganar dinero. Un propósito genuino inspira al equipo y orienta las decisiones difíciles.</p>
        <HelpBox label="Preguntas para descubrirlo" items={['¿Por qué hacemos lo que hacemos?','¿Qué cambiaría en el mundo si dejáramos de existir?','¿Qué queremos lograr para nuestros clientes más allá del servicio puntual?','¿Qué causa o valor nos da energía cada mañana?']} />
        <HelpExamples items={['"Mejorar la vida de las personas a través del diseño."','"Democratizar el acceso a la tecnología para las PyMEs."','"Ayudar a los emprendedores a alcanzar su máximo potencial."']} />
      </div>
      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Nicho</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">El nicho define <em>qué hacés</em> y <em>para quién</em>. Cuanto más específico, más fácil es tomar decisiones sobre qué proyectos aceptar y qué rechazar.</p>
        <HelpBox label="Preguntas para descubrirlo" items={['¿Quién es tu cliente ideal? (industria, tamaño, ubicación)','¿Qué problema específico resolvés mejor que cualquier competidor?','¿Cuándo sentís que estás en tu mejor versión como empresa?']} />
        <HelpExamples items={['"Agencia de marketing digital para e-commerce de moda en LATAM."','"Consultoría de procesos para PyMEs industriales argentinas."']} />
      </div>
    </div>
  )
}

// ── Meta a 10 años ───────────────────────────────────────────────────────────

function TenYearHelp() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Reúnete con tu equipo de liderazgo y discutan hacia dónde quieren llevar tu organización. Nunca he visto que un equipo aterrice en la misma página con respecto a su meta de 10 años en la primera discusión. Ten paciencia en el primer intento.</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Recomiendo empezar preguntándole a todos qué tan lejos quieren ver. Después les preguntaría a todos qué nivel de ingresos creen que la organización podría tener para ese punto. Puede tomar varias reuniones llegar a la respuesta final.</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Al tomar esa decisión, confirma que todos se sientan motivados por ella. Tu meta a 10 años debe ser <strong className="text-gray-900 dark:text-white">específica y medible</strong>. Sabrás cuál es la meta correcta cuando cause pasión, emoción y energía en cada persona de tu organización.</p>
      <HelpBox label="Preguntas para arrancar la discusión" items={['¿Qué tan lejos queremos ver? ¿Cuál es nuestra ambición máxima?','¿Qué nivel de ingresos podríamos tener en 10 años?','¿Cómo queremos que nos conozca el mercado dentro de una década?','¿Qué impacto queremos haber generado en nuestros clientes y en la industria?']} />
    </div>
  )
}

// ── Estrategia de Marketing ──────────────────────────────────────────────────

function MarketingHelp() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">La <strong className="text-gray-900 dark:text-white">Estrategia de Marketing</strong> define con precisión a quién le hablás, qué te hace único, cómo entregás tu servicio y qué prometés. Estos cuatro elementos alinean a todo el equipo y simplifican la toma de decisiones comerciales.</p>

      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">La Lista / Cliente Ideal</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2">Describí con la mayor precisión posible a tu cliente ideal. Cuanto más específico, más efectiva tu estrategia.</p>
        <HelpBox label="Dimensiones a definir" items={['Industria o sector','Tamaño de empresa (empleados, facturación)','Ubicación geográfica','Cargo del tomador de decisiones','Problemas o dolores que tiene']} />
        <HelpExamples items={['"Dueños de PyMEs industriales con 10-50 empleados en Argentina."','"CMOs de startups tech de LATAM en etapa Serie A o B."']} />
      </div>

      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Tres Diferenciadores</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2">Exactamente <strong className="text-gray-900 dark:text-white">3 cosas</strong> que te hacen diferente y mejor a tu competencia. Deben ser genuinas, verificables y relevantes para tu cliente ideal.</p>
        <HelpBox label="Preguntas" items={['¿Por qué un cliente elegiría trabajar con vos sobre cualquier alternativa?','¿Qué cosas hacés que tu competencia no puede copiar fácilmente?','¿Qué aspectos de tu servicio generan más comentarios positivos?']} />
        <HelpExamples items={['"Resultados garantizados en 90 días."','"Equipo 100% senior — nunca trabajás con juniors."','"Metodología propia probada en +200 clientes."']} />
      </div>

      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Proceso Probado</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2">Los pasos específicos que seguís para entregar tus resultados. Un proceso claro genera confianza en el cliente y consistencia interna.</p>
        <HelpExamples items={['"1. Diagnóstico → 2. Estrategia → 3. Implementación → 4. Optimización → 5. Reporte."']} />
      </div>

      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">Garantía</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-2">¿Qué le prometés al cliente que, si no se cumple, corregís sin costo o devolvés el dinero? Remueve el riesgo percibido y comunica confianza.</p>
        <HelpExamples items={['"Si no ves resultados medibles en 90 días, devolvemos el dinero."','"Satisfacción garantizada: si no estás conforme, revisamos sin cargo adicional."']} />
      </div>
    </div>
  )
}

// ── Imagen a 3 años ──────────────────────────────────────────────────────────

function ThreeYearHelp() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">La <strong className="text-gray-900 dark:text-white">Imagen a 3 años</strong> es una descripción vívida y específica de cómo se ve tu negocio en tres años. Su propósito es que todos en el equipo de liderazgo tengan exactamente la misma imagen mental.</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Empieza con los números concretos (ingresos, rentabilidad, headcount) y luego describí cómo <em>se ve, se siente y actúa</em> la organización. Incluí cuántos clientes tenés, en qué mercados operás, qué productos o servicios ofrecés.</p>
      <HelpBox label="Preguntas para construirla" items={['¿Cuántos clientes activos tenemos en 3 años?','¿En qué países o regiones operamos?','¿Qué productos o servicios nuevos lanzamos?','¿Cómo es la cultura del equipo? ¿Cuántos somos?','¿Cuál es nuestra reputación en el mercado?','¿Qué procesos o sistemas tenemos en funcionamiento?']} />
      <HelpBox label="Formato sugerido de objetivos específicos" items={['$X en ingresos anuales','X% de margen neto','X empleados a tiempo completo','Presencia en X países o ciudades','X clientes activos recurrentes']} />
    </div>
  )
}

// ── Plan a 1 año ─────────────────────────────────────────────────────────────

function OneYearHelp() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">El <strong className="text-gray-900 dark:text-white">Plan a 1 año</strong> establece los objetivos más importantes para los próximos 12 meses. Debe estar alineado con la Imagen a 3 años y ser alcanzable con los recursos actuales.</p>
      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Define entre <strong className="text-gray-900 dark:text-white">3 y 7 prioridades anuales</strong> (llamadas <em>Rocks</em> en EOS). Si todo se cayera y solo pudieras hacer una cosa, ¿cuáles serían las más importantes? Esas son tus Rocks.</p>
      <HelpBox label="Cómo escribir un Rock anual" items={['Comenzá con un verbo de acción: Lanzar, Contratar, Alcanzar, Implementar, Cerrar…','Incluí una métrica o fecha de vencimiento concreta','Asigná un responsable para cada uno','Ejemplos: "Alcanzar $X en ventas", "Contratar 2 developers senior", "Lanzar producto Y en Q3"']} />
      <HelpBox label="Preguntas para identificar los Rocks" items={['¿Qué debe pasar este año para estar en camino a la Imagen a 3 años?','¿Cuáles son los 3-7 proyectos o cambios más importantes?','¿Qué problemas críticos hay que resolver en los próximos 12 meses?','¿Qué oportunidades grandes hay que capturar este año?']} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sección: Valores Medulares (lista con add/edit/remove)
// ═══════════════════════════════════════════════════════════════════════════════

function CoreValuesSection({ items, onChange }) {
  const countColor = items.length < 3 ? 'text-amber-500' : items.length <= 7 ? 'text-green-500' : 'text-red-500'
  return (
    <div className="space-y-1">
      <ItemsList
        items={items} onChange={onChange} maxItems={7}
        placeholder="Escribí un valor y presioná Enter…"
        emptyMsg="Todavía no hay valores definidos. Agregá entre 3 y 7."
      />
      <p className={`text-xs font-medium ${countColor}`}>
        {items.length} / 7{items.length > 0 && items.length < 3 && ' · necesitás al menos 3'}
      </p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// VisionTab — componente principal
// ═══════════════════════════════════════════════════════════════════════════════

export default function VisionTab() {
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [showHelp, setShowHelp] = useState(null)
  const [vtoMode,  setVtoMode]  = useState(false)

  // Workspace name para el VTO header
  const workspaceName = typeof window !== 'undefined'
    ? (window.location.hostname.split('.')[0] || 'Mi Empresa')
    : 'Mi Empresa'

  useEffect(() => {
    api.get('/eos')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function saveFields(fields) {
    const res = await api.patch('/eos', fields)
    setData(prev => ({ ...prev, ...res.data }))
    return res.data
  }

  // ── Valores Medulares
  const coreValues = useDebouncedList(data?.coreValues ?? [], 'coreValues', saveFields)

  // ── Enfoque Medular
  const purpose = useDebouncedField(data?.purpose ?? '', 'purpose', saveFields)
  const niche   = useDebouncedField(data?.niche   ?? '', 'niche',   saveFields)

  // ── Meta a 10 años
  const tenYearTarget = useDebouncedField(data?.tenYearTarget ?? '', 'tenYearTarget', saveFields)

  // ── Estrategia de Marketing
  const marketingTarget    = useDebouncedField(data?.marketingTarget    ?? '', 'marketingTarget',    saveFields)
  const marketingUniques   = useDebouncedList( data?.marketingUniques   ?? [], 'marketingUniques',   saveFields)
  const marketingProcess   = useDebouncedField(data?.marketingProcess   ?? '', 'marketingProcess',   saveFields)
  const marketingGuarantee = useDebouncedField(data?.marketingGuarantee ?? '', 'marketingGuarantee', saveFields)

  // ── Imagen a 3 años
  const threeYearRevenue     = useDebouncedField(data?.threeYearRevenue     ?? '', 'threeYearRevenue',     saveFields)
  const threeYearProfit      = useDebouncedField(data?.threeYearProfit      ?? '', 'threeYearProfit',      saveFields)
  const threeYearHeadcount   = useDebouncedField(data?.threeYearHeadcount   ?? '', 'threeYearHeadcount',   saveFields)
  const threeYearDescription = useDebouncedField(data?.threeYearDescription ?? '', 'threeYearDescription', saveFields)
  const threeYearGoals       = useDebouncedList( data?.threeYearGoals       ?? [], 'threeYearGoals',       saveFields)

  // ── Plan a 1 año
  const oneYearRevenue = useDebouncedField(data?.oneYearRevenue ?? '', 'oneYearRevenue', saveFields)
  const oneYearProfit  = useDebouncedField(data?.oneYearProfit  ?? '', 'oneYearProfit',  saveFields)
  const oneYearGoals   = useDebouncedList( data?.oneYearGoals   ?? [], 'oneYearGoals',   saveFields)

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  if (vtoMode) {
    return <VTOView data={data} workspaceName={workspaceName} onClose={() => setVtoMode(false)} />
  }

  const progress = [
    { label: 'Valores Medulares',       done: coreValues.items.length >= 3 },
    { label: 'Enfoque Medular',         done: !!(purpose.value.trim() || niche.value.trim()) },
    { label: 'Meta a 10 años',          done: !!tenYearTarget.value.trim() },
    { label: 'Estrategia de Marketing', done: !!(marketingTarget.value.trim() || marketingUniques.items.length > 0) },
    { label: 'Imagen a 3 años',         done: !!(threeYearDescription.value.trim() || threeYearGoals.items.length > 0) },
    { label: 'Plan a 1 año',            done: oneYearGoals.items.length > 0 },
  ]
  const doneCount = progress.filter(s => s.done).length

  return (
    <div className="space-y-6">

      {/* ── VTO Button ── */}
      <div className="flex justify-end">
        <button
          onClick={() => setVtoMode(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors shadow-sm"
        >
          📄 Ver VTO
        </button>
      </div>

      {/* ── Progreso ── */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Progreso del V/TO</p>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{doneCount} / {progress.length} secciones</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {progress.map(s => (
            <span key={s.label} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              s.done
                ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.done ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── 1. Valores Medulares ── */}
      <SectionCard
        title="Valores Medulares"
        desc="Los principios rectores vitales y trascendentes que definen la cultura y quiénes son como personas."
        saving={coreValues.saving} saved={coreValues.saved}
        onHelp={() => setShowHelp('coreValues')}
      >
        <CoreValuesSection items={coreValues.items} onChange={coreValues.handleChange} />
      </SectionCard>

      {/* ── 2. Enfoque Medular ── */}
      <SectionCard
        title="Enfoque Medular"
        desc="El punto dulce de tu organización: la intersección entre lo que te apasiona y lo que hacés mejor que nadie."
        saving={purpose.saving || niche.saving} saved={purpose.saved || niche.saved}
        onHelp={() => setShowHelp('enfoque')}
      >
        <div className="space-y-5">
          <SubField
            label="Propósito / Causa / Pasión"
            hint="¿Cuál es el propósito, causa o pasión de tu organización?"
            value={purpose.value} onChange={purpose.handleChange}
            placeholder="Ej: Ayudar a las empresas a alcanzar su máximo potencial a través de la tecnología."
          />
          <SubField
            label="Nicho"
            hint="¿Cuál es el nicho de tu organización?"
            value={niche.value} onChange={niche.handleChange}
            placeholder="Ej: Agencia de marketing digital para e-commerce de moda en LATAM."
          />
        </div>
      </SectionCard>

      {/* ── 3. Meta a 10 años ── */}
      <SectionCard
        title="Meta a 10 años"
        desc="¿Dónde querés que esté tu organización dentro de una década?"
        saving={tenYearTarget.saving} saved={tenYearTarget.saved}
        onHelp={() => setShowHelp('tenYear')}
      >
        <SubField
          label="" hint=""
          value={tenYearTarget.value} onChange={tenYearTarget.handleChange}
          rows={4} maxLength={1000}
          placeholder="Ej: Ser la agencia de marketing digital líder en LATAM, con presencia en 5 países y 200 clientes activos."
        />
      </SectionCard>

      {/* ── 4. Estrategia de Marketing ── */}
      <SectionCard
        title="Estrategia de Marketing"
        desc="Define a quién le hablás, qué te hace único, cómo entregás y qué prometés."
        saving={marketingTarget.saving || marketingUniques.saving || marketingProcess.saving || marketingGuarantee.saving}
        saved={marketingTarget.saved  || marketingUniques.saved  || marketingProcess.saved  || marketingGuarantee.saved}
        onHelp={() => setShowHelp('marketing')}
      >
        <div className="space-y-6">
          <SubField
            label="La Lista / Cliente Ideal"
            hint="¿Quién es exactamente tu cliente ideal?"
            value={marketingTarget.value} onChange={marketingTarget.handleChange}
            rows={3} maxLength={1000}
            placeholder="Ej: Dueños de PyMEs de servicios con 5 a 30 empleados en Argentina, que quieren sistematizar su gestión."
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">Tres Diferenciadores</label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Las 3 cosas que te hacen diferente y mejor a tu competencia. Exactamente 3.</p>
            <ItemsList
              items={marketingUniques.items} onChange={marketingUniques.handleChange}
              maxItems={3} minItems={3} placeholder="Ej: Resultados garantizados en 90 días…"
              emptyMsg="Agregá exactamente 3 diferenciadores."
            />
          </div>

          <SubField
            label="Proceso Probado"
            hint="Los pasos que seguís para entregar tus resultados."
            value={marketingProcess.value} onChange={marketingProcess.handleChange}
            rows={3} maxLength={2000}
            placeholder="Ej: 1. Diagnóstico → 2. Estrategia → 3. Implementación → 4. Optimización → 5. Reporte mensual."
          />

          <SubField
            label="Garantía"
            hint="¿Qué le prometés al cliente que, si no se cumple, corregís o devolvés?"
            value={marketingGuarantee.value} onChange={marketingGuarantee.handleChange}
            rows={2} maxLength={500}
            placeholder='Ej: "Si no ves resultados medibles en 90 días, devolvemos el dinero."'
          />
        </div>
      </SectionCard>

      {/* ── 5. Imagen a 3 años ── */}
      <SectionCard
        title="Imagen a 3 años"
        desc="Una descripción vívida y específica de cómo se ve tu negocio en tres años."
        saving={threeYearRevenue.saving || threeYearProfit.saving || threeYearHeadcount.saving || threeYearDescription.saving || threeYearGoals.saving}
        saved={threeYearRevenue.saved  || threeYearProfit.saved  || threeYearHeadcount.saved  || threeYearDescription.saved  || threeYearGoals.saved}
        onHelp={() => setShowHelp('threeYear')}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <InlineField label="Ingresos objetivo" value={threeYearRevenue.value}   onChange={threeYearRevenue.handleChange}   placeholder="Ej: $2M anuales" />
            <InlineField label="Rentabilidad"       value={threeYearProfit.value}    onChange={threeYearProfit.handleChange}    placeholder="Ej: 25% margen neto" />
            <InlineField label="N.° de empleados"   value={threeYearHeadcount.value} onChange={threeYearHeadcount.handleChange} placeholder="Ej: 20 personas" />
          </div>

          <SubField
            label="Descripción general"
            hint="¿Cómo se ve, se siente y actúa la organización en 3 años?"
            value={threeYearDescription.value} onChange={threeYearDescription.handleChange}
            rows={4} maxLength={2000}
            placeholder="Ej: Somos reconocidos como la agencia de referencia en marketing para e-commerce en Argentina. Tenemos 80 clientes activos, operamos desde Buenos Aires y Montevideo, y el equipo está compuesto por 20 personas..."
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">Objetivos específicos</label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Metas concretas y medibles que confirman que llegaste a la imagen.</p>
            <ItemsList
              items={threeYearGoals.items} onChange={threeYearGoals.handleChange}
              maxItems={7} placeholder="Ej: 80 clientes activos recurrentes…"
              emptyMsg="Agregá entre 3 y 7 objetivos específicos."
            />
          </div>
        </div>
      </SectionCard>

      {/* ── 6. Plan a 1 año ── */}
      <SectionCard
        title="Plan a 1 año"
        desc="Las prioridades más importantes para los próximos 12 meses, alineadas con la Imagen a 3 años."
        saving={oneYearRevenue.saving || oneYearProfit.saving || oneYearGoals.saving}
        saved={oneYearRevenue.saved  || oneYearProfit.saved  || oneYearGoals.saved}
        onHelp={() => setShowHelp('oneYear')}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InlineField label="Ingresos objetivo del año" value={oneYearRevenue.value} onChange={oneYearRevenue.handleChange} placeholder="Ej: $800K" />
            <InlineField label="Rentabilidad objetivo"     value={oneYearProfit.value}  onChange={oneYearProfit.handleChange}  placeholder="Ej: 20% margen neto" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">Prioridades del año (Rocks)</label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Entre 3 y 7 proyectos o cambios que deben ocurrir este año sí o sí.</p>
            <ItemsList
              items={oneYearGoals.items} onChange={oneYearGoals.handleChange}
              maxItems={7} placeholder="Ej: Lanzar producto X en Q2…"
              emptyMsg="Agregá entre 3 y 7 Rocks para este año."
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Modales de ayuda ── */}
      {showHelp === 'coreValues' && <HelpModal title="¿Cómo definir los Valores Medulares?"   onClose={() => setShowHelp(null)}><CoreValuesHelp /></HelpModal>}
      {showHelp === 'enfoque'    && <HelpModal title="¿Cómo definir el Enfoque Medular?"       onClose={() => setShowHelp(null)}><EnfoqueMedularHelp /></HelpModal>}
      {showHelp === 'tenYear'    && <HelpModal title="¿Cómo fijar una Meta a 10 años?"         onClose={() => setShowHelp(null)}><TenYearHelp /></HelpModal>}
      {showHelp === 'marketing'  && <HelpModal title="¿Cómo definir la Estrategia de Marketing?" onClose={() => setShowHelp(null)}><MarketingHelp /></HelpModal>}
      {showHelp === 'threeYear'  && <HelpModal title="¿Cómo construir la Imagen a 3 años?"    onClose={() => setShowHelp(null)}><ThreeYearHelp /></HelpModal>}
      {showHelp === 'oneYear'    && <HelpModal title="¿Cómo armar el Plan a 1 año?"           onClose={() => setShowHelp(null)}><OneYearHelp /></HelpModal>}

    </div>
  )
}
