import { useEffect, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import CategoryBreakdownCard from './CategoryBreakdownCard'
import IncomeExpenseBarChart from './IncomeExpenseBarChart'
import EntitySummaryCards from './EntitySummaryCards'
import EditMovementModal from './EditMovementModal'
import InvoicedCollectedChart from './charts/InvoicedCollectedChart'
import { fmtMoney } from '../../utils/format'
import { currentMonthKey, shiftMonth, monthLabel } from './financeMonths'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

function dateMonthsAgo(n) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

// Pestaña Resumen (sección 4.3): tarjetas por entidad de facturación del mes,
// breakdown por categoría del mes + gráfico de ingresos vs. egresos por mes
// (con su propio filtro de fechas), todo por moneda. `accounts` llega ya
// cargado desde Finanzas.jsx para armar el selector de moneda con las que
// realmente existen; categories/items/taxes, para abrir un movimiento desde
// el aviso de cobros cruzados.
export default function SummaryTab({ accounts, categories = [], items = [], taxes = [], onDataChange }) {
  const currencies = [...new Set(accounts.map(a => a.currency))]
  const [currency, setCurrency] = useState(currencies.includes('ARS') ? 'ARS' : (currencies[0] || 'ARS'))
  const [month, setMonth] = useState(currentMonthKey())
  const [breakdown, setBreakdown] = useState(null)
  const [entities, setEntities] = useState(null)
  const [editing, setEditing] = useState(null)
  // Facturado vs. cobrado: 12 meses que terminan en el mes elegido, todas las
  // entidades o una ('none' = sin entidad).
  const [invoicingIssuer, setInvoicingIssuer] = useState('')
  const [invoicing, setInvoicing] = useState(null)

  const [chartFrom, setChartFrom] = useState(dateMonthsAgo(5))
  const [chartTo, setChartTo] = useState(new Date().toISOString().slice(0, 10))
  const [chart, setChart] = useState(null)

  const loadBreakdown = useCallback(async () => {
    const res = await api.get('/finanzas/summary/breakdown', { params: { month, currency } })
    setBreakdown(res.data)
  }, [month, currency])

  const loadChart = useCallback(async () => {
    const res = await api.get('/finanzas/summary/chart', { params: { from: chartFrom, to: chartTo, currency } })
    setChart(res.data)
  }, [chartFrom, chartTo, currency])

  const loadEntities = useCallback(async () => {
    const res = await api.get('/finanzas/summary/entities', { params: { month, currency } })
    setEntities(res.data)
  }, [month, currency])

  const loadInvoicing = useCallback(async () => {
    const res = await api.get('/finanzas/summary/invoicing', { params: { month, currency, months: 12, issuerId: invoicingIssuer } })
    setInvoicing(res.data)
  }, [month, currency, invoicingIssuer])

  async function openMovement(id) {
    const res = await api.get(`/finanzas/movements/${id}`)
    setEditing(res.data)
  }

  function handleMovementSaved() {
    setEditing(null)
    loadEntities(); loadBreakdown(); loadChart(); loadInvoicing()
    onDataChange?.()
  }

  useEffect(() => { loadBreakdown() }, [loadBreakdown])
  useEffect(() => { loadEntities() }, [loadEntities])
  useEffect(() => { loadInvoicing() }, [loadInvoicing])
  useEffect(() => { loadChart() }, [loadChart])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-1">
          <button onClick={() => setMonth(m => shiftMonth(m, -1))} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><Icon as={ChevronLeft} size={16} /></button>
          <span className="text-sm font-semibold text-gray-900 dark:text-white w-36 text-center">{monthLabel(month)}</span>
          <button onClick={() => setMonth(m => shiftMonth(m, 1))} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><Icon as={ChevronRight} size={16} /></button>
        </div>
        {currencies.length > 1 && (
          <select className={input} value={currency} onChange={e => setCurrency(e.target.value)}>
            {currencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      <EntitySummaryCards data={entities} currency={currency} onOpenMovement={openMovement} />

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Facturado vs. cobrado</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Últimos 12 meses hasta {monthLabel(month)}
              {invoicing && Number(invoicing.totals.diff) > 0 && <> · quedó por cobrar <span className="font-semibold text-gray-900 dark:text-white">{fmtMoney(invoicing.totals.diff, currency)}</span></>}
              {invoicing && Number(invoicing.totals.diff) < 0 && <> · se cobró <span className="font-semibold text-gray-900 dark:text-white">{fmtMoney(Math.abs(invoicing.totals.diff), currency)}</span> más de lo facturado</>}
            </p>
          </div>
          <select className={`${input} py-1.5`} aria-label="Entidad de facturación" value={invoicingIssuer} onChange={e => setInvoicingIssuer(e.target.value)}>
            <option value="">Todas las entidades</option>
            {(entities?.entities || []).map(e => (
              <option key={e.issuerId ?? 'none'} value={e.issuerId ?? 'none'}>{e.name}</option>
            ))}
          </select>
        </div>
        {invoicing ? <InvoicedCollectedChart series={invoicing.series} currency={currency} /> : <p className="text-sm text-gray-400 text-center py-10">Cargando…</p>}
      </div>

      {breakdown ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CategoryBreakdownCard title="Gastos por categoría" total={breakdown.expense.total} rows={breakdown.expense.rows} currency={currency} barColor="bg-orange-400" />
          <CategoryBreakdownCard title="Ingresos por categoría" total={breakdown.income.total} rows={breakdown.income.rows} currency={currency} barColor="bg-primary-500" />
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-10">Cargando…</p>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Evolución ingresos vs. egresos</h3>
          <div className="flex items-center gap-2">
            <input type="date" className={`${input} py-1.5`} value={chartFrom} onChange={e => setChartFrom(e.target.value)} />
            <span className="text-gray-400 text-sm">a</span>
            <input type="date" className={`${input} py-1.5`} value={chartTo} onChange={e => setChartTo(e.target.value)} />
          </div>
        </div>
        {chart ? <IncomeExpenseBarChart series={chart.series} currency={currency} /> : <p className="text-sm text-gray-400 text-center py-10">Cargando…</p>}
      </div>

      {editing && (
        <EditMovementModal movement={editing} accounts={accounts} categories={categories} items={items} taxes={taxes}
          onClose={() => setEditing(null)} onSaved={handleMovementSaved} />
      )}
    </div>
  )
}
