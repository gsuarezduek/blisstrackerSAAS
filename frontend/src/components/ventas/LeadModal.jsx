import { useState, useEffect } from 'react'
import api from '../../api/client'
import { LEAD_STATUSES, LEAD_ORIGINS } from './salesCatalog'

const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

// Modal de alta/edición de Lead.
// Alta: soporta empresa existente o nueva + contacto principal existente o nuevo (flujo del CRM).
// Edición: solo campos del lead (empresa/contacto/responsable/estado se gestionan desde la vista del lead).
export default function LeadModal({ lead, companies = [], team = [], onClose, onSaved }) {
  const editing = !!lead

  const [companyMode, setCompanyMode] = useState('existing') // 'existing' | 'new'
  const [companyId, setCompanyId] = useState('')
  const [newCompany, setNewCompany] = useState({ name: '', website: '', industry: '', notes: '' })

  const [contactMode, setContactMode] = useState('none') // 'none' | 'existing' | 'new'
  const [contacts, setContacts] = useState([])
  const [primaryContactId, setPrimaryContactId] = useState('')
  const [newContact, setNewContact] = useState({ name: '', title: '', email: '', phone: '' })

  const [form, setForm] = useState({
    title: lead?.title || '',
    ownerId: lead?.ownerId || '',
    status: lead?.status || 'prospecto',
    origin: lead?.origin || '',
    estimatedValue: lead?.estimatedValue ?? '',
    currency: lead?.currency || 'USD',
    nextContactAt: lead?.nextContactAt ? lead.nextContactAt.slice(0, 10) : '',
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Al elegir una empresa existente, traer sus contactos para el selector de contacto principal.
  useEffect(() => {
    if (editing || companyMode !== 'existing' || !companyId) { setContacts([]); return }
    api.get(`/ventas/contacts?companyId=${companyId}`)
      .then(({ data }) => setContacts(data))
      .catch(() => setContacts([]))
  }, [companyId, companyMode, editing])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const base = {
      title: form.title.trim() || null,
      ownerId: form.ownerId ? Number(form.ownerId) : null,
      status: form.status,
      origin: form.origin || null,
      estimatedValue: form.estimatedValue === '' ? null : Number(form.estimatedValue),
      currency: form.currency,
      nextContactAt: form.nextContactAt || null,
    }

    let payload = base
    if (!editing) {
      // Empresa
      if (companyMode === 'existing') {
        if (!companyId) return setError('Elegí una empresa o creá una nueva')
        payload = { ...payload, companyId: Number(companyId) }
      } else {
        if (!newCompany.name.trim()) return setError('El nombre de la empresa es requerido')
        payload = { ...payload, newCompany }
      }
      // Contacto principal (opcional)
      if (contactMode === 'existing' && primaryContactId) payload.primaryContactId = Number(primaryContactId)
      if (contactMode === 'new' && newContact.name.trim()) payload.newContact = newContact
    }

    setSaving(true)
    try {
      if (editing) await api.patch(`/ventas/leads/${lead.id}`, base)
      else         await api.post('/ventas/leads', payload)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 my-auto">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">
          {editing ? 'Editar lead' : 'Nuevo lead'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing && (
            <>
              {/* Empresa */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className={label}>Empresa</span>
                  <div className="flex gap-1 text-xs">
                    <button type="button" onClick={() => setCompanyMode('existing')} className={`px-2 py-0.5 rounded ${companyMode === 'existing' ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400'}`}>Existente</button>
                    <button type="button" onClick={() => setCompanyMode('new')} className={`px-2 py-0.5 rounded ${companyMode === 'new' ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400'}`}>Nueva</button>
                  </div>
                </div>
                {companyMode === 'existing' ? (
                  <select className={input} value={companyId} onChange={e => { setCompanyId(e.target.value); setPrimaryContactId(''); setContactMode('none') }}>
                    <option value="">Elegir empresa…</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input className={input} placeholder="Nombre de la empresa *" value={newCompany.name} onChange={e => setNewCompany({ ...newCompany, name: e.target.value })} />
                    <input className={input} placeholder="Sitio web" value={newCompany.website} onChange={e => setNewCompany({ ...newCompany, website: e.target.value })} />
                    <input className={input} placeholder="Rubro" value={newCompany.industry} onChange={e => setNewCompany({ ...newCompany, industry: e.target.value })} />
                  </div>
                )}
              </div>

              {/* Contacto principal */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className={label}>Contacto principal (opcional)</span>
                  <div className="flex gap-1 text-xs">
                    <button type="button" onClick={() => setContactMode('none')} className={`px-2 py-0.5 rounded ${contactMode === 'none' ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400'}`}>Sin contacto</button>
                    {companyMode === 'existing' && contacts.length > 0 && (
                      <button type="button" onClick={() => setContactMode('existing')} className={`px-2 py-0.5 rounded ${contactMode === 'existing' ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400'}`}>Existente</button>
                    )}
                    <button type="button" onClick={() => setContactMode('new')} className={`px-2 py-0.5 rounded ${contactMode === 'new' ? 'bg-primary-600 text-white' : 'text-gray-500 dark:text-gray-400'}`}>Nuevo</button>
                  </div>
                </div>
                {contactMode === 'existing' && (
                  <select className={input} value={primaryContactId} onChange={e => setPrimaryContactId(e.target.value)}>
                    <option value="">Elegir contacto…</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.title ? ` — ${c.title}` : ''}</option>)}
                  </select>
                )}
                {contactMode === 'new' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} placeholder="Nombre *" value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} />
                    <input className={input} placeholder="Cargo" value={newContact.title} onChange={e => setNewContact({ ...newContact, title: e.target.value })} />
                    <input className={input} placeholder="Email" value={newContact.email} onChange={e => setNewContact({ ...newContact, email: e.target.value })} />
                    <input className={input} placeholder="Teléfono" value={newContact.phone} onChange={e => setNewContact({ ...newContact, phone: e.target.value })} />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Datos del lead */}
          <div>
            <label className={label}>Título de la oportunidad</label>
            <input className={input} placeholder="Opcional (ej. Rediseño web)" value={form.title} onChange={e => set('title', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Responsable</label>
              <select className={input} value={form.ownerId} onChange={e => set('ownerId', e.target.value)}>
                <option value="">Sin asignar</option>
                {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Estado</label>
              <select className={input} value={form.status} onChange={e => set('status', e.target.value)}>
                {LEAD_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Origen</label>
              <select className={input} value={form.origin} onChange={e => set('origin', e.target.value)}>
                <option value="">—</option>
                {LEAD_ORIGINS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Próximo contacto</label>
              <input type="date" className={input} value={form.nextContactAt} onChange={e => set('nextContactAt', e.target.value)} />
            </div>
            <div>
              <label className={label}>Valor estimado</label>
              <input type="number" min="0" className={input} placeholder="0" value={form.estimatedValue} onChange={e => set('estimatedValue', e.target.value)} />
            </div>
            <div>
              <label className={label}>Moneda</label>
              <select className={input} value={form.currency} onChange={e => set('currency', e.target.value)}>
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-xl py-2.5 text-sm transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors">
              {saving ? 'Guardando...' : (editing ? 'Guardar' : 'Crear lead')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
