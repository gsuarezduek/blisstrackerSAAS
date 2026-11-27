import { useState } from 'react'
import api from '../../api/client'
import { Toggle } from '../../pages/preferences/shared.jsx'
import { ACCOUNT_TYPES, BALANCE_GROUPS, CURRENCIES } from './financeCatalog'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

export default function AccountModal({ account, allTaxes, issuers = [], onClose, onSaved, onDelete }) {
  const isNew = account === null
  const [name, setName] = useState(account?.name || '')
  const [type, setType] = useState(account?.type || ACCOUNT_TYPES[0].key)
  const [currency, setCurrency] = useState(account?.currency || CURRENCIES[0].key)
  const [hasInvestments, setHasInvestments] = useState(account?.hasInvestments || false)
  const [balanceGroup, setBalanceGroup] = useState(account?.balanceGroup || 'available')
  const [issuerId, setIssuerId] = useState(account?.issuerId ? String(account.issuerId) : '')
  const [taxIds, setTaxIds] = useState(new Set((account?.taxes || []).map(t => t.taxId)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleTax(id) {
    setTaxIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Elegir "Cuenta de inversión" sugiere lo habitual para un broker: que cuente
  // como Inversión en Saldos y que tenga fondos (para cargar la valuación de la
  // cartera). Solo sugiere — los dos se pueden cambiar a mano después.
  function handleTypeChange(next) {
    setType(next)
    if (next === 'investment' && type !== 'investment') {
      setBalanceGroup('investment')
      setHasInvestments(true)
    }
  }

  async function handleSave() {
    if (!name.trim()) { setError('Nombre requerido'); return }
    setSaving(true); setError('')
    try {
      let id = account?.id
      // El saldo inicial ya no se pide: una cuenta nueva arranca en 0 y, si ya
      // tiene plata, se carga con "Ajustar saldo" (queda con fecha y motivo).
      // El de las cuentas viejas se sigue sumando tal cual.
      const body = { name: name.trim(), type, currency, hasInvestments, balanceGroup, issuerId: issuerId ? Number(issuerId) : null }
      if (isNew) {
        const res = await api.post('/finanzas/accounts', body)
        id = res.data.id
      } else {
        await api.patch(`/finanzas/accounts/${id}`, body)
      }
      await api.put(`/finanzas/accounts/${id}/taxes`, { taxIds: [...taxIds] })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 pr-8">Banco</h2>

        <div className="space-y-4">
          <div>
            <label className={label}>Nombre</label>
            <input className={input} value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Tipo</label>
              <select className={input} value={type} onChange={e => handleTypeChange(e.target.value)}>
                {ACCOUNT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Moneda</label>
              <select className={input} value={currency} onChange={e => setCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="account-issuer" className={label}>Entidad de facturación</label>
            <select id="account-issuer" className={input} value={issuerId} onChange={e => setIssuerId(e.target.value)}>
              <option value="">Sin entidad</option>
              {/* Las desactivadas solo si esta cuenta ya era de una: no se le asigna una cuenta nueva a quien ya no factura. */}
              {issuers.filter(i => i.active || String(i.id) === issuerId).map(i => (
                <option key={i.id} value={i.id}>{i.name}{i.active ? '' : ' (desactivada)'}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Opcional. La razón social dueña de la cuenta: en Resumen se compara lo que facturó con lo que entró en sus cuentas.</p>
          </div>

          <div>
            <p className={label}>En Saldos cuenta como</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="En Saldos cuenta como">
              {BALANCE_GROUPS.map(g => (
                <button key={g.key} type="button" role="radio" aria-checked={balanceGroup === g.key} onClick={() => setBalanceGroup(g.key)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${balanceGroup === g.key
                    ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  {g.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {balanceGroup === 'investment'
                ? `Plata a largo plazo: en Saldos va aparte, a "Inversión en ${currency === 'ARS' ? 'pesos' : currency}", y no se suma al disponible.`
                : 'Plata para operar: se suma al disponible de su moneda.'}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tiene fondos</p>
              <p className="text-xs text-gray-400">FCI o cartera dentro de la cuenta: permite aportes, rescates y actualizar la valuación</p>
            </div>
            <Toggle on={hasInvestments} onToggle={() => setHasInvestments(v => !v)} />
          </div>

          {allTaxes.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Impuestos de este banco</p>
              <p className="text-xs text-gray-400 mb-2">Los que tildes acá aparecen como opción al cargar un movimiento en este banco.</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {allTaxes.map(t => (
                  <label key={t.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={taxIds.has(t.id)} onChange={() => toggleTax(t.id)} />
                    {t.name} <span className="text-gray-400">({Number(t.percentage)}%)</span>
                  </label>
                ))}
              </div>
            </div>
          )}

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
