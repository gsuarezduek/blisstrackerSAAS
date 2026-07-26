import { useState, useEffect } from 'react'
import api from '../../api/client'
import RichTextEditor from '../RichTextEditor'
import { exportProposalPdf } from './proposalPdf'

const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'
const CURRENCIES = ['ARS', 'USD', 'EUR']

function newPlan(label, currency) { return { id: crypto.randomUUID(), label, price: '', currency, serviceIds: [] } }

// Modal de propuesta. Dos pasos: (1) armar planes de precio (servicios + precio mensual, ej.
// Básico/Completo) + objetivos → generar con IA; (2) editar el HTML generado y guardar/confirmar.
// Si recibe `proposal`, entra directo a editar.
export default function ProposalModal({ leadId, companyName, currency: defaultCurrency = 'ARS', proposal: initial, onClose, onSaved }) {
  const [step, setStep] = useState(initial ? 'edit' : 'form')
  const [proposal, setProposal] = useState(initial || null)

  const [services, setServices] = useState([])
  const [plans, setPlans] = useState(() => initial ? [] : [newPlan('Básico', defaultCurrency), newPlan('Completo', defaultCurrency)])
  const [objectives, setObjectives] = useState('')
  const [instructions, setInstructions] = useState('')
  const [generating, setGenerating] = useState(false)

  const [title, setTitle] = useState(initial?.title || '')
  const [content, setContent] = useState(initial?.content || '')
  const [signatures, setSignatures] = useState([])
  const [signatureId, setSignatureId] = useState(initial?.signatureId || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api.get('/services').then(({ data }) => setServices(data)).catch(() => {}) }, [])

  useEffect(() => {
    api.get('/workspaces/current').then(({ data }) => {
      const list = Array.isArray(data.salesSignatures) ? data.salesSignatures : []
      setSignatures(list)
      setSignatureId(id => id || (list.length === 1 ? list[0].id : ''))
    }).catch(() => {})
  }, [])

  function updatePlan(id, field, value) { setPlans(ps => ps.map(p => p.id === id ? { ...p, [field]: value } : p)) }
  function togglePlanService(id, serviceId) {
    setPlans(ps => ps.map(p => p.id === id
      ? { ...p, serviceIds: p.serviceIds.includes(serviceId) ? p.serviceIds.filter(x => x !== serviceId) : [...p.serviceIds, serviceId] }
      : p))
  }
  function addPlan() { setPlans(ps => [...ps, newPlan(`Plan ${ps.length + 1}`, defaultCurrency)]) }
  function removePlan(id) { setPlans(ps => ps.length > 1 ? ps.filter(p => p.id !== id) : ps) }

  async function generate() {
    setGenerating(true); setError('')
    try {
      const payloadPlans = plans.map(p => ({
        label: p.label.trim(),
        price: p.price === '' ? null : Number(p.price),
        currency: p.currency,
        serviceIds: p.serviceIds,
      }))
      const { data } = await api.post(`/ventas/leads/${leadId}/proposals`, { plans: payloadPlans, objectives, instructions, signatureId: signatureId || null })
      setProposal(data)
      setTitle(data.title || '')
      setContent(data.content || '')
      setSignatureId(data.signatureId || '')
      setStep('edit')
      onSaved?.() // refresca la lista con la nueva versión
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo generar la propuesta')
    } finally {
      setGenerating(false)
    }
  }

  async function save(confirm = false) {
    setSaving(true); setError('')
    try {
      const { data } = await api.patch(`/ventas/leads/${leadId}/proposals/${proposal.id}`, {
        title: title.trim() || null, content, signatureId: signatureId || null, ...(confirm ? { status: 'confirmed' } : {}),
      })
      setProposal(data)
      onSaved?.()
      if (confirm) onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6 overflow-y-auto">
      <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full p-6 my-auto ${step === 'edit' ? 'max-w-4xl' : 'max-w-3xl'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">
            {step === 'form' ? 'Nueva propuesta' : (proposal?.title || 'Propuesta')}
            {proposal?.version ? <span className="ml-2 text-xs text-gray-400">v{proposal.version}</span> : ''}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 mb-3">{error}</p>}

        {step === 'form' ? (
          <div className="space-y-4">
            <div>
              <label className={label}>Planes de precio</label>
              <p className="text-[11px] text-gray-400 mb-2">Cada plan es una opción con su propio precio mensual y servicios incluidos (ej. Básico y Completo). La propuesta los va a presentar como opciones comparables.</p>
              <div className="space-y-3">
                {plans.map(plan => (
                  <div key={plan.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input className={`${input} flex-1 font-medium`} placeholder={'Nombre del plan (ej. "Básico")'} value={plan.label} onChange={e => updatePlan(plan.id, 'label', e.target.value)} />
                      <select className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-2 text-sm shrink-0" value={plan.currency} onChange={e => updatePlan(plan.id, 'currency', e.target.value)}>
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input type="number" min="0" placeholder="Precio/mes" className="w-28 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-2 text-sm shrink-0" value={plan.price} onChange={e => updatePlan(plan.id, 'price', e.target.value)} />
                      {plans.length > 1 && <button type="button" onClick={() => removePlan(plan.id)} className="text-gray-400 hover:text-red-500 text-lg leading-none px-1" title="Eliminar plan">×</button>}
                    </div>
                    {services.length === 0 ? (
                      <p className="text-xs text-gray-400">No hay servicios cargados en el workspace (Admin → Servicios).</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {services.map(s => (
                          <button key={s.id} type="button" onClick={() => togglePlanService(plan.id, s.id)} title={s.description || ''}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${plan.serviceIds.includes(s.id) ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                            {s.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addPlan} className="text-xs font-medium text-primary-600 hover:text-primary-700 border border-dashed border-primary-300 dark:border-primary-700 rounded-full px-3 py-1">+ Agregar plan</button>
              </div>
            </div>
            <div>
              <label className={label}>Objetivos del cliente</label>
              <textarea className={input} rows={3} placeholder="Ej. Aumentar leads calificados, mejorar presencia en redes, posicionar la marca…" value={objectives} onChange={e => setObjectives(e.target.value)} />
            </div>
            <div>
              <label className={label}>Instrucciones específicas para esta propuesta (opcional)</label>
              <textarea className={input} rows={2} placeholder="Ej. Enfatizar resultados a 90 días, incluir un plan por etapas, tono cercano…" value={instructions} onChange={e => setInstructions(e.target.value)} />
              <p className="text-[11px] text-gray-400 mt-1">Se suman a las indicaciones generales de la agencia (Configuración de Ventas).</p>
            </div>
            {signatures.length > 0 && (
              <div>
                <label className={label}>Firma</label>
                <select className={input} value={signatureId} onChange={e => setSignatureId(e.target.value)}>
                  <option value="">Sin firma</option>
                  {signatures.map(s => <option key={s.id} value={s.id}>{s.label || s.name || 'Firma sin nombre'}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-xl py-2.5 text-sm">Cancelar</button>
              <button onClick={generate} disabled={generating} className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm flex items-center justify-center gap-2">
                {generating && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {generating ? 'Generando con IA…' : '✨ Generar con IA'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={label}>Título</label>
                <input className={input} value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              {signatures.length > 0 && (
                <div className="w-56 shrink-0">
                  <label className={label}>Firma</label>
                  <select className={input} value={signatureId} onChange={e => setSignatureId(e.target.value)}>
                    <option value="">Sin firma</option>
                    {signatures.map(s => <option key={s.id} value={s.id}>{s.label || s.name || 'Firma sin nombre'}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label className={label}>Contenido (editable)</label>
              <RichTextEditor defaultContent={content} onChange={setContent} minHeight={480} autoFocus={false} resizable />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={onClose} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-xl py-2.5 px-4 text-sm">Cerrar</button>
              <button onClick={() => exportProposalPdf({ ...proposal, title, content, signatureId }, { companyName })} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-xl py-2.5 px-4 text-sm">🖨️ PDF</button>
              <button onClick={() => save(false)} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm">{saving ? 'Guardando…' : 'Guardar'}</button>
              <button onClick={() => save(true)} disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 px-4 text-sm">Confirmar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
