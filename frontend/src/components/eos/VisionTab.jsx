import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'

// ─── Modal genérico de ayuda ──────────────────────────────────────────────────

function HelpModal({ title, children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
          <button onClick={onClose} className="w-full py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors">
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Contenido de ayuda: Valores Medulares ────────────────────────────────────

const CORE_VALUES_STEPS = [
  {
    step: 'PASO 1',
    body: 'Pide que cada miembro elabore un listado de tres personas a quienes, si pudieran clonarlos, llevarían a la organización a dominar el mercado. De preferencia, estos tres nombres debieran venir de adentro de la empresa. Al tener cada persona su listado de tres, pon todos los nombres en una pizarra para que todos puedan verlos.',
  },
  {
    step: 'PASO 2',
    body: 'Repasa los nombres y haz un listado de las características que esas personas representan. ¿Qué cualidades ejemplifican? ¿Qué hacen que los pone en la lista? Empieza con un listado largo para que puedas ver todas las posibilidades. Para ayudarte en tu proceso, aquí hay un listado de valores medulares de la vida real:',
    examples: [
      'Excelencia inequívoca', 'Continuamente busca la perfección', 'Gana', 'Hace lo correcto',
      'Compasión', 'Honestidad e integridad', 'Anhela el éxito',
      'Es entusiasta, energético, tenaz y competitivo', 'Fomenta la habilidad y creatividad individual',
      'Rinde cuentas', 'Atiende a clientes por sobre todas las cosas', 'Trabaja arduamente',
      'Nunca está satisfecho', 'Se interesa constantemente en su crecimiento personal',
      'Ayuda primero', 'Exhibe profesionalismo', 'Promueve la iniciativa individual',
      'Orientado al crecimiento', 'Trata a todos con respeto',
      'Da oportunidades en base al mérito; nadie tiene derecho a nada',
      'Tiene creatividad, sueños e imaginación', 'Tiene integridad personal', 'No es cínico',
      'Exhibe modestia y humildad junto con confianza',
      'Practica atención fanática a la consistencia y detalle', 'Está comprometido',
      'Entiende el valor de la reputación', 'Es alegre', 'Es justo', 'Promueve el trabajo en equipo',
    ],
  },
  {
    step: 'PASO 3',
    body: 'Los valores medulares de tu empresa están en alguna parte de ese largo listado que acabas de crear. Ahora, redúcelo. En tu primera edición, circula cuales son realmente importantes, y tacha aquellos que no lo son, y combina aquellos que son similares. Recuerda, la regla es tener entre tres y siete; después de la primera ronda, deberías haber bajado esa lista a manera de tener entre cinco y 15.',
  },
  {
    step: 'PASO 4',
    body: 'Aquí es cuando tendrás que tomar algunas decisiones difíciles. A través de discusión de grupo y debate, decide qué valores realmente pertenecen y son realmente medulares. Recuerda, tu meta es bajarlos a un número entre tres y siete.',
  },
]

function CoreValuesHelp() {
  return (
    <div className="space-y-6">
      {CORE_VALUES_STEPS.map(({ step, body, examples }) => (
        <div key={step}>
          <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-1">{step}</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{body}</p>
          {examples && (
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {examples.map(ex => (
                <li key={ex} className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1">
                  <span className="text-primary-400 mt-0.5 shrink-0">•</span> {ex}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Contenido de ayuda: Enfoque Medular ─────────────────────────────────────

function EnfoqueMedularHelp() {
  return (
    <div className="space-y-6">

      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
        El <strong className="text-gray-900 dark:text-white">Enfoque Medular</strong> es el punto dulce de tu organización: la intersección entre lo que te apasiona y lo que hacés mejor que nadie. Se compone de dos elementos: el <em>Propósito</em> y el <em>Nicho</em>.
      </p>

      {/* Propósito */}
      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">
          Propósito / Causa / Pasión
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
          Es la razón profunda por la que existe tu empresa, más allá de ganar dinero. Un propósito genuino inspira al equipo, orienta las decisiones difíciles y nunca caduca. Debe poder responderse en una oración.
        </p>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Preguntas para descubrirlo</p>
          <ul className="space-y-1">
            {[
              '¿Por qué hacemos lo que hacemos?',
              '¿Qué cambiaría en el mundo si dejáramos de existir?',
              '¿Qué queremos lograr para nuestros clientes más allá del servicio puntual?',
              '¿Qué causa o valor nos da energía cada mañana?',
            ].map(q => (
              <li key={q} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                <span className="text-primary-400 shrink-0 mt-0.5">→</span> {q}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3 space-y-1">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Ejemplos</p>
          {[
            '"Mejorar la vida de las personas a través del diseño."',
            '"Democratizar el acceso a la tecnología para las PyMEs."',
            '"Ayudar a los emprendedores a alcanzar su máximo potencial."',
          ].map(ex => (
            <p key={ex} className="text-xs text-gray-500 dark:text-gray-400 italic pl-2 border-l-2 border-gray-200 dark:border-gray-600">{ex}</p>
          ))}
        </div>
      </div>

      {/* Nicho */}
      <div>
        <p className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider mb-2">
          Nicho
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
          El nicho define <em>qué hacés</em> y <em>para quién</em>. Es el área donde tu organización es única o la mejor. Cuanto más específico, más fácil es tomar decisiones: qué proyectos aceptar, qué clientes buscar, qué rechazar.
        </p>
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Preguntas para descubrirlo</p>
          <ul className="space-y-1">
            {[
              '¿Quién es tu cliente ideal? (industria, tamaño, ubicación, perfil)',
              '¿Qué problema específico resolvés mejor que cualquier competidor?',
              '¿Qué trabajo solo vos podés hacer de esa manera particular?',
              '¿Cuándo sentís que estás en tu mejor versión como empresa?',
            ].map(q => (
              <li key={q} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                <span className="text-primary-400 shrink-0 mt-0.5">→</span> {q}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3 space-y-1">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Ejemplos</p>
          {[
            '"Agencia de marketing digital para e-commerce de moda en LATAM."',
            '"Consultoría de procesos para PyMEs industriales argentinas."',
            '"Desarrollo de software a medida para startups en etapa de crecimiento."',
          ].map(ex => (
            <p key={ex} className="text-xs text-gray-500 dark:text-gray-400 italic pl-2 border-l-2 border-gray-200 dark:border-gray-600">{ex}</p>
          ))}
        </div>
      </div>

    </div>
  )
}

// ─── Sección: Valores Medulares ───────────────────────────────────────────────

function CoreValuesSection({ values, onChange }) {
  const [draft, setDraft]     = useState('')
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')
  const inputRef              = useRef(null)

  const canAdd = values.length < 7 && draft.trim().length > 0

  function handleAdd() {
    if (!canAdd) return
    onChange([...values, draft.trim()])
    setDraft('')
    inputRef.current?.focus()
  }

  function handleRemove(idx) { onChange(values.filter((_, i) => i !== idx)) }

  function startEdit(idx)    { setEditing(idx); setEditVal(values[idx]) }

  function commitEdit(idx) {
    if (!editVal.trim()) { setEditing(null); return }
    const next = [...values]; next[idx] = editVal.trim()
    onChange(next); setEditing(null)
  }

  const countColor =
    values.length < 3  ? 'text-amber-500' :
    values.length <= 7 ? 'text-green-500' : 'text-red-500'

  return (
    <div className="space-y-3">
      {values.length > 0 ? (
        <ul className="space-y-2">
          {values.map((v, i) => (
            <li key={i} className="flex items-center gap-2 group">
              <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs flex items-center justify-center font-semibold shrink-0">
                {i + 1}
              </span>
              {editing === i ? (
                <input
                  autoFocus
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(i); if (e.key === 'Escape') setEditing(null) }}
                  onBlur={() => commitEdit(i)}
                  className="flex-1 px-2 py-1 text-sm border border-primary-400 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              ) : (
                <span
                  className="flex-1 text-sm text-gray-800 dark:text-gray-200 cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  onDoubleClick={() => startEdit(i)}
                  title="Doble clic para editar"
                >
                  {v}
                </span>
              )}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {editing !== i && (
                  <button onClick={() => startEdit(i)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs" title="Editar">✏️</button>
                )}
                <button onClick={() => handleRemove(i)} className="p-1 text-gray-400 hover:text-red-500 text-xs" title="Eliminar">✕</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
          Todavía no hay valores definidos. Agregá entre 3 y 7.
        </p>
      )}

      <p className={`text-xs font-medium ${countColor}`}>
        {values.length} / 7 valores
        {values.length > 0 && values.length < 3 && ' · necesitás al menos 3'}
        {values.length === 7 && ' · máximo alcanzado'}
      </p>

      {values.length < 7 && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
            placeholder="Escribí un valor y presioná Enter…"
            maxLength={80}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Agregar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Hook: campo de texto con auto-save ───────────────────────────────────────

function useDebouncedField(initial, fieldKey, onSave) {
  const [value, setValue]   = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const timer = useRef(null)

  // Sincroniza cuando llega el valor inicial desde la API
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
      } finally {
        setSaving(false)
      }
    }, 800)
  }

  return { value, handleChange, saving, saved }
}

// ─── VisionTab ────────────────────────────────────────────────────────────────

export default function VisionTab() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [showHelp, setShowHelp] = useState(null) // 'coreValues' | 'enfoque' | null

  // --- estados para coreValues (tienen su propio debounce dentro de CoreValuesSection)
  const [coreValues,    setCoreValues]    = useState([])
  const [savingValues,  setSavingValues]  = useState(false)
  const [savedValues,   setSavedValues]   = useState(false)
  const valuesTimer = useRef(null)

  // Carga inicial
  useEffect(() => {
    api.get('/eos')
      .then(res => {
        setData(res.data)
        setCoreValues(res.data.coreValues || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Save helper genérico
  async function saveFields(fields) {
    const res = await api.patch('/eos', fields)
    setData(prev => ({ ...prev, ...res.data }))
    return res.data
  }

  // Auto-save coreValues
  function handleValuesChange(next) {
    setCoreValues(next)
    setSavedValues(false)
    clearTimeout(valuesTimer.current)
    valuesTimer.current = setTimeout(async () => {
      setSavingValues(true)
      try {
        await saveFields({ coreValues: next })
        setSavedValues(true)
        setTimeout(() => setSavedValues(false), 2500)
      } finally {
        setSavingValues(false)
      }
    }, 800)
  }

  // Campos de texto con auto-save
  const purpose = useDebouncedField(data?.purpose ?? '', 'purpose', saveFields)
  const niche   = useDebouncedField(data?.niche   ?? '', 'niche',   saveFields)

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ── Valores Medulares ── */}
      <SectionCard
        title="Valores Medulares"
        desc="Los principios rectores vitales y trascendentes que definen la cultura y quiénes son como personas."
        saving={savingValues}
        saved={savedValues}
        onHelp={() => setShowHelp('coreValues')}
      >
        <CoreValuesSection values={coreValues} onChange={handleValuesChange} />
      </SectionCard>

      {/* ── Enfoque Medular ── */}
      <SectionCard
        title="Enfoque Medular"
        desc="El punto dulce de tu organización: la intersección entre lo que te apasiona y lo que hacés mejor que nadie."
        saving={purpose.saving || niche.saving}
        saved={purpose.saved  || niche.saved}
        onHelp={() => setShowHelp('enfoque')}
      >
        <div className="space-y-5">
          {/* Propósito */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Propósito / Causa / Pasión
            </label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              ¿Cuál es el propósito, causa o pasión de tu organización?
            </p>
            <textarea
              value={purpose.value}
              onChange={e => purpose.handleChange(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ej: Ayudar a las empresas a alcanzar su máximo potencial a través de la tecnología."
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          {/* Nicho */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nicho
            </label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              ¿Cuál es el nicho de tu organización?
            </p>
            <textarea
              value={niche.value}
              onChange={e => niche.handleChange(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ej: Agencia de marketing digital para e-commerce de moda en LATAM."
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>
        </div>
      </SectionCard>

      {/* ── Otras secciones (próximamente) ── */}
      {[
        { title: 'Visión a 10 años (BHAG)', desc: 'El gran objetivo audaz y difuso que guía el rumbo a largo plazo.' },
        { title: 'Estrategia de Marketing', desc: 'Cliente ideal, propuesta de valor única y garantías.' },
        { title: 'Imagen a 3 años',         desc: '¿Cómo se ve la empresa en 3 años? Ingresos, rentabilidad, headcount y logros.' },
        { title: 'Plan a 1 año',            desc: 'Objetivos concretos y medibles para los próximos 12 meses.' },
      ].map(({ title, desc }) => (
        <div key={title} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 opacity-60">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-0.5">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{desc}</p>
          <span className="inline-block px-3 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 rounded-full">
            Próximamente
          </span>
        </div>
      ))}

      {/* ── Modales de ayuda ── */}
      {showHelp === 'coreValues' && (
        <HelpModal title="¿Cómo definir los Valores Medulares?" onClose={() => setShowHelp(null)}>
          <CoreValuesHelp />
        </HelpModal>
      )}
      {showHelp === 'enfoque' && (
        <HelpModal title="¿Cómo definir el Enfoque Medular?" onClose={() => setShowHelp(null)}>
          <EnfoqueMedularHelp />
        </HelpModal>
      )}
    </div>
  )
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

function SectionCard({ title, desc, saving, saved, onHelp, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {saving  && <span className="text-xs text-gray-400">Guardando…</span>}
          {!saving && saved && <span className="text-xs text-green-500">✓ Guardado</span>}
          <button onClick={onHelp} className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">
            ? Ayuda
          </button>
        </div>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 mt-4 pt-4">
        {children}
      </div>
    </div>
  )
}
