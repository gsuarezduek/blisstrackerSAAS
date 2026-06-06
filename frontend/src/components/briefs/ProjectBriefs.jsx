import { useState, useEffect, useMemo } from 'react'
import api from '../../api/client'
import { BRIEFS, briefByKey, briefProgress } from './briefCatalog'

// Tarjeta de un brief en la grilla.
function BriefCard({ brief, answers, onOpen }) {
  const { answered, total } = briefProgress(brief, answers)
  const pct = total ? Math.round((answered / total) * 100) : 0
  // Se da por "completo" con 80% o más de los campos respondidos.
  const status = answered === 0 ? 'empty' : pct >= 80 ? 'done' : 'progress'

  const statusPill = {
    empty:    { cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400', label: 'Sin empezar' },
    progress: { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: 'En progreso' },
    done:     { cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', label: 'Completo' },
  }[status]

  return (
    <button
      onClick={onOpen}
      className="text-left bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-sm transition-all flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500">Brief {brief.n}</p>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">{brief.title}</h3>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusPill.cls}`}>
          {statusPill.label}
        </span>
      </div>

      {brief.badge && (
        <span className="text-[10px] w-fit px-2 py-0.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 border border-primary-100 dark:border-primary-800 font-medium">
          {brief.badge}
        </span>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug line-clamp-3">{brief.intro}</p>

      <div className="mt-auto pt-1">
        <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 mb-1">
          <span>{answered}/{total} campos</span>
          {brief.estimate && <span>⏱ {brief.estimate}</span>}
        </div>
        <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${status === 'done' ? 'bg-green-500' : 'bg-primary-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </button>
  )
}

// Editor de un brief: secciones + campos. Guarda el brief completo de una.
function BriefEditor({ projectId, brief, initialAnswers, canEdit, onBack, onSaved }) {
  const [draft, setDraft]   = useState(() => ({ ...initialAnswers }))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')

  const dirty = useMemo(() => {
    const keys = new Set([...Object.keys(draft), ...Object.keys(initialAnswers)])
    for (const k of keys) {
      if ((draft[k] ?? '').trim() !== (initialAnswers[k] ?? '').trim()) return true
    }
    return false
  }, [draft, initialAnswers])

  function setField(k, v) {
    setDraft(prev => ({ ...prev, [k]: v }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const { data } = await api.put(`/projects/${projectId}/briefs/${brief.key}`, { answers: draft })
      onSaved(brief.key, data.brief.answers || {})
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar el brief')
    } finally {
      setSaving(false)
    }
  }

  const { answered, total } = briefProgress(brief, draft)

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors mb-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Todos los briefs
          </button>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Brief {brief.n} — {brief.title}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{brief.intro}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {answered}/{total} campos completados{brief.estimate ? ` · ⏱ ${brief.estimate}` : ''}
          </p>
        </div>
      </div>

      {!canEdit && (
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-500 dark:text-gray-400">
          Solo lectura — necesitás ser parte del equipo del proyecto o admin para editar.
        </div>
      )}

      {/* Secciones */}
      {brief.sections.map(section => (
        <div key={section.title} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">{section.title}</p>
          <div className="space-y-3">
            {section.fields.map(f => (
              <div key={f.k}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.q}</label>
                {f.short ? (
                  <input
                    type="text"
                    value={draft[f.k] ?? ''}
                    onChange={e => setField(f.k, e.target.value)}
                    disabled={!canEdit}
                    className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                ) : (
                  <textarea
                    rows={2}
                    value={draft[f.k] ?? ''}
                    onChange={e => setField(f.k, e.target.value)}
                    disabled={!canEdit}
                    className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Barra de acciones (sticky) */}
      {canEdit && (
        <div className="sticky bottom-0 -mx-1 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur supports-[backdrop-filter]:bg-gray-50/70 dark:supports-[backdrop-filter]:bg-gray-900/70 py-3 flex items-center gap-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {saving ? 'Guardando…' : saved ? '✓ Guardado' : 'Guardar brief'}
          </button>
          {saved && !dirty && <span className="text-sm text-emerald-500">Los cambios se guardaron correctamente</span>}
          {dirty && !saving && <span className="text-xs text-gray-400 dark:text-gray-500">Cambios sin guardar</span>}
        </div>
      )}
    </div>
  )
}

export default function ProjectBriefs({ projectId, canEdit }) {
  const [answersByType, setAnswersByType] = useState({}) // { type: { fieldKey: value } }
  const [loading, setLoading] = useState(true)
  const [openKey, setOpenKey] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.get(`/projects/${projectId}/briefs`)
      .then(r => {
        if (!alive) return
        const map = {}
        for (const b of r.data.briefs || []) map[b.type] = b.answers || {}
        setAnswersByType(map)
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [projectId])

  function handleSaved(type, answers) {
    setAnswersByType(prev => ({ ...prev, [type]: answers }))
  }

  if (loading) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">Cargando briefs…</p>
  }

  const openBrief = openKey ? briefByKey(openKey) : null

  if (openBrief) {
    return (
      <BriefEditor
        projectId={projectId}
        brief={openBrief}
        initialAnswers={answersByType[openKey] || {}}
        canEdit={canEdit}
        onBack={() => setOpenKey(null)}
        onSaved={handleSaved}
      />
    )
  }

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Cuestionarios de relevamiento del cliente. Empezá por el <span className="font-medium text-gray-700 dark:text-gray-300">Brief de Marca</span> (documento madre);
        los demás son por servicio y se completan modularmente — no hace falta llenarlos todos.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {BRIEFS.map(brief => (
          <BriefCard
            key={brief.key}
            brief={brief}
            answers={answersByType[brief.key] || {}}
            onOpen={() => setOpenKey(brief.key)}
          />
        ))}
      </div>
    </div>
  )
}
