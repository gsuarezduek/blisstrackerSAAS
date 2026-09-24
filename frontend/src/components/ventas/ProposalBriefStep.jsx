const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const sectionTitle = 'text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2'

// Estado inicial de las respuestas: la opción que la IA recomienda ya viene marcada, para que
// el usuario solo tenga que confirmar o cambiar.
export function initialBriefState(brief) {
  return {
    answers: Object.fromEntries(brief.questions.map(q => [q.id, { selected: [...(q.recommended || [])], text: '' }])),
    sections: Object.fromEntries(brief.sections.map(s => [s.key, s.include])),
    extra: '',
  }
}

// Arma el `briefing` que se manda a la generación. Solo viajan las respuestas con contenido;
// `includeSections` solo lleva las que el usuario prendió contra la recomendación de la IA (si
// no, forzaríamos secciones que la IA descartó justo por falta de contexto).
export function buildBriefing(brief, state) {
  const answers = brief.questions.map(q => {
    const a = state.answers[q.id] || { selected: [], text: '' }
    return { question: q.question, answer: [a.selected.join(' / '), a.text.trim()].filter(Boolean).join(' — ') }
  }).filter(a => a.answer)
  if (state.extra.trim()) answers.push({ question: 'Información adicional del ejecutivo comercial', answer: state.extra.trim() })
  return {
    answers,
    includeSections: brief.sections.filter(s => !s.include && state.sections[s.key]).map(s => s.key),
    excludeSections: brief.sections.filter(s => !state.sections[s.key]).map(s => s.key),
  }
}

// Paso intermedio: la IA muestra qué entendió, hace preguntas con opciones sugeridas, marca los
// datos que faltan y propone qué secciones incluir. El usuario confirma/ajusta.
export default function ProposalBriefStep({ brief, state, onChange }) {
  const setAnswer = (id, patch) => onChange({ ...state, answers: { ...state.answers, [id]: { ...state.answers[id], ...patch } } })

  function toggleOption(q, opt) {
    const cur = state.answers[q.id]?.selected || []
    if (q.kind === 'single') setAnswer(q.id, { selected: cur[0] === opt ? [] : [opt] })
    else setAnswer(q.id, { selected: cur.includes(opt) ? cur.filter(o => o !== opt) : [...cur, opt] })
  }

  return (
    <div className="space-y-5">
      {brief.understanding.length > 0 && (
        <div className="rounded-xl bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 p-4">
          <h3 className={sectionTitle}>Lo que entendí del caso</h3>
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-200 list-disc pl-5">
            {brief.understanding.map((u, i) => <li key={i}>{u}</li>)}
          </ul>
        </div>
      )}

      {brief.questions.length > 0 && (
        <div>
          <h3 className={sectionTitle}>Decisiones para afinar la propuesta</h3>
          <div className="space-y-4">
            {brief.questions.map((q, i) => {
              const a = state.answers[q.id] || { selected: [], text: '' }
              return (
                <div key={q.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3.5">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{i + 1}. {q.question}</p>
                  {q.why && <p className="text-[11px] text-gray-400 mt-0.5 mb-2">{q.why}</p>}
                  {q.kind !== 'text' && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {q.options.map(opt => {
                        const on = a.selected.includes(opt)
                        return (
                          <button key={opt} type="button" onClick={() => toggleOption(q, opt)}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${on ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-primary-400'}`}>
                            {opt}{q.recommended?.includes(opt) && <span className={`ml-1.5 text-[10px] ${on ? 'opacity-80' : 'text-primary-600'}`}>★ sugerida</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <input className={input} placeholder={q.kind === 'text' ? 'Tu respuesta…' : 'Otra respuesta o aclaración (opcional)'} value={a.text} onChange={e => setAnswer(q.id, { text: e.target.value })} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {brief.missing.length > 0 && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 p-4">
          <h3 className={`${sectionTitle} !text-amber-600 dark:!text-amber-400`}>Datos que no tengo (no los voy a inventar)</h3>
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-200 list-disc pl-5 mb-3">
            {brief.missing.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
          <textarea className={input} rows={2} placeholder="Si sabés alguno, escribilo acá y lo uso (ej. “Tienen 4 locales, planean abrir 2 más este año”)" value={state.extra} onChange={e => onChange({ ...state, extra: e.target.value })} />
        </div>
      )}

      <div>
        <h3 className={sectionTitle}>Secciones de la propuesta</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {brief.sections.map(s => (
            <label key={s.key} className={`flex items-start gap-2.5 rounded-xl border p-2.5 cursor-pointer ${state.sections[s.key] ? 'border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-900/10' : 'border-gray-200 dark:border-gray-700'}`}>
              <input type="checkbox" className="mt-0.5 accent-primary-600" checked={!!state.sections[s.key]} onChange={e => onChange({ ...state, sections: { ...state.sections, [s.key]: e.target.checked } })} />
              <span>
                <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{s.label}</span>
                {s.reason && <span className="block text-[11px] text-gray-400">{s.reason}</span>}
              </span>
            </label>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">Los servicios, la tabla de inversión y el cierre siempre se incluyen.</p>
      </div>
    </div>
  )
}
