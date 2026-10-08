import { fmtMoney } from '../../utils/format'
import { accountTypeLabel } from './financeCatalog'

// Una tarjeta por cuenta (sección 4.2): nombre, moneda, ingresos, egresos,
// movimientos internos, disponible, y "En fondos" solo si tiene_inversiones.
// Clickeable → drill-down (AccountDetailPanel, con las transferencias).
export default function AccountBalanceCard({ account, onClick }) {
  return (
    <button onClick={onClick} className="text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{account.name}</p>
        <span className="text-[11px] font-medium text-gray-400 shrink-0 ml-2">{account.currency}</span>
      </div>
      <p className="text-[11px] text-gray-400 mb-2">{accountTypeLabel(account.type)}</p>

      <dl className="space-y-1 text-xs">
        <div className="flex justify-between">
          <dt className="text-gray-400">Ingresos</dt>
          <dd className="text-green-600 dark:text-green-400">{fmtMoney(account.incomePeriod, account.currency)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-400">Egresos</dt>
          <dd className="text-red-600 dark:text-red-400">{fmtMoney(account.expensePeriod, account.currency)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-400">Internos</dt>
          <dd className="text-gray-600 dark:text-gray-300">{Number(account.internalPeriod) < 0 ? '− ' : ''}{fmtMoney(Math.abs(account.internalPeriod), account.currency)}</dd>
        </div>
      </dl>

      <div className="border-t border-gray-100 dark:border-gray-700 mt-3 pt-3 space-y-1">
        <div className="flex justify-between">
          <dt className="text-xs text-gray-500 dark:text-gray-400">Disponible</dt>
          <dd className="text-sm font-semibold text-gray-900 dark:text-white">{fmtMoney(account.disponible, account.currency)}</dd>
        </div>
        {account.hasInvestments && (
          <div className="flex justify-between">
            <dt className="text-xs text-gray-500 dark:text-gray-400">En fondos</dt>
            <dd className="text-sm font-semibold text-gray-900 dark:text-white">{fmtMoney(account.fondos, account.currency)}</dd>
          </div>
        )}
      </div>
    </button>
  )
}
