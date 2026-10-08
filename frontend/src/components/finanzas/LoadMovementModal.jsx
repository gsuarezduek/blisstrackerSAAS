import { useState, useMemo } from 'react'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import { ACCOUNT_APPLICATIONS, TRANSFER_REASONS } from './financeCatalog'
import ItemPicker from './ItemPicker'
import TaxesBlock from './TaxesBlock'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const today = () => new Date().toISOString().slice(0, 10)

const MODES = [
  { id: 'income',   label: 'Ingreso' },
  { id: 'expense',  label: 'Egreso' },
  { id: 'transfer', label: 'Entre cuentas' },
]

export default function LoadMovementModal({ accounts, categories, items, taxes, defaultMode = 'income', onClose, onSaved }) {
  const [mode, setMode] = useState(defaultMode)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 pr-8">Nuevo movimiento</h2>

        <div className="flex gap-1 bg-gray-100 dark:bg-gray-900 rounded-xl p-1 mb-5 w-fit">
          {MODES.map(m => (
            <button key={m.id} type="button" onClick={() => setMode(m.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === m.id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'transfer' ? (
          <TransferForm accounts={accounts} taxes={taxes} onClose={onClose} onSaved={onSaved} />
        ) : (
          <MovementForm type={mode} accounts={accounts} categories={categories} items={items} taxes={taxes} onClose={onClose} onSaved={onSaved} />
        )}
      </div>
    </div>
  )
}

function MovementForm({ type, accounts, categories, items, taxes, onClose, onSaved }) {
  const isIncome = type === 'income'
  const [item, setItem] = useState(null)
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [date, setDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [checkNumber, setCheckNumber] = useState('')
  const [checkBank, setCheckBank] = useState('')
  const [checkDate, setCheckDate] = useState('')
  const [accountApplication, setAccountApplication] = useState('on_account')
  const [taxIds, setTaxIds] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const typeCategories = categories.filter(c => c.type === type && c.active)
  const account = accounts.find(a => a.id === Number(accountId)) || null
  const isCheck = isIncome && paymentMethod === 'check'

  function handleItemChange(it) {
    setItem(it)
    if (it && !categoryId) setCategoryId(String(it.categoryId))
  }

  async function handleSave() {
    if (!item) { setError('Elegí un item'); return }
    if (!categoryId) { setError('Elegí una categoría'); return }
    if (!accountId) { setError(`Elegí ${isIncome ? 'a qué cuenta entra' : 'de qué cuenta sale'}`); return }
    if (!amount || Number(amount) <= 0) { setError('Monto inválido'); return }
    if (isCheck && (!checkNumber.trim() || !checkBank.trim() || !checkDate)) { setError('Faltan datos del cheque'); return }

    setSaving(true); setError('')
    try {
      const body = {
        type, date, itemId: item.id, categoryId: Number(categoryId), accountId: Number(accountId),
        amount: Number(amount), note: note.trim() || undefined,
      }
      if (isIncome) {
        body.paymentMethod = paymentMethod
        if (item.tracksAccount) body.accountApplication = accountApplication
        if (isCheck) body.check = { number: checkNumber.trim(), issuingBank: checkBank.trim(), estimatedCollectionDate: checkDate }
        else body.taxIds = [...taxIds]
      } else {
        body.taxIds = [...taxIds]
      }
      await api.post('/finanzas/movements', body)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={label}>Item</label>
        <ItemPicker items={items} categories={categories} value={item?.id} onChange={handleItemChange} />
      </div>

      <div>
        <label className={label}>Categoría</label>
        <select className={input} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">Elegir…</option>
          {typeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>{isIncome ? 'Entra a' : 'Desde'}</label>
          <select className={input} value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">Elegir cuenta…</option>
            {accounts.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </select>
        </div>
        <div>
          <label className={label}>{isIncome ? 'Fecha de recepción' : 'Fecha'}</label>
          <input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={label}>Monto</label>
        <input type="number" step="any" className={input} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
      </div>

      {isIncome && (
        <div>
          <label className={label}>Forma de cobro</label>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-900 rounded-xl p-1 w-fit">
            {[{ k: 'transfer', l: 'Transferencia' }, { k: 'check', l: 'Cheque' }].map(o => (
              <button key={o.k} type="button" onClick={() => setPaymentMethod(o.k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${paymentMethod === o.k ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                {o.l}
              </button>
            ))}
          </div>
        </div>
      )}

      {isCheck && (
        <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900/30 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder="N° de cheque" value={checkNumber} onChange={e => setCheckNumber(e.target.value)} />
            <input className={input} placeholder="Banco emisor" value={checkBank} onChange={e => setCheckBank(e.target.value)} />
          </div>
          <div>
            <label className={label}>Fecha de cobro</label>
            <input type="date" className={input} value={checkDate} onChange={e => setCheckDate(e.target.value)} />
          </div>
          <p className="text-xs text-orange-700 dark:text-orange-400">Queda como cheque pendiente. Suma al banco recién cuando lo marqués como acreditado, y ahí confirmás la fecha real y los impuestos.</p>
        </div>
      )}

      {!isCheck && account && <TaxesBlock account={account} allTaxes={taxes} baseAmount={amount} selectedTaxIds={taxIds} onChange={setTaxIds} />}

      {isIncome && item?.tracksAccount && (
        <div>
          <label className={label}>Aplicar a cuenta</label>
          <select className={input} value={accountApplication} onChange={e => setAccountApplication(e.target.value)}>
            {ACCOUNT_APPLICATIONS.filter(o => o.key !== 'invoice').map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">Aplicar a una factura puntual se habilita junto con la pestaña Clientes.</p>
        </div>
      )}

      <div>
        <label className={label}>Nota (opcional)</label>
        <input className={input} value={note} onChange={e => setNote(e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
        <button type="button" onClick={handleSave} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">Guardar</button>
      </div>
    </div>
  )
}

function TransferForm({ accounts, taxes, onClose, onSaved }) {
  const [reason, setReason] = useState(TRANSFER_REASONS[0].key)
  const [fromAccountId, setFromAccountId] = useState('')
  const [fromAmount, setFromAmount] = useState('')
  const [fromIsFund, setFromIsFund] = useState(false)
  const [toAccountId, setToAccountId] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [toIsFund, setToIsFund] = useState(false)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [taxIds, setTaxIds] = useState(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fromAccount = accounts.find(a => a.id === Number(fromAccountId)) || null
  const toAccount = accounts.find(a => a.id === Number(toAccountId)) || null
  const differentCurrency = fromAccount && toAccount && fromAccount.currency !== toAccount.currency
  const exchangeRate = differentCurrency && Number(fromAmount) > 0 && Number(toAmount) > 0
    ? Number(fromAmount) / Number(toAmount) : null

  async function handleSave() {
    if (!fromAccountId || !toAccountId) { setError('Elegí las dos cuentas'); return }
    if (!fromAmount || !toAmount || Number(fromAmount) <= 0 || Number(toAmount) <= 0) { setError('Montos inválidos'); return }

    setSaving(true); setError('')
    try {
      await api.post('/finanzas/transfers', {
        date, reason, fromAccountId: Number(fromAccountId), fromAmount: Number(fromAmount), fromIsFund,
        toAccountId: Number(toAccountId), toAmount: Number(toAmount), toIsFund,
        note: note.trim() || undefined, taxIds: [...taxIds],
      })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={label}>Qué es</label>
        <select className={input} value={reason} onChange={e => setReason(e.target.value)}>
          {TRANSFER_REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>

      <div className="border border-red-200 dark:border-red-900/30 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase">Sale de</p>
        <div className="grid grid-cols-2 gap-2">
          <select className={input} value={fromAccountId} onChange={e => setFromAccountId(e.target.value)}>
            <option value="">Cuenta…</option>
            {accounts.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
          </select>
          <input type="number" step="any" className={input} placeholder="Monto" value={fromAmount} onChange={e => setFromAmount(e.target.value)} />
        </div>
        {fromAccount?.hasInvestments && (
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={fromIsFund} onChange={e => setFromIsFund(e.target.checked)} /> Sale de los fondos de esta cuenta (rescate)
          </label>
        )}
      </div>

      <div className="text-center text-gray-300 dark:text-gray-600">↓</div>

      <div className="border border-green-200 dark:border-green-900/30 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase">Entra a</p>
        <div className="grid grid-cols-2 gap-2">
          <select className={input} value={toAccountId} onChange={e => setToAccountId(e.target.value)}>
            <option value="">Cuenta…</option>
            {accounts.filter(a => a.active).map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
          </select>
          <input type="number" step="any" className={input} placeholder="Monto" value={toAmount} onChange={e => setToAmount(e.target.value)} />
        </div>
        {toAccount?.hasInvestments && (
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={toIsFund} onChange={e => setToIsFund(e.target.checked)} /> Entra a los fondos de esta cuenta (aporte)
          </label>
        )}
        {exchangeRate != null && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Tipo de cambio (calculado): {fmtMoney(exchangeRate, fromAccount.currency)}</p>
        )}
      </div>

      {fromAccount && <TaxesBlock account={fromAccount} allTaxes={taxes} baseAmount={fromAmount} selectedTaxIds={taxIds} onChange={setTaxIds} />}
      {taxIds.size > 0 && <p className="text-xs text-gray-400 -mt-2">Se cobran sobre la cuenta de la que sale la plata.</p>}

      <p className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-lg p-2">No suma como ingreso ni como egreso. Baja el disponible de la cuenta de origen y aparece en la de destino. Los impuestos sí se registran como egreso.</p>

      <div>
        <label className={label}>Fecha</label>
        <input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} />
      </div>

      <div>
        <label className={label}>Nota (opcional)</label>
        <input className={input} value={note} onChange={e => setNote(e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-4 py-2 text-sm font-medium">Cancelar</button>
        <button type="button" onClick={handleSave} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">Guardar</button>
      </div>
    </div>
  )
}
