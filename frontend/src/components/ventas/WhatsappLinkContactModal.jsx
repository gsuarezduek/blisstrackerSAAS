import { useState, useEffect } from 'react'
import api from '../../api/client'

const input = 'w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400'

// Vincula una conversación de WhatsApp sin matchear a un Contact — a mano
// (existente) o creando uno nuevo (mismo patrón empresa existente/nueva que
// LeadModal.jsx). El teléfono del contacto nuevo sale de la propia
// conversación, no se vuelve a pedir. Cubre el gap dejado abierto en la
// Fase 1 del plan de WhatsApp (matching automático por teléfono, sin forma
// manual de corregirlo).
export default function WhatsappLinkContactModal({ conversation, onClose, onLinked }) {
  const [mode, setMode] = useState('existing') // 'existing' | 'new'

  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState('')
  const [contacts, setContacts] = useState([])
  const [contactId, setContactId] = useState('')

  const [companyMode, setCompanyMode] = useState('existing') // 'existing' | 'new'
  const [newCompanyName, setNewCompanyName] = useState('')
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [email, setEmail] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/ventas/companies').then(({ data }) => setCompanies(data)).catch(() => {})
  }, [])

  useEffect(() => {
    setContactId('')
    if (!companyId) { setContacts([]); return }
    api.get(`/ventas/contacts?companyId=${companyId}`).then(({ data }) => setContacts(data)).catch(() => {})
  }, [companyId])

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (mode === 'existing') {
      if (!contactId) return setError('Elegí un contacto')
    } else {
      if (!name.trim()) return setError('El nombre del contacto es requerido')
      if (companyMode === 'existing' && !companyId) return setError('Elegí una empresa')
      if (companyMode === 'new' && !newCompanyName.trim()) return setError('El nombre de la empresa es requerido')
    }
    setSaving(true)
    try {
      if (mode === 'existing') {
        await api.patch(`/whatsapp/conversations/${conversation.id}/contact`, { contactId })
      } else {
        const payload = { name, title, email }
        if (companyMode === 'existing') payload.companyId = companyId
        else payload.newCompany = { name: newCompanyName }
        await api.post(`/whatsapp/conversations/${conversation.id}/contact`, payload)
      }
      onLinked()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo vincular la conversación')
    } finally {
      setSaving(false)
    }
  }

  const label = conversation.contactName || conversation.phoneE164

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Vincular conversación</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{label} · {conversation.phoneE164}</p>

        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => setMode('existing')} className={`flex-1 text-sm py-1.5 rounded-lg font-medium transition-colors ${mode === 'existing' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
            Contacto existente
          </button>
          <button type="button" onClick={() => setMode('new')} className={`flex-1 text-sm py-1.5 rounded-lg font-medium transition-colors ${mode === 'new' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
            Contacto nuevo
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'existing' ? (
            <>
              <select className={input} value={companyId} onChange={e => setCompanyId(e.target.value)}>
                <option value="">Elegí una empresa…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {companyId && (
                contacts.length > 0 ? (
                  <select className={input} value={contactId} onChange={e => setContactId(e.target.value)}>
                    <option value="">Elegí un contacto…</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.title ? ` — ${c.title}` : ''}</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-gray-400">Esta empresa todavía no tiene contactos cargados — probá con "Contacto nuevo".</p>
                )
              )}
            </>
          ) : (
            <>
              <div className="flex gap-2 mb-1">
                <button type="button" onClick={() => setCompanyMode('existing')} className={`text-xs px-2 py-1 rounded-lg ${companyMode === 'existing' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium' : 'text-gray-400'}`}>
                  Empresa existente
                </button>
                <button type="button" onClick={() => setCompanyMode('new')} className={`text-xs px-2 py-1 rounded-lg ${companyMode === 'new' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium' : 'text-gray-400'}`}>
                  Empresa nueva
                </button>
              </div>
              {companyMode === 'existing' ? (
                <select className={input} value={companyId} onChange={e => setCompanyId(e.target.value)}>
                  <option value="">Elegí una empresa…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <input className={input} placeholder="Nombre de la empresa *" value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} />
              )}
              <input className={input} placeholder="Nombre del contacto *" value={name} onChange={e => setName(e.target.value)} />
              <input className={input} placeholder="Cargo" value={title} onChange={e => setTitle(e.target.value)} />
              <input className={input} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
              <p className="text-xs text-gray-400">Teléfono: {conversation.phoneE164} (de la conversación)</p>
            </>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-xl">
              {saving ? 'Guardando…' : mode === 'existing' ? 'Vincular' : 'Crear y vincular'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
