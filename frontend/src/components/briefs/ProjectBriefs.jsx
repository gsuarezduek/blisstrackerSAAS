import { useState, useEffect, useMemo } from 'react'
import api from '../../api/client'
import { BRIEFS, briefByKey, briefProgress, briefIsComplete } from './briefCatalog'
import { linkify } from '../../utils/linkify'

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

// Vista de lectura amigable de un brief: muestra solo las secciones/campos con respuesta.
function BriefView({ brief, answers, canEdit, onBack, onEdit }) {
  const { answered, total } = briefProgress(brief, answers)

  // Secciones que tienen al menos un campo respondido (sin huecos vacíos).
  const sections = brief.sections
    .map(section => ({
      title: section.title,
      fields: section.fields.filter(f => {
        const v = answers[f.k]
        return v != null && String(v).trim() !== ''
      }),
    }))
    .filter(section => section.fields.length > 0)

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
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{brief.title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{brief.intro}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {answered}/{total} campos completados{brief.estimate ? ` · ⏱ ${brief.estimate}` : ''}
          </p>
        </div>

        {canEdit && (
          <button
            onClick={onEdit}
            className="flex-shrink-0 flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
            </svg>
            Editar
          </button>
        )}
      </div>

      {/* Secciones (solo las que tienen contenido) */}
      {sections.map(section => (
        <div key={section.title} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">{section.title}</p>
          <div className="space-y-4">
            {section.fields.map(f => (
              <div key={f.k}>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.q}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words leading-relaxed">
                  {linkify(answers[f.k])}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Editor de un brief: secciones + campos. Guarda el brief completo de una.
function BriefEditor({ projectId, brief, initialAnswers, canEdit, onBack, onSaved, onDeleted }) {
  const [draft, setDraft]   = useState(() => ({ ...initialAnswers }))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  async function handleDelete() {
    setDeleting(true)
    setError('')
    try {
      await api.delete(`/projects/${projectId}/briefs/${brief.key}`)
      onDeleted(brief.key)
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo eliminar el brief')
      setDeleting(false)
      setConfirmDelete(false)
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
            {brief.title}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{brief.intro}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {answered}/{total} campos completados{brief.estimate ? ` · ⏱ ${brief.estimate}` : ''}
          </p>
        </div>

        {canEdit && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex-shrink-0 flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
            </svg>
            Eliminar
          </button>
        )}
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
                    rows={f.big ? 10 : 2}
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

      {/* Confirmación de eliminación */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => !deleting && setConfirmDelete(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl w-full max-w-md p-5"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 dark:text-white">¿Eliminar el {brief.title}?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Se borrarán todas las respuestas cargadas de este brief. Esta acción no se puede deshacer.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {deleting ? 'Eliminando…' : 'Eliminar brief'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProjectBriefs({ projectId, canEdit }) {
  const [answersByType, setAnswersByType] = useState({}) // { type: { fieldKey: value } }
  const [activeKeys, setActiveKeys]   = useState([])     // briefs con fila en DB
  const [loading, setLoading] = useState(true)
  const [openKey, setOpenKey] = useState(null)
  const [mode, setMode]       = useState('view')         // 'view' (lectura amigable) | 'edit' (formulario)
  const [adding, setAdding]   = useState(false)          // menú "Agregar brief" abierto
  const [addingKey, setAddingKey] = useState(null)       // alta en curso
  const [addError, setAddError]   = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.get(`/projects/${projectId}/briefs`)
      .then(r => {
        if (!alive) return
        const map = {}
        const keys = []
        for (const b of r.data.briefs || []) { map[b.type] = b.answers || {}; keys.push(b.type) }
        setAnswersByType(map)
        setActiveKeys(keys)
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [projectId])

  function handleSaved(type, answers) {
    setAnswersByType(prev => ({ ...prev, [type]: answers }))
    setActiveKeys(prev => (prev.includes(type) ? prev : [...prev, type]))
  }

  // Al abrir un brief: si ya está completo se muestra la vista de lectura; si no, el editor.
  function handleOpen(brief) {
    const complete = briefIsComplete(brief, answersByType[brief.key] || {})
    setMode(complete ? 'view' : 'edit')
    setOpenKey(brief.key)
  }

  function handleDeleted(type) {
    setAnswersByType(prev => {
      const next = { ...prev }
      delete next[type]
      return next
    })
    setActiveKeys(prev => prev.filter(k => k !== type))
    setOpenKey(null)
  }

  // Memoria (notas libres) y Marca (documento madre) siempre visibles; el resto solo si fue agregado.
  const ALWAYS = ['memoria', 'marca']
  const activeBriefs   = BRIEFS.filter(b => ALWAYS.includes(b.key) || activeKeys.includes(b.key))
  const availableToAdd = BRIEFS.filter(b => !ALWAYS.includes(b.key) && !activeKeys.includes(b.key))

  async function handleAdd(key) {
    setAddingKey(key)
    setAddError('')
    try {
      // Crea la fila vacía para que el brief quede agregado y persista; luego lo abre.
      const { data } = await api.put(`/projects/${projectId}/briefs/${key}`, { answers: {} })
      handleSaved(key, data.brief.answers || {})
      setAdding(false)
      setMode('edit')   // brief recién agregado: arranca vacío, directo al formulario
      setOpenKey(key)
    } catch (e) {
      setAddError(e.response?.data?.error || 'No se pudo agregar el brief')
    } finally {
      setAddingKey(null)
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-10">Cargando briefs…</p>
  }

  const openBrief = openKey ? briefByKey(openKey) : null

  if (openBrief) {
    if (mode === 'view') {
      return (
        <BriefView
          brief={openBrief}
          answers={answersByType[openKey] || {}}
          canEdit={canEdit}
          onBack={() => setOpenKey(null)}
          onEdit={() => setMode('edit')}
        />
      )
    }
    return (
      <BriefEditor
        projectId={projectId}
        brief={openBrief}
        initialAnswers={answersByType[openKey] || {}}
        canEdit={canEdit}
        // Si el brief tiene contenido, "volver" lleva a la vista de lectura; si está vacío, a la grilla.
        onBack={() =>
          briefIsComplete(openBrief, answersByType[openKey] || {})
            ? setMode('view')
            : setOpenKey(null)
        }
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Cuestionarios de relevamiento del cliente. Empezá por el <span className="font-medium text-gray-700 dark:text-gray-300">Brief de Marca</span> (documento madre);
          sumá los demás <span className="font-medium text-gray-700 dark:text-gray-300">a medida que los necesites</span> — no hace falta tenerlos todos.
        </p>

        {canEdit && availableToAdd.length > 0 && (
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setAdding(o => !o)}
              className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors whitespace-nowrap"
            >
              + Agregar brief
            </button>
            {adding && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAdding(false)} />
                <div className="absolute right-0 mt-2 w-64 z-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg py-1">
                  {availableToAdd.map(b => (
                    <button
                      key={b.key}
                      onClick={() => handleAdd(b.key)}
                      disabled={addingKey === b.key}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 disabled:opacity-60 transition-colors"
                    >
                      {addingKey === b.key ? 'Agregando…' : b.title}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {addError && <p className="text-sm text-red-500 mb-3">{addError}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {activeBriefs.map(brief => (
          <BriefCard
            key={brief.key}
            brief={brief}
            answers={answersByType[brief.key] || {}}
            onOpen={() => handleOpen(brief)}
          />
        ))}
      </div>
    </div>
  )
}
