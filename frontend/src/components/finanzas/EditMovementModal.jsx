import { useState } from 'react'
import api from '../../api/client'
import ConfirmModal from '../ConfirmModal'
import { ACCOUNT_APPLICATIONS } from './financeCatalog'
import { Avatar } from '../../pages/project-detail/ui.jsx'
import ItemPicker from './ItemPicker'
import TaxesBlock from './TaxesBlock'
import AuditTimeline from './AuditTimeline'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Editar movimiento (sección 4.9 del spec): modal ancho en dos columnas —
// izquierda el form, derecha el historial. Los movimientos generados
// automáticamente por un impuesto (sourceMovementId != null) o con un cheque
// ya acreditado/rechazado quedan de solo lectura (el backend ya lo rechaza;
// acá se refleja en la UI para no ofrecer botones que van a fallar).
export default function EditMovementModal({ movement, accounts, categories, items, taxes, onClose, onSaved }) {
  const isChild = movement.sourceMovementId != null
  const lockedByCheck = movement.check && movement.check.status !== 'pending'
  const readOnly = isChild || lockedByCheck

  const [item, setItem] = useState(items.find(i => i.id === movement.itemId) || movement.item)
  const [categoryId, setCategoryId] = useState(String(movement.categoryId))
  const [accountId, setAccountId] = useState(String(movement.accountId))
  const [date, setDate] = useState(movement.date.slice(0, 10))
  const [amount, setAmount] = useState(String(movement.amount))
  const [note, setNote] = useState(movement.note || '')
  const [accountApplication, setAccountApplication] = useState(movement.accountApplication || 'on_account')
  const [taxIds, setTaxIds] = useState(new Set(movement.taxes.map(t => t.taxId)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const typeCategories = categories.filter(c => c.type === movement.type && c.active)
  const account = accounts.find(a => a.id === Number(accountId)) || null
  const isCheck = !!movement.check

  async function handleSave() {
    if (!item || !categoryId || !accountId || !amount || Number(amount) <= 0) { setError('Revisá los campos requeridos'); return }
    setSaving(true); setError('')
    try {
      const body = { date, itemId: item.id, categoryId: Number(categoryId), accountId: Number(accountId), amount: Number(amount), note: note.trim() }
      if (movement.type === 'income' && item.tracksAccount) body.accountApplication = accountApplication
      if (!isCheck) body.taxIds = [...taxIds]
      await api.patch(`/finanzas/movements/${movement.id}`, body)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/finanzas/movements/${movement.id}`)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo eliminar')
      setConfirmDelete(false)
    } finally { setDeleting(false) }
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 z-10">✕</button>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="p-6 border-b md:border-b-0 md:border-r border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white pr-8">Editar {movement.type === 'income' ? 'ingreso' : 'egreso'}</h2>
            <p className="text-xs text-gray-400 mb-4">Creado el {fmtDate(movement.createdAt)}{movement.createdBy ? ` por ${movement.createdBy.name}` : ''}</p>

            {isChild && (
              <p className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg p-2 mb-4">
                Este movimiento se generó automáticamente por un impuesto. Para cambiarlo, editá el movimiento original.
              </p>
            )}
            {lockedByCheck && (
              <p className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg p-2 mb-4">
                Este movimiento tiene un cheque ya {movement.check.status === 'credited' ? 'acreditado' : 'rechazado'} — no se puede editar.
              </p>
            )}

            <div className={`space-y-4 ${readOnly ? 'opacity-50 pointer-events-none' : ''}`}>
              <div>
                <label className={label}>Item</label>
                <ItemPicker items={items} categories={categories} value={item?.id} onChange={setItem} />
              </div>

              <div>
                <label className={label}>Categoría</label>
                <select className={input} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                  {typeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Cuenta</label>
                  <select className={input} value={accountId} onChange={e => setAccountId(e.target.value)}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Fecha</label>
                  <input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} />
                </div>
              </div>

              <div>
                <label className={label}>Monto</label>
                <input type="number" step="any" className={input} value={amount} onChange={e => setAmount(e.target.value)} />
              </div>

              {isCheck ? (
                <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-lg p-2">
                  Cobrado con cheque N° {movement.check.number} ({movement.check.issuingBank}) — los impuestos se cargan al acreditarlo.
                </p>
              ) : (
                account && <TaxesBlock account={account} allTaxes={taxes} baseAmount={amount} selectedTaxIds={taxIds} onChange={setTaxIds} />
              )}

              {movement.type === 'income' && item?.tracksAccount && (
                <div>
                  <label className={label}>Aplicar a cuenta</label>
                  <select className={input} value={accountApplication} onChange={e => setAccountApplication(e.target.value)}>
                    {ACCOUNT_APPLICATIONS.filter(o => o.key !== 'invoice' || movement.accountApplication === 'invoice').map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className={label}>Nota</label>
                <input className={input} value={note} onChange={e => setNote(e.target.value)} />
              </div>
            </div>

            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

            <div className="flex gap-3 pt-4">
              <button onClick={() => setConfirmDelete(true)} className="border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg px-4 py-2 text-sm font-medium">Eliminar</button>
              <div className="flex-1" />
              <button onClick={onClose} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
              {!readOnly && (
                <button onClick={handleSave} disabled={saving} className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">Guardar cambios</button>
              )}
            </div>
          </div>

          <div className="p-6">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Historial</h3>
            <AuditTimeline entityType="movement" entityId={movement.id} />
          </div>
        </div>
      </div>
    </div>

    <ConfirmModal open={confirmDelete} title="Eliminar movimiento" message="Esta acción se puede deshacer restaurándolo después."
      confirmLabel="Eliminar" loading={deleting} onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} />
    </>
  )
}
