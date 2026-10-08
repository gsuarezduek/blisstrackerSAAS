import { useEffect, useState, useCallback } from 'react'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import AccountBalanceCard from './AccountBalanceCard'
import AccountDetailPanel from './AccountDetailPanel'
import CreditCheckModal from './CreditCheckModal'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function SummaryCard({ label, value, sub, dark, highlight }) {
  return (
    <div className={`rounded-2xl p-4 ${dark ? 'bg-gray-900 dark:bg-black text-white' : highlight ? 'bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900/30' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`}>
      <p className={`text-xs ${dark ? 'text-gray-300' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-lg font-bold ${dark ? 'text-white' : highlight ? 'text-orange-700 dark:text-orange-400' : 'text-gray-900 dark:text-white'}`}>{value}</p>
      {sub && <p className={`text-[11px] ${dark ? 'text-gray-400' : 'text-gray-400'}`}>{sub}</p>}
    </div>
  )
}

export default function BalancesTab({ accounts: accountsCatalog, taxes }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState(null)
  const [pendingChecks, setPendingChecks] = useState([])
  const [detailAccount, setDetailAccount] = useState(null)
  const [creditingCheck, setCreditingCheck] = useState(null)

  const load = useCallback(async () => {
    const params = {}
    if (from) params.from = from
    if (to) params.to = to
    const [balRes, checksRes] = await Promise.all([
      api.get('/finanzas/balances', { params }),
      api.get('/finanzas/checks', { params: { status: 'pending' } }),
    ])
    setData(balRes.data)
    setPendingChecks(checksRes.data)
  }, [from, to])

  useEffect(() => { load() }, [load])

  function handleChanged() {
    load()
  }

  if (!data) return <p className="text-center text-sm text-gray-400 py-10">Cargando…</p>

  const ars = data.totalsByCurrency.ARS
  const otherCurrencies = Object.keys(data.totalsByCurrency).filter(c => c !== 'ARS')

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
        <input type="date" className={input} value={from} onChange={e => setFrom(e.target.value)} />
        <span className="self-center text-gray-400 text-sm">a</span>
        <input type="date" className={input} value={to} onChange={e => setTo(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {ars && (
          <>
            <SummaryCard dark label="Total en pesos" value={fmtMoney(ars.total, 'ARS')} sub="Disponible + fondos" />
            <SummaryCard label="Disponible en pesos" value={fmtMoney(ars.disponible, 'ARS')} />
            <SummaryCard label="En fondos" value={fmtMoney(ars.fondos, 'ARS')} />
          </>
        )}
        {otherCurrencies.map(cur => (
          <SummaryCard key={cur} label={cur === 'USD' ? 'Dólares' : cur === 'BTC' ? 'Bitcoin' : cur} value={fmtMoney(data.totalsByCurrency[cur].total, cur)} />
        ))}
        <SummaryCard highlight label="Cheques en cartera"
          value={fmtMoney(ars?.pendingChecks.amount ?? 0, 'ARS')}
          sub={`${ars?.pendingChecks.count ?? 0} cheque${(ars?.pendingChecks.count ?? 0) === 1 ? '' : 's'} · no disponible`} />
      </div>

      {pendingChecks.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 mb-6">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Cheques pendientes</h3>
          <div className="space-y-1.5">
            {pendingChecks.map(c => (
              <button key={c.id} onClick={() => setCreditingCheck(c)}
                className="w-full flex items-center justify-between gap-2 text-left text-sm rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-900/30">
                <span className="text-gray-900 dark:text-white">N° {c.number} · {c.movement.item?.name}</span>
                <span className="text-xs text-gray-400">Cobro est. {fmtDate(c.estimatedCollectionDate)}</span>
                <span className="font-medium text-gray-900 dark:text-white">{fmtMoney(c.movement.amount, c.movement.account?.currency)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.accounts.map(account => (
          <AccountBalanceCard key={account.id} account={account} onClick={() => setDetailAccount(account)} />
        ))}
      </div>

      {detailAccount && (
        <AccountDetailPanel account={detailAccount} onClose={() => setDetailAccount(null)} onChanged={handleChanged} />
      )}
      {creditingCheck && (
        <CreditCheckModal check={creditingCheck} accounts={accountsCatalog} taxes={taxes}
          onClose={() => setCreditingCheck(null)}
          onSaved={() => { setCreditingCheck(null); load() }} />
      )}
    </div>
  )
}
