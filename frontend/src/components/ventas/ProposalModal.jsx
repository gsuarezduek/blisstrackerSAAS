import { useState, useEffect } from 'react'
import api from '../../api/client'
import RichTextEditor from '../RichTextEditor'

const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

// Modal de propuesta. Dos pasos: (1) elegir servicios + objetivos → generar con IA;
// (2) editar el HTML generado y guardar/confirmar. Si recibe `proposal`, entra directo a editar.
export default function ProposalModal({ leadId, proposal: initial, onClose, onSaved }) {
  const [step, setStep] = useState(initial ? 'edit' : 'form')
  const [proposal, setProposal] = useState(initial || null)

  const [services, setServices] = useState([])
  const [serviceIds, setServiceIds] = useState([])
  const [objectives, setObjectives] = useState('')
  const [generating, setGenerating] = useState(false)

  const [title, setTitle] = useState(initial?.title || '')
  const [content, setContent] = useState(initial?.content || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api.get('/services').then(({ data }) => setServices(data)).catch(() => {}) }, [])

  function toggleService(id) {
    setServiceIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  async function generate() {
    setGenerating(true); setError('')
    try {
      const { data } = await api.post(`/ventas/leads/${leadId}/proposals`, { serviceIds, objectives })
      setProposal(data)
      setTitle(data.title || '')
      setContent(data.content || '')
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
        title: title.trim() || null, content, ...(confirm ? { status: 'confirmed' } : {}),
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
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full p-6 my-auto">
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
              <label className={label}>Servicios a proponer</label>
              {services.length === 0 ? (
                <p className="text-xs text-gray-400">No hay servicios cargados en el workspace. Podés generar igual desde los objetivos.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {services.map(s => (
                    <button key={s.id} type="button" onClick={() => toggleService(s.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${serviceIds.includes(s.id) ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className={label}>Objetivos del cliente</label>
              <textarea className={input} rows={4} placeholder="Ej. Aumentar leads calificados, mejorar presencia en redes, posicionar la marca…" value={objectives} onChange={e => setObjectives(e.target.value)} />
            </div>
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
            <div>
              <label className={label}>Título</label>
              <input className={input} value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <label className={label}>Contenido (editable)</label>
              <RichTextEditor defaultContent={content} onChange={setContent} minHeight={280} autoFocus={false} resizable />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-xl py-2.5 px-4 text-sm">Cerrar</button>
              <button onClick={() => save(false)} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm">{saving ? 'Guardando…' : 'Guardar'}</button>
              <button onClick={() => save(true)} disabled={saving} className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 px-4 text-sm">Confirmar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
