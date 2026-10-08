import { useState } from 'react'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import { checkStatusMeta } from './financeCatalog'
import TaxesBlock from './TaxesBlock'
import ConfirmModal from '../ConfirmModal'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const today = () => new Date().toISOString().slice(0, 10)

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Acreditar cheque (sección 4.8): resumen + fecha de acreditación + cuenta +
// impuestos + confirmar/rechazar.
export default function CreditCheckModal({ check, accounts, taxes, onClose, onSaved }) {
  const status = checkStatusMeta(check.status)
  const [creditedAt, setCreditedAt] = useState(today())
  const [creditedAccountId, setCreditedAccountId] = useState(String(check.movement.accountId))
  const [taxIds, setTaxIds] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmReject, setConfirmReject] = useState(false)

  const account = accounts.find(a => a.id === Number(creditedAccountId)) || null

  async function handleCredit() {
    setSaving(true); setError('')
    try {
      await api.patch(`/finanzas/checks/${check.id}/credit`, {
        creditedAt, creditedAccountId: Number(creditedAccountId), taxIds: [...taxIds],
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo acreditar')
    } finally { setSaving(false) }
  }

  async function handleReject() {
    setSaving(true); setError('')
    try {
      await api.patch(`/finanzas/checks/${check.id}/reject`)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo rechazar')
      setConfirmReject(false)
    } finally { setSaving(false) }
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 pr-8">Acreditar cheque</h2>

        <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900/30 rounded-xl p-3 mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Cheque N° {check.number}</p>
            <span className="text-[11px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-full px-2 py-0.5">{status.label}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{check.movement.item?.name} · {check.issuingBank}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Recibido el {fmtDate(check.movement.date)} · Fecha estimada {fmtDate(check.estimatedCollectionDate)}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{fmtMoney(check.movement.amount, check.movement.account?.currency)}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className={label}>Fecha de acreditación</label>
            <input type="date" className={input} value={creditedAt} onChange={e => setCreditedAt(e.target.value)} />
          </div>
          <div>
            <label className={label}>Se acreditó en</label>
            <select className={input} value={creditedAccountId} onChange={e => setCreditedAccountId(e.target.value)}>
              {accounts.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>

          {account && <TaxesBlock account={account} allTaxes={taxes} baseAmount={check.movement.amount} selectedTaxIds={taxIds} onChange={setTaxIds} />}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={() => setConfirmReject(true)} disabled={saving} className="border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">Rechazado</button>
            <div className="flex-1" />
            <button onClick={handleCredit} disabled={saving} className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">Confirmar acreditación</button>
          </div>
        </div>
      </div>
    </div>

    <ConfirmModal open={confirmReject} title="Rechazar cheque"
      message={`¿Rechazar el cheque N° ${check.number}? El cobro se anula y vuelve a subir el saldo del cliente.`}
      confirmLabel="Rechazar" loading={saving} onConfirm={handleReject} onCancel={() => setConfirmReject(false)} />
    </>
  )
}
