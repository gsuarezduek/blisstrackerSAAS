import { useState } from 'react'
import api from '../../api/client'
import { ITEM_IVA_CONDITIONS, normalizeCuit } from './financeCatalog'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const CUIT_RE = /^\d{2}-\d{8}-\d$/

// Alta de cliente desde la pestaña Clientes (antes solo se podía desde
// Configuración → Items, marcando "Seguimiento de cuenta" — este modal crea
// directo un FinanceItem con tracksAccount:true, con los mismos datos que ya
// se completan al editar un cliente (ver CustomerInfoCard.jsx), para no tener
// que ir a Configuración y volver.
export default function NewCustomerModal({ categories, issuers, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [taxId, setTaxId] = useState('')
  const [address, setAddress] = useState('')
  const [contractedService, setContractedService] = useState('')
  const [ivaCondition, setIvaCondition] = useState('')
  const [defaultIssuerId, setDefaultIssuerId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [looking, setLooking] = useState(false)
  const [lookupMsg, setLookupMsg] = useState('')

  async function handleLookup() {
    const normalized = normalizeCuit(taxId)
    if (!CUIT_RE.test(normalized)) { setError('CUIT inválido (debe tener 11 dígitos)'); return }
    setTaxId(normalized)
    setLooking(true); setError(''); setLookupMsg('')
    try {
      const res = await api.get(`/finanzas/padron/${normalized}`)
      if (res.data.address) setAddress(res.data.address)
      if (res.data.ivaCondition) setIvaCondition(res.data.ivaCondition)
      if (res.data.name && !contactName) setContactName(res.data.name)
      setLookupMsg('Datos encontrados en el padrón de ARCA.')
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo consultar el padrón')
    } finally { setLooking(false) }
  }

  async function handleSave() {
    if (!name.trim()) { setError('Nombre requerido'); return }
    if (!categoryId) { setError('Categoría habitual requerida'); return }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Mail inválido'); return }
    const normalizedTaxId = taxId ? normalizeCuit(taxId) : taxId
    if (normalizedTaxId && !CUIT_RE.test(normalizedTaxId)) { setError('CUIT inválido (debe tener 11 dígitos)'); return }
    setSaving(true); setError('')
    try {
      const res = await api.post('/finanzas/items', {
        name: name.trim(), categoryId: Number(categoryId), tracksAccount: true,
        contactName: contactName.trim() || undefined, phone: phone.trim() || undefined, email: email.trim() || undefined,
        taxId: normalizedTaxId || undefined, address: address.trim() || undefined, contractedService: contractedService.trim() || undefined,
        ivaCondition: ivaCondition || null, defaultIssuerId: defaultIssuerId ? Number(defaultIssuerId) : null,
      })
      onCreated(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 pr-8">Nuevo cliente</h2>

        <div className="space-y-3">
          <div>
            <label className={label}>Nombre</label>
            <input autoFocus className={input} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className={label}>Categoría habitual</label>
            <select className={input} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">Elegir…</option>
              {categories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name} ({c.type === 'income' ? 'Ingreso' : 'Egreso'})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Contacto</label>
              <input className={input} value={contactName} onChange={e => setContactName(e.target.value)} />
            </div>
            <div>
              <label className={label}>Teléfono</label>
              <input className={input} value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={label}>Mail</label>
            <input className={input} value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>CUIT</label>
              <div className="flex gap-1.5">
                <input className={input} value={taxId} onChange={e => setTaxId(e.target.value)} onBlur={e => setTaxId(normalizeCuit(e.target.value))} placeholder="XX-XXXXXXXX-X" />
                <button type="button" onClick={handleLookup} disabled={looking || !taxId} title="Buscar en el padrón de ARCA" className="shrink-0 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-2.5 text-xs font-medium disabled:opacity-50">{looking ? '…' : 'Buscar'}</button>
              </div>
            </div>
            <div>
              <label className={label}>Servicio contratado</label>
              <input className={input} value={contractedService} onChange={e => setContractedService(e.target.value)} />
            </div>
          </div>
          {lookupMsg && <p className="text-xs text-green-600 dark:text-green-400 -mt-2">{lookupMsg}</p>}
          <div>
            <label className={label}>Dirección</label>
            <input className={input} value={address} onChange={e => setAddress(e.target.value)} placeholder="Para facturar electrónicamente" />
          </div>
          <div>
            <label className={label}>Condición de IVA</label>
            <select className={input} value={ivaCondition} onChange={e => setIvaCondition(e.target.value)}>
              <option value="">Sin configurar (para facturar electrónicamente)</option>
              {ITEM_IVA_CONDITIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          {issuers?.length > 0 && (
            <div>
              <label className={label}>Emisor habitual</label>
              <select className={input} value={defaultIssuerId} onChange={e => setDefaultIssuerId(e.target.value)}>
                <option value="">Ninguno</option>
                {issuers.map(is => <option key={is.id} value={is.id}>{is.name}</option>)}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">{saving ? 'Creando…' : 'Crear cliente'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
