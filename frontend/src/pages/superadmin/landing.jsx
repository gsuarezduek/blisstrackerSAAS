import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../api/client'

const API_URL = import.meta.env.VITE_API_URL || ''
const trustedLogoUrl = (id) => `${API_URL}/api/landing/trusted-companies/${id}/image`
const testimonialPhotoUrl = (id) => `${API_URL}/api/landing/testimonials/${id}/image`

const inputCls = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const reorderBtnCls = 'p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-500 text-xs'

// ─── Hero + video ─────────────────────────────────────────────────────────────

// Lista de palabras que rotan con efecto typewriter en la 2ª línea del hero
// ("de tu " + palabra + "."). Mismo patrón de chips que WordChipsInput (bot de
// WhatsApp): texto libre + Enter/botón agrega, click en la × saca; acá además
// se puede reordenar (el orden es el orden en que se van tipeando).
function AccentWordsEditor({ words, onChange }) {
  const [draft, setDraft] = useState('')

  function add() {
    const w = draft.trim()
    if (!w || words.includes(w)) { setDraft(''); return }
    onChange([...words, w])
    setDraft('')
  }
  function remove(idx) {
    onChange(words.filter((_, i) => i !== idx))
  }
  function move(idx, dir) {
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= words.length) return
    const next = [...words]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    onChange(next)
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">
        Se muestran como <strong>"de tu {'{palabra}'}."</strong> — "de tu" y el punto final quedan fijos, solo la
        palabra se anima con efecto máquina de escribir. Necesita al menos una.
      </p>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="ej: agencia"
          className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button type="button" onClick={add} className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg">
          Agregar
        </button>
      </div>
      {words.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {words.map((w, i) => (
            <div key={`${w}-${i}`} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-1.5">
              <span className="flex-1 text-sm text-gray-800 dark:text-gray-100">{w}</span>
              <button type="button" onClick={() => move(i, 'up')} disabled={i === 0} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 text-gray-500 text-xs">↑</button>
              <button type="button" onClick={() => move(i, 'down')} disabled={i === words.length - 1} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 text-gray-500 text-xs">↓</button>
              <button type="button" onClick={() => remove(i)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-xs px-1">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const HERO_FIELDS = ['heroBadge', 'heroTitle', 'heroTitleAccentWords', 'heroSubtitle', 'demoVideoUrl']

function HeroEditor() {
  const { form, loading, saving, saved, error, set, handleSave } = useLandingContentForm(HERO_FIELDS)

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!form) return <p className="text-sm text-red-500">{error}</p>

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
          Badge (arriba del título)
        </label>
        <input
          type="text"
          value={form.heroBadge}
          onChange={e => set('heroBadge', e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
          Título — línea 1
        </label>
        <input
          type="text"
          value={form.heroTitle}
          onChange={e => set('heroTitle', e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
          Título — línea 2 (coloreada, rota con efecto typewriter)
        </label>
        <AccentWordsEditor
          words={form.heroTitleAccentWords ?? []}
          onChange={words => set('heroTitleAccentWords', words)}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
          Subtítulo
        </label>
        <textarea
          value={form.heroSubtitle}
          onChange={e => set('heroSubtitle', e.target.value)}
          rows={3}
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y leading-relaxed"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
          Video de demo — URL de embed
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Tiene que ser el link de <strong>embed</strong>, no el de compartir normal. En Loom: botón Share →
          Embed → copiar la URL del <code>src</code> del iframe (algo como <code>https://www.loom.com/embed/xxxxx</code>).
          En YouTube: botón Compartir → Insertar → copiar la URL del <code>src</code> (<code>https://www.youtube.com/embed/xxxxx</code>).
          Vacío = se muestra el mockup de la app en su lugar.
        </p>
        <input
          type="text"
          value={form.demoVideoUrl ?? ''}
          onChange={e => set('demoVideoUrl', e.target.value)}
          placeholder="https://www.loom.com/embed/..."
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </div>
  )
}

// ─── Secciones intermedias (Problem/Solution/Features/Cómo funciona/Benefits) ─

// Editor genérico de listas de "tarjetas" homogéneas (mismos campos en cada
// item, ej. { icon, title, desc }). Reusado por problemCards/featureCards/
// steps/benefitCards — cada uno solo cambia qué campos tiene la tarjeta.
function CardListEditor({ items, onChange, fields, addLabel = '+ Agregar' }) {
  const emptyItem = () => Object.fromEntries(fields.map(f => [f.key, '']))
  const [draft, setDraft] = useState(emptyItem())

  function add() {
    if (fields.some(f => !draft[f.key]?.trim())) return
    onChange([...items, draft])
    setDraft(emptyItem())
  }
  function remove(idx) { onChange(items.filter((_, i) => i !== idx)) }
  function move(idx, dir) {
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= items.length) return
    const next = [...items]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    onChange(next)
  }
  function updateItem(idx, key, value) {
    onChange(items.map((it, i) => i === idx ? { ...it, [key]: value } : it))
  }

  function renderFields(item, onFieldChange) {
    const singleLine = fields.filter(f => !f.multiline)
    const multiline  = fields.filter(f => f.multiline)
    return (
      <>
        <div className="flex flex-wrap gap-2">
          {singleLine.map(f => (
            <input
              key={f.key}
              value={item[f.key] ?? ''}
              onChange={e => onFieldChange(f.key, e.target.value)}
              placeholder={f.label}
              className={`${inputCls} ${f.narrow ? 'w-16 text-center flex-none' : 'flex-1 min-w-[160px]'}`}
            />
          ))}
        </div>
        {multiline.map(f => (
          <textarea
            key={f.key}
            value={item[f.key] ?? ''}
            onChange={e => onFieldChange(f.key, e.target.value)}
            placeholder={f.label}
            rows={2}
            className={`${inputCls} resize-y`}
          />
        ))}
      </>
    )
  }

  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1 space-y-1.5 border border-gray-200 dark:border-gray-600 rounded-xl p-2.5">
            {renderFields(item, (key, value) => updateItem(i, key, value))}
          </div>
          <div className="flex flex-col gap-0.5 pt-0.5">
            <button type="button" onClick={() => move(i, 'up')} disabled={i === 0} className={reorderBtnCls}>↑</button>
            <button type="button" onClick={() => move(i, 'down')} disabled={i === items.length - 1} className={reorderBtnCls}>↓</button>
            <button type="button" onClick={() => remove(i)} className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-xs">✕</button>
          </div>
        </div>
      ))}

      <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-2.5 space-y-1.5">
        {renderFields(draft, (key, value) => setDraft(d => ({ ...d, [key]: value })))}
        <button type="button" onClick={add} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">{addLabel}</button>
      </div>
    </div>
  )
}

function SectionField({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  )
}

// Hook chico compartido por los editores que viven en LandingContent pero solo
// guardan un subconjunto de campos (Secciones, FAQ) — evita repetir el mismo
// load/save/estado en cada uno.
function useLandingContentForm(fields) {
  const [form,    setForm]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    api.get('/superadmin/landing/content')
      .then(r => setForm(r.data))
      .catch(() => setError('No se pudo cargar el contenido'))
      .finally(() => setLoading(false))
  }, [])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const body = Object.fromEntries(fields.map(f => [f, form[f]]))
      const { data } = await api.put('/superadmin/landing/content', body)
      setForm(f => ({ ...f, ...data }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return { form, loading, saving, saved, error, set, handleSave }
}

function SaveBar({ saving, saved, onSave, error }) {
  return (
    <>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        {saved && <span className="text-sm text-emerald-500">✓ Guardado</span>}
      </div>
    </>
  )
}

const SECTIONS_FIELDS = [
  'problemTitle', 'problemSubtitle', 'problemCards',
  'solutionTitle', 'solutionParagraph1', 'solutionParagraph2',
  'featuresTitle', 'featureCards',
  'stepsTitle', 'steps',
  'benefitsTitle', 'benefitsSubtitle', 'benefitCards',
]

function SectionsEditor() {
  const { form, loading, saving, saved, error, set, handleSave } = useLandingContentForm(SECTIONS_FIELDS)

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!form) return <p className="text-sm text-red-500">{error}</p>

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-6">
      {/* Problem */}
      <div className="space-y-3">
        <p className="text-sm font-bold text-gray-900 dark:text-white">Problema ("Tu agencia merece dejar de hacer esto.")</p>
        <SectionField label="Título">
          <input value={form.problemTitle} onChange={e => set('problemTitle', e.target.value)} className={inputCls} />
        </SectionField>
        <SectionField label="Subtítulo">
          <input value={form.problemSubtitle} onChange={e => set('problemSubtitle', e.target.value)} className={inputCls} />
        </SectionField>
        <SectionField label="Tarjetas de dolor (emoji + título + descripción)">
          <CardListEditor
            items={form.problemCards}
            onChange={v => set('problemCards', v)}
            fields={[{ key: 'emoji', label: '🪟', narrow: true }, { key: 'title', label: 'Título' }, { key: 'desc', label: 'Descripción', multiline: true }]}
          />
        </SectionField>
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      {/* Solution */}
      <div className="space-y-3">
        <p className="text-sm font-bold text-gray-900 dark:text-white">Solución ("No es otro gestor de tareas.")</p>
        <SectionField label="Título">
          <input value={form.solutionTitle} onChange={e => set('solutionTitle', e.target.value)} className={inputCls} />
        </SectionField>
        <SectionField label="Párrafo 1">
          <textarea value={form.solutionParagraph1} onChange={e => set('solutionParagraph1', e.target.value)} rows={2} className={`${inputCls} resize-y`} />
        </SectionField>
        <SectionField label="Párrafo 2">
          <textarea value={form.solutionParagraph2} onChange={e => set('solutionParagraph2', e.target.value)} rows={2} className={`${inputCls} resize-y`} />
        </SectionField>
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      {/* Features */}
      <div className="space-y-3">
        <p className="text-sm font-bold text-gray-900 dark:text-white">Funcionalidades</p>
        <SectionField label="Título (usá un salto de línea para partir el <h2> en dos)">
          <textarea value={form.featuresTitle} onChange={e => set('featuresTitle', e.target.value)} rows={2} className={`${inputCls} resize-y`} />
        </SectionField>
        <SectionField label="Tarjetas de funcionalidades (icono + título + descripción)">
          <CardListEditor
            items={form.featureCards}
            onChange={v => set('featureCards', v)}
            fields={[{ key: 'icon', label: '🎯', narrow: true }, { key: 'title', label: 'Título' }, { key: 'desc', label: 'Descripción', multiline: true }]}
          />
        </SectionField>
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      {/* Steps */}
      <div className="space-y-3">
        <p className="text-sm font-bold text-gray-900 dark:text-white">Cómo funciona</p>
        <SectionField label="Título">
          <input value={form.stepsTitle} onChange={e => set('stepsTitle', e.target.value)} className={inputCls} />
        </SectionField>
        <SectionField label="Pasos (el número 01/02/03… se calcula solo por la posición)">
          <CardListEditor
            items={form.steps}
            onChange={v => set('steps', v)}
            fields={[{ key: 'title', label: 'Título' }, { key: 'desc', label: 'Descripción', multiline: true }]}
          />
        </SectionField>
      </div>

      <hr className="border-gray-100 dark:border-gray-700" />

      {/* Benefits */}
      <div className="space-y-3">
        <p className="text-sm font-bold text-gray-900 dark:text-white">Beneficios (banda naranja)</p>
        <SectionField label="Título">
          <input value={form.benefitsTitle} onChange={e => set('benefitsTitle', e.target.value)} className={inputCls} />
        </SectionField>
        <SectionField label="Subtítulo">
          <input value={form.benefitsSubtitle} onChange={e => set('benefitsSubtitle', e.target.value)} className={inputCls} />
        </SectionField>
        <SectionField label="Tarjetas (label + descripción)">
          <CardListEditor
            items={form.benefitCards}
            onChange={v => set('benefitCards', v)}
            fields={[{ key: 'label', label: 'Label' }, { key: 'desc', label: 'Descripción', multiline: true }]}
          />
        </SectionField>
      </div>

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </div>
  )
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

// Grupos de preguntas (ej. "Producto", "Pricing y trial"). Cada grupo se puede
// reordenar; las preguntas dentro de un grupo solo se agregan/quitan (se
// reordenan borrando y re-agregando, alcanza para el volumen típico de FAQ).
function FaqEditor({ groups, onChange }) {
  function addGroup() { onChange([...groups, { group: 'Nuevo grupo', items: [] }]) }
  function removeGroup(gi) { onChange(groups.filter((_, i) => i !== gi)) }
  function moveGroup(gi, dir) {
    const swap = dir === 'up' ? gi - 1 : gi + 1
    if (swap < 0 || swap >= groups.length) return
    const next = [...groups]
    ;[next[gi], next[swap]] = [next[swap], next[gi]]
    onChange(next)
  }
  function setGroupName(gi, name) {
    onChange(groups.map((g, i) => i === gi ? { ...g, group: name } : g))
  }
  function addItem(gi) {
    onChange(groups.map((g, i) => i === gi ? { ...g, items: [...g.items, { q: '', a: '' }] } : g))
  }
  function removeItem(gi, ii) {
    onChange(groups.map((g, i) => i === gi ? { ...g, items: g.items.filter((_, j) => j !== ii) } : g))
  }
  function setItem(gi, ii, key, value) {
    onChange(groups.map((g, i) => i === gi
      ? { ...g, items: g.items.map((it, j) => j === ii ? { ...it, [key]: value } : it) }
      : g))
  }

  return (
    <div className="space-y-4">
      {groups.map((g, gi) => (
        <div key={gi} className="border border-gray-200 dark:border-gray-600 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <input value={g.group} onChange={e => setGroupName(gi, e.target.value)} className={`${inputCls} font-semibold flex-1`} />
            <button type="button" onClick={() => moveGroup(gi, 'up')} disabled={gi === 0} className={reorderBtnCls}>↑</button>
            <button type="button" onClick={() => moveGroup(gi, 'down')} disabled={gi === groups.length - 1} className={reorderBtnCls}>↓</button>
            <button type="button" onClick={() => removeGroup(gi)} className="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 px-1">✕ grupo</button>
          </div>

          <div className="space-y-2 pl-1">
            {g.items.map((item, ii) => (
              <div key={ii} className="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input value={item.q} onChange={e => setItem(gi, ii, 'q', e.target.value)} placeholder="Pregunta" className={`${inputCls} flex-1`} />
                  <button type="button" onClick={() => removeItem(gi, ii)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 text-xs px-1">✕</button>
                </div>
                <textarea value={item.a} onChange={e => setItem(gi, ii, 'a', e.target.value)} placeholder="Respuesta" rows={2} className={`${inputCls} resize-y`} />
              </div>
            ))}
            <button type="button" onClick={() => addItem(gi)} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ Agregar pregunta</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={addGroup} className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">+ Agregar grupo</button>
    </div>
  )
}

function FaqSectionEditor() {
  const { form, loading, saving, saved, error, set, handleSave } = useLandingContentForm(['faqGroups'])

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!form) return <p className="text-sm text-red-500">{error}</p>

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <FaqEditor groups={form.faqGroups} onChange={v => set('faqGroups', v)} />
      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </div>
  )
}

// ─── Testimonios ──────────────────────────────────────────────────────────────

function TestimonialsEditor() {
  const [items,    setItems]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [creating, setCreating] = useState(false)
  const [draft,    setDraft]    = useState({ name: '', role: '', company: '', quote: '', metric: '' })
  const [draftFile, setDraftFile] = useState(null)
  const [editId,   setEditId]   = useState(null)
  const [editDraft, setEditDraft] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const fileRef = useRef()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/superadmin/landing/testimonials')
      setItems(data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!draft.name.trim() || !draft.quote.trim()) return
    setCreating(true)
    try {
      const form = new FormData()
      Object.entries(draft).forEach(([k, v]) => { if (v.trim()) form.append(k, v.trim()) })
      if (draftFile) form.append('image', draftFile)
      await api.post('/superadmin/landing/testimonials', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setDraft({ name: '', role: '', company: '', quote: '', metric: '' })
      setDraftFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al crear el testimonio')
    } finally { setCreating(false) }
  }

  async function saveEdit(id) {
    try {
      const { data } = await api.patch(`/superadmin/landing/testimonials/${id}`, editDraft)
      setItems(prev => prev.map(t => t.id === id ? { ...t, ...data } : t))
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al guardar')
    } finally { setEditId(null) }
  }

  async function handleToggle(id) {
    try {
      const { data } = await api.patch(`/superadmin/landing/testimonials/${id}/toggle`)
      setItems(prev => prev.map(t => t.id === id ? { ...t, active: data.active } : t))
    } catch {}
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/superadmin/landing/testimonials/${id}`)
      setItems(prev => prev.filter(t => t.id !== id))
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al eliminar')
    } finally { setDeleteId(null) }
  }

  async function move(id, direction) {
    const idx = items.findIndex(t => t.id === id)
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= items.length) return
    const reordered = [...items]
    ;[reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]]
    const body = reordered.map((t, i) => ({ id: t.id, order: i + 1 }))
    setItems(reordered.map((t, i) => ({ ...t, order: i + 1 })))
    api.patch('/superadmin/landing/testimonials/reorder', { items: body }).catch(() => load())
  }

  const active   = items.filter(t => t.active)
  const inactive = items.filter(t => !t.active)

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Sin testimonios activos, la sección directamente no se muestra en la landing (mejor eso que testimonios de relleno).
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
        {active.map((t, idx) => (
          <div key={t.id} className="p-4">
            {editId === t.id ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <input value={editDraft.name} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} placeholder="Nombre" className={`${inputCls} flex-1 min-w-[140px]`} />
                  <input value={editDraft.role} onChange={e => setEditDraft(d => ({ ...d, role: e.target.value }))} placeholder="Rol" className={`${inputCls} flex-1 min-w-[140px]`} />
                  <input value={editDraft.company} onChange={e => setEditDraft(d => ({ ...d, company: e.target.value }))} placeholder="Empresa" className={`${inputCls} flex-1 min-w-[140px]`} />
                </div>
                <textarea value={editDraft.quote} onChange={e => setEditDraft(d => ({ ...d, quote: e.target.value }))} placeholder="Testimonio" rows={3} className={`${inputCls} resize-y`} />
                <input value={editDraft.metric ?? ''} onChange={e => setEditDraft(d => ({ ...d, metric: e.target.value }))} placeholder="Métrica (opcional, ej: −60% reuniones de status)" className={inputCls} />
                <div className="flex gap-3">
                  <button onClick={() => saveEdit(t.id)} className="text-xs text-primary-600 font-medium hover:underline">Guardar</button>
                  <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:underline">Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                {t.hasPhoto ? (
                  <img src={testimonialPhotoUrl(t.id)} alt={t.name} className="w-11 h-11 rounded-full object-cover flex-shrink-0 bg-gray-100 dark:bg-gray-700" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary-300 to-primary-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {t.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{t.role}{t.company && ` · ${t.company}`}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1.5 leading-relaxed">“{t.quote}”</p>
                  {t.metric && <p className="text-xs text-primary-600 dark:text-primary-400 font-semibold mt-1">{t.metric}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { setEditId(t.id); setEditDraft({ name: t.name, role: t.role, company: t.company, quote: t.quote, metric: t.metric ?? '' }) }}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-1.5">Editar</button>
                  <button onClick={() => move(t.id, 'up')} disabled={idx === 0} className={reorderBtnCls}>↑</button>
                  <button onClick={() => move(t.id, 'down')} disabled={idx === active.length - 1} className={reorderBtnCls}>↓</button>
                  <button onClick={() => handleToggle(t.id)} className="p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 text-xs px-1.5">Ocultar</button>
                  <button onClick={() => setDeleteId(t.id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 text-xs px-1.5">Eliminar</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {active.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">Sin testimonios activos</div>
        )}
      </div>

      {inactive.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {inactive.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 opacity-50">
              <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{t.name} — {t.quote}</span>
              <button onClick={() => handleToggle(t.id)} className="text-xs text-primary-600 hover:underline font-medium flex-shrink-0">Reactivar</button>
              <button onClick={() => setDeleteId(t.id)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">Eliminar</button>
            </div>
          ))}
        </div>
      )}

      {/* Nuevo testimonio */}
      <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-4 space-y-2">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">+ Nuevo testimonio</p>
        <div className="flex flex-wrap gap-2">
          <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Nombre" className={`${inputCls} flex-1 min-w-[140px]`} />
          <input value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value }))} placeholder="Rol (ej: Founder)" className={`${inputCls} flex-1 min-w-[140px]`} />
          <input value={draft.company} onChange={e => setDraft(d => ({ ...d, company: e.target.value }))} placeholder="Empresa" className={`${inputCls} flex-1 min-w-[140px]`} />
        </div>
        <textarea value={draft.quote} onChange={e => setDraft(d => ({ ...d, quote: e.target.value }))} placeholder="Testimonio" rows={3} className={`${inputCls} resize-y`} />
        <input value={draft.metric} onChange={e => setDraft(d => ({ ...d, metric: e.target.value }))} placeholder="Métrica (opcional, ej: −60% reuniones de status)" className={inputCls} />
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setDraftFile(e.target.files?.[0] ?? null)}
            className="text-xs text-gray-500 dark:text-gray-400 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-200" />
          <button type="button" onClick={handleCreate} disabled={creating} className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-4 py-1.5 transition-colors">
            {creating ? 'Creando…' : 'Agregar testimonio'}
          </button>
        </div>
        <p className="text-xs text-gray-400">Foto opcional — sin ella se muestran las iniciales.</p>
      </div>

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-80 mx-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white text-center mb-1">¿Eliminar testimonio?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-5">No se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg py-2 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Cancelar</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 font-medium">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Empresas que confían ─────────────────────────────────────────────────────

function TrustedCompaniesEditor() {
  const [companies, setCompanies] = useState([])
  const [loading,    setLoading]   = useState(true)
  const [uploading,  setUploading] = useState(false)
  const [editId,     setEditId]    = useState(null)
  const [editName,   setEditName]  = useState('')
  const [editUrl,    setEditUrl]   = useState('')
  const [deleteId,   setDeleteId]  = useState(null)
  const fileRef = useRef()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/superadmin/landing/trusted-companies')
      setCompanies(data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const name = window.prompt('Nombre de la empresa:')
    if (!name) return
    const websiteUrl = window.prompt('Sitio web (opcional, con https://):', '') || ''
    setUploading(true)
    try {
      const form = new FormData()
      form.append('image', file)
      form.append('name', name)
      if (websiteUrl.trim()) form.append('websiteUrl', websiteUrl.trim())
      await api.post('/superadmin/landing/trusted-companies', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      await load()
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al subir el logo')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function saveEdit(id) {
    if (!editName.trim()) return
    try {
      const { data } = await api.patch(`/superadmin/landing/trusted-companies/${id}`, {
        name: editName, websiteUrl: editUrl.trim() || null,
      })
      setCompanies(prev => prev.map(c => c.id === id ? { ...c, name: data.name, websiteUrl: data.websiteUrl } : c))
    } catch {}
    setEditId(null)
  }

  async function handleToggle(id) {
    try {
      const { data } = await api.patch(`/superadmin/landing/trusted-companies/${id}/toggle`)
      setCompanies(prev => prev.map(c => c.id === id ? { ...c, active: data.active } : c))
    } catch {}
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/superadmin/landing/trusted-companies/${id}`)
      setCompanies(prev => prev.filter(c => c.id !== id))
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al eliminar')
    } finally { setDeleteId(null) }
  }

  async function move(id, direction) {
    const idx = companies.findIndex(c => c.id === id)
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= companies.length) return
    const reordered = [...companies]
    ;[reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]]
    const items = reordered.map((c, i) => ({ id: c.id, order: i + 1 }))
    setCompanies(reordered.map((c, i) => ({ ...c, order: i + 1 })))
    api.patch('/superadmin/landing/trusted-companies/reorder', { items }).catch(() => load())
  }

  const active   = companies.filter(c => c.active)
  const inactive = companies.filter(c => !c.active)

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {active.length} activas · {inactive.length} inactivas
        </p>
        <div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            {uploading ? 'Subiendo…' : '+ Agregar empresa'}
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 text-right">PNG, JPG o WEBP · máx 2 MB</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
        {active.map((c, idx) => (
          <div key={c.id} className="flex items-center gap-4 px-5 py-3">
            <img src={trustedLogoUrl(c.id)} alt={c.name} className="w-10 h-10 rounded-lg object-contain flex-shrink-0 bg-gray-50 dark:bg-gray-700 ring-1 ring-gray-200 dark:ring-gray-600" />

            <div className="flex-1 min-w-0">
              {editId === c.id ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nombre"
                    className="text-sm border border-primary-400 rounded-lg px-2 py-1 w-full sm:w-40 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  <input value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="https://..."
                    className="text-sm border border-primary-400 rounded-lg px-2 py-1 w-full sm:w-56 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(c.id)} className="text-xs text-primary-600 font-medium hover:underline">Guardar</button>
                    <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:underline">Cancelar</button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</span>
                  {c.websiteUrl && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{c.websiteUrl}</p>}
                </>
              )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {editId !== c.id && (
                <button onClick={() => { setEditId(c.id); setEditName(c.name); setEditUrl(c.websiteUrl ?? '') }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-2">Editar</button>
              )}
              <button onClick={() => move(c.id, 'up')} disabled={idx === 0} title="Subir" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-500">↑</button>
              <button onClick={() => move(c.id, 'down')} disabled={idx === active.length - 1} title="Bajar" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-500">↓</button>
              <button onClick={() => handleToggle(c.id)} title="Desactivar" className="p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 text-xs px-2">Ocultar</button>
              <button onClick={() => setDeleteId(c.id)} title="Eliminar" className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 text-xs px-2">Eliminar</button>
            </div>
          </div>
        ))}
        {active.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">Sin empresas activas</div>
        )}
      </div>

      {inactive.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {inactive.map(c => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-3 opacity-50">
              <img src={trustedLogoUrl(c.id)} alt={c.name} className="w-10 h-10 rounded-lg object-contain grayscale flex-shrink-0" />
              <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{c.name}</span>
              <button onClick={() => handleToggle(c.id)} className="text-xs text-primary-600 hover:underline font-medium">Reactivar</button>
              <button onClick={() => setDeleteId(c.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
            </div>
          ))}
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-80 mx-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white text-center mb-1">¿Eliminar empresa?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-5">No se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg py-2 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">Cancelar</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 font-medium">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sección completa ─────────────────────────────────────────────────────────

export function SectionLanding() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Landing</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Hero, secciones intermedias, FAQ, testimonios y empresas destacadas de la landing pública
          (blisstracker.app). La comparativa vs. competidores, "para quién es" y la bio del founder
          todavía se editan por código.
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Hero</h2>
        <HeroEditor />
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Secciones intermedias</h2>
        <SectionsEditor />
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Testimonios</h2>
        <TestimonialsEditor />
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Preguntas frecuentes</h2>
        <FaqSectionEditor />
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Empresas que confían</h2>
        <TrustedCompaniesEditor />
      </div>
    </div>
  )
}
