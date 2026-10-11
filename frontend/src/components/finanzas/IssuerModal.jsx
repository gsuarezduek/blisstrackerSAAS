import { useState } from 'react'
import api from '../../api/client'
import { Toggle } from '../../pages/preferences/shared.jsx'
import { ISSUER_TAX_CONDITIONS, ISSUER_ENVIRONMENTS, normalizeCuit } from './financeCatalog'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const textarea = `${input} font-mono text-xs`
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

// Alta/edición de un emisor (razón social/CUIT propia para facturar
// electrónicamente, ver FinanceIssuer). El certificado/clave se pegan en PEM
// — se cifran en el backend y nunca vuelven a mostrarse una vez guardados
// (mismo criterio que ProjectAccess.password/twofa): dejar el campo vacío al
// editar conserva lo que ya estaba cargado.
export default function IssuerModal({ issuer, onClose, onSaved, onDelete }) {
  const isNew = issuer === null
  const [name, setName] = useState(issuer?.name || '')
  const [cuit, setCuit] = useState(issuer?.cuit || '')
  const [taxCondition, setTaxCondition] = useState(issuer?.taxCondition || ISSUER_TAX_CONDITIONS[0].key)
  const [salesPoint, setSalesPoint] = useState(issuer ? String(issuer.salesPoint) : '')
  const [environment, setEnvironment] = useState(issuer?.environment || 'test')
  const [active, setActive] = useState(issuer?.active ?? true)
  const [certificate, setCertificate] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('Nombre requerido'); return }
    const normalizedCuit = normalizeCuit(cuit)
    if (!/^\d{2}-\d{8}-\d$/.test(normalizedCuit)) { setError('CUIT inválido (debe tener 11 dígitos)'); return }
    if (!Number.isInteger(Number(salesPoint)) || Number(salesPoint) <= 0) { setError('Punto de venta inválido'); return }
    setSaving(true); setError('')
    try {
      const body = { name: name.trim(), cuit: normalizedCuit, taxCondition, salesPoint: Number(salesPoint), environment }
      if (!isNew) body.active = active
      if (certificate.trim()) body.certificate = certificate.trim()
      if (privateKey.trim()) body.privateKey = privateKey.trim()
      if (isNew) await api.post('/finanzas/issuers', body)
      else await api.patch(`/finanzas/issuers/${issuer.id}`, body)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 pr-8">{isNew ? 'Nuevo emisor' : 'Editar emisor'}</h2>

        <div className="space-y-4">
          <div>
            <label className={label}>Nombre</label>
            <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="ej. Bliss SA" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>CUIT</label>
              <input className={input} value={cuit} onChange={e => setCuit(e.target.value)} onBlur={e => setCuit(normalizeCuit(e.target.value))} placeholder="XX-XXXXXXXX-X (o los 11 dígitos seguidos)" />
            </div>
            <div>
              <label className={label}>Punto de venta</label>
              <input type="number" className={input} value={salesPoint} onChange={e => setSalesPoint(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Condición fiscal</label>
              <select className={input} value={taxCondition} onChange={e => setTaxCondition(e.target.value)}>
                {ISSUER_TAX_CONDITIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Ambiente</label>
              <select className={input} value={environment} onChange={e => setEnvironment(e.target.value)}>
                {ISSUER_ENVIRONMENTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {!isNew && (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Activo</p>
              <Toggle on={active} onToggle={() => setActive(v => !v)} />
            </div>
          )}

          <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Certificado y clave privada de ARCA, en PEM. {!isNew && (issuer.hasCertificate || issuer.hasPrivateKey) && 'Ya hay credenciales cargadas — dejar vacío conserva lo que tiene.'}
            </p>
            <div>
              <label className={label}>Certificado {!isNew && issuer.hasCertificate && <span className="text-green-600 dark:text-green-400">(cargado)</span>}</label>
              <textarea className={textarea} rows={3} value={certificate} onChange={e => setCertificate(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----" />
            </div>
            <div>
              <label className={label}>Clave privada {!isNew && issuer.hasPrivateKey && <span className="text-green-600 dark:text-green-400">(cargada)</span>}</label>
              <textarea className={textarea} rows={3} value={privateKey} onChange={e => setPrivateKey(e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----" />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            {onDelete && (
              <button onClick={onDelete} className="border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg px-4 py-2 text-sm font-medium">Eliminar</button>
            )}
            <div className="flex-1" />
            <button onClick={onClose} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
