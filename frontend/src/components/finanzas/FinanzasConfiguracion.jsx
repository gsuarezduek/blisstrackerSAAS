import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Search, Landmark } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { Card, CardHeader, TextButton } from '../../pages/project-detail/ui.jsx'
import ConfirmModal from '../ConfirmModal'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import { ACCOUNT_TYPES, accountTypeLabel, TAX_APPLIES_TO, taxBaseTypeLabel } from './financeCatalog'
import AccountModal from './AccountModal'
import TaxModal from './TaxModal'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

export default function FinanzasConfiguracion({ onBack }) {
  const [accounts, setAccounts]     = useState([])
  const [categories, setCategories] = useState([])
  const [items, setItems]           = useState([])
  const [taxes, setTaxes]           = useState([])
  const [loading, setLoading]       = useState(true)

  const loadAll = useCallback(async () => {
    const [a, c, i, t] = await Promise.all([
      api.get('/finanzas/accounts'),
      api.get('/finanzas/categories'),
      api.get('/finanzas/items'),
      api.get('/finanzas/taxes'),
    ])
    setAccounts(a.data)
    setCategories(c.data)
    setItems(i.data)
    setTaxes(t.data)
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  return (
    <div>
      <TextButton onClick={onBack} className="mb-2">← Volver a Finanzas</TextButton>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración de Finanzas</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">Lo que cargás acá aparece como opción al registrar un movimiento</p>

      {loading ? (
        <div className="text-sm text-gray-400 py-10 text-center">Cargando…</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <AccountsPanel accounts={accounts} taxes={taxes} onChanged={loadAll} />
            <CategoriesPanel categories={categories} onChanged={loadAll} />
            <ItemsPanel items={items} categories={categories} onChanged={loadAll} />
          </div>
          <TaxesPanel taxes={taxes} onChanged={loadAll} />
        </div>
      )}
    </div>
  )
}

// ─── Cuentas ──────────────────────────────────────────────────────────────
function AccountsPanel({ accounts, taxes, onChanged }) {
  const [modalAccount, setModalAccount] = useState(undefined) // undefined = cerrado, null = nueva, obj = editar
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/finanzas/accounts/${toDelete.id}`)
      setToDelete(null)
      onChanged()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo eliminar')
    } finally { setDeleting(false) }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader title="Bancos y cuentas" action={
        <TextButton onClick={() => setModalAccount(null)}><Icon as={Plus} size={14} className="inline -mt-0.5 mr-0.5" />Agregar</TextButton>
      } />
      <div className="px-4 pb-4 space-y-2">
        {accounts.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">Sin cuentas todavía.</p>}
        {accounts.map(a => (
          <div key={a.id} className={`flex items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 ${!a.active ? 'opacity-50' : ''}`}>
            <button onClick={() => setModalAccount(a)} className="text-left flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {accountTypeLabel(a.type)} · {a._count?.movements ?? 0} movimiento{a._count?.movements === 1 ? '' : 's'} · {a.taxes?.length || 0} impuesto{a.taxes?.length === 1 ? '' : 's'}
                {a.hasInvestments && ' · Con inversiones'}
              </p>
            </button>
            <span className="text-xs font-medium text-gray-400 shrink-0">{a.currency}</span>
            <button onClick={() => setModalAccount(a)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0"><Icon as={Pencil} size={14} /></button>
          </div>
        ))}
      </div>

      {modalAccount !== undefined && (
        <AccountModal account={modalAccount} allTaxes={taxes}
          onClose={() => setModalAccount(undefined)}
          onSaved={() => { setModalAccount(undefined); onChanged() }}
          onDelete={modalAccount ? () => { setToDelete(modalAccount); setModalAccount(undefined) } : undefined}
        />
      )}
      <ConfirmModal open={!!toDelete} title="Eliminar cuenta" message={`¿Eliminar "${toDelete?.name}"? Esta acción no se puede deshacer.`}
        loading={deleting} onConfirm={handleDelete} onCancel={() => setToDelete(null)} />
    </Card>
  )
}

// ─── Categorías ───────────────────────────────────────────────────────────
function CategoriesPanel({ categories, onChanged }) {
  const income  = categories.filter(c => c.type === 'income')
  const expense = categories.filter(c => c.type === 'expense')
  const [adding, setAdding] = useState(null) // 'income' | 'expense' | null
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(type) {
    if (!name.trim()) return
    setSaving(true); setError('')
    try {
      await api.post('/finanzas/categories', { name: name.trim(), type })
      setName(''); setAdding(null)
      onChanged()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear')
    } finally { setSaving(false) }
  }

  async function toggleActive(cat) {
    try {
      await api.patch(`/finanzas/categories/${cat.id}`, { active: !cat.active })
      onChanged()
    } catch (err) { alert(err.response?.data?.error || 'No se pudo actualizar') }
  }

  function Section({ label, type, list }) {
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className={`text-xs font-semibold uppercase tracking-wide ${type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{label}</p>
          <TextButton onClick={() => { setAdding(adding === type ? null : type); setError('') }}><Icon as={Plus} size={13} className="inline -mt-0.5" /></TextButton>
        </div>
        <ul className="space-y-1 mb-2">
          {list.map(c => (
            <li key={c.id} className={`flex items-center justify-between text-sm ${!c.active ? 'opacity-40' : ''}`}>
              <span className="text-gray-700 dark:text-gray-300 truncate">{c.name}</span>
              <button onClick={() => toggleActive(c)} className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0">
                {c.active ? 'Desactivar' : 'Activar'}
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="text-xs text-gray-400">Sin categorías.</li>}
        </ul>
        {adding === type && (
          <div className="flex gap-1.5 mb-2">
            <input autoFocus className={`${input} flex-1 py-1.5`} placeholder="Nombre" value={name}
              onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit(type)} />
            <button disabled={saving} onClick={() => submit(type)} className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-2.5 text-sm shrink-0 disabled:opacity-50">✓</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <Card className="p-4">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Categorías</h3>
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
      <div className="space-y-4">
        <Section label="Ingresos" type="income" list={income} />
        <Section label="Egresos" type="expense" list={expense} />
      </div>
    </Card>
  )
}

// ─── Items ────────────────────────────────────────────────────────────────
function ItemsPanel({ items, categories, onChanged }) {
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [tracksAccount, setTracksAccount] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))

  async function submit() {
    if (!name.trim() || !categoryId) { setError('Nombre y categoría habitual son obligatorios'); return }
    setSaving(true); setError('')
    try {
      await api.post('/finanzas/items', { name: name.trim(), categoryId: Number(categoryId), tracksAccount })
      setName(''); setCategoryId(''); setTracksAccount(false)
      onChanged()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear')
    } finally { setSaving(false) }
  }

  return (
    <Card className="p-4">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Items</h3>
      <div className="relative mb-3">
        <Icon as={Search} size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className={`${input} w-full pl-8`} placeholder="Buscar item…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 mb-3 space-y-2">
        <input className={`${input} w-full`} placeholder="Nombre" value={name} onChange={e => setName(e.target.value)} />
        <select className={`${input} w-full`} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">Categoría habitual (obligatoria)</option>
          {categories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name} ({c.type === 'income' ? 'Ingreso' : 'Egreso'})</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={tracksAccount} onChange={e => setTracksAccount(e.target.checked)} />
          Seguimiento de cuenta (para clientes: facturas, cobros y saldo)
        </label>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button disabled={saving} onClick={submit} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg py-1.5 text-sm disabled:opacity-50">Agregar</button>
      </div>

      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
              <th className="pb-1.5 font-medium">Item</th>
              <th className="pb-1.5 font-medium">Categoría habitual</th>
              <th className="pb-1.5 font-medium text-right">Seguimiento</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(i => (
              <tr key={i.id} className={`border-t border-gray-100 dark:border-gray-700 ${!i.active ? 'opacity-40' : ''}`}>
                <td className="py-1.5 text-gray-900 dark:text-white truncate max-w-[9rem]">{i.name}</td>
                <td className="py-1.5 text-gray-500 dark:text-gray-400 truncate max-w-[7rem]">{i.category?.name}</td>
                <td className="py-1.5 text-right">
                  {i.tracksAccount && <span className="text-[11px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full px-2 py-0.5">Activo</span>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={3} className="text-center text-xs text-gray-400 py-4">Sin items.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── Catálogo de impuestos ──────────────────────────────────────────────────
function TaxesPanel({ taxes, onChanged }) {
  const [modalTax, setModalTax] = useState(undefined)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/finanzas/taxes/${toDelete.id}`)
      setToDelete(null)
      onChanged()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo eliminar')
    } finally { setDeleting(false) }
  }

  return (
    <Card>
      <CardHeader title="Catálogo de impuestos" action={
        <TextButton onClick={() => setModalTax(null)}><Icon as={Plus} size={14} className="inline -mt-0.5 mr-0.5" />Agregar</TextButton>
      } />
      <p className="px-4 text-xs text-gray-400 -mt-1 mb-2">Después en cada banco tildás cuáles le corresponden</p>
      <div className="px-4 pb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
              <th className="pb-2 font-medium">Nombre</th>
              <th className="pb-2 font-medium">%</th>
              <th className="pb-2 font-medium">Aplica a</th>
              <th className="pb-2 font-medium">Se calcula sobre</th>
              <th className="pb-2 font-medium text-right">Editar</th>
            </tr>
          </thead>
          <tbody>
            {taxes.map(t => (
              <tr key={t.id} className={`border-t border-gray-100 dark:border-gray-700 ${!t.active ? 'opacity-40' : ''}`}>
                <td className="py-2 text-gray-900 dark:text-white">{t.name}</td>
                <td className="py-2 text-gray-500 dark:text-gray-400">{Number(t.percentage).toLocaleString('es-AR', { maximumFractionDigits: 3 })}%</td>
                <td className="py-2 text-gray-500 dark:text-gray-400">{TAX_APPLIES_TO.find(o => o.key === t.appliesTo)?.label}</td>
                <td className="py-2 text-gray-500 dark:text-gray-400">{t.baseType === 'other_tax' ? (t.baseTax?.name || '—') : taxBaseTypeLabel(t.baseType)}</td>
                <td className="py-2 text-right">
                  <TextButton onClick={() => setModalTax(t)}>Editar</TextButton>
                </td>
              </tr>
            ))}
            {taxes.length === 0 && <tr><td colSpan={5} className="text-center text-xs text-gray-400 py-4">Sin impuestos cargados.</td></tr>}
          </tbody>
        </table>
      </div>

      {modalTax !== undefined && (
        <TaxModal tax={modalTax} allTaxes={taxes}
          onClose={() => setModalTax(undefined)}
          onSaved={() => { setModalTax(undefined); onChanged() }}
          onDelete={modalTax ? () => { setToDelete(modalTax); setModalTax(undefined) } : undefined}
        />
      )}
      <ConfirmModal open={!!toDelete} title="Eliminar impuesto" message={`¿Eliminar "${toDelete?.name}"? Esta acción no se puede deshacer.`}
        loading={deleting} onConfirm={handleDelete} onCancel={() => setToDelete(null)} />
    </Card>
  )
}
