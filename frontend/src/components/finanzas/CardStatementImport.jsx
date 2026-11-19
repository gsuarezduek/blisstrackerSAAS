import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronRight, X, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Icon } from '../ui/Icon'
import api from '../../api/client'
import { fmtMoney } from '../../utils/format'
import ItemPicker from './ItemPicker'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const btnPrimary = 'bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors'
const btnGhost = 'text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-3 py-2'

const SOURCE_LABEL = {
  card: { text: 'Recordado', cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  workspace: { text: 'Recordado (otra tarjeta)', cls: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  ai: { text: 'Sugerido', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
}

const fmtDay = d => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '—')
const fmtIsoDay = v => (v ? fmtDay(new Date(v).toISOString().slice(0, 10)) : '—')

// "+ Cargar" → Tarjeta: subir el PDF del resumen, revisar los renglones
// agrupados por comercio con la categoría sugerida (memoria de la tarjeta o
// IA) y confirmar. Lo que queda elegido al confirmar es lo que la tarjeta
// "recuerda" para la próxima. Ver docs/claude/finanzas.md → "Tarjetas".
export default function CardStatementImport({ accounts, categories, items, onClose, onSaved }) {
  const [cards, setCards] = useState(null)
  const [cardId, setCardId] = useState('')
  const [newCard, setNewCard] = useState(null) // { name, last4, arsAccountId, usdAccountId } mientras se da de alta
  const [file, setFile] = useState(null)
  const [password, setPassword] = useState('')
  const [askPassword, setAskPassword] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [preview, setPreview] = useState(null)
  const [rows, setRows] = useState({})
  const [arsAccountId, setArsAccountId] = useState('')
  const [usdAccountId, setUsdAccountId] = useState('')
  const [dateMode, setDateMode] = useState('due')
  const [expanded, setExpanded] = useState(() => new Set())
  const [extraItems, setExtraItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/finanzas/cards').then(res => {
      setCards(res.data)
      if (res.data.length === 1) setCardId(String(res.data[0].id))
      if (res.data.length === 0) setNewCard({ name: '', last4: '', arsAccountId: '', usdAccountId: '' })
    }).catch(() => setCards([]))
  }, [])

  const card = cards?.find(c => c.id === Number(cardId)) || null
  const activeAccounts = accounts.filter(a => a.active)
  const allItems = useMemo(() => [...items, ...extraItems.filter(e => !items.some(i => i.id === e.id))], [items, extraItems])

  async function saveNewCard() {
    if (!newCard.name.trim()) { setError('Poné un nombre para la tarjeta'); return }
    setError('')
    try {
      const res = await api.post('/finanzas/cards', {
        name: newCard.name.trim(), last4: newCard.last4 || null,
        arsAccountId: newCard.arsAccountId ? Number(newCard.arsAccountId) : null,
        usdAccountId: newCard.usdAccountId ? Number(newCard.usdAccountId) : null,
      })
      setCards(cs => [...(cs || []), res.data].sort((a, b) => a.name.localeCompare(b.name)))
      setCardId(String(res.data.id))
      setNewCard(null)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear la tarjeta')
    }
  }

  async function handleParse() {
    if (!card) { setError('Elegí la tarjeta'); return }
    if (!file) { setError('Elegí el PDF del resumen'); return }
    setParsing(true); setError('')
    try {
      const fd = new FormData()
      fd.append('cardId', String(card.id))
      if (password) fd.append('password', password)
      fd.append('file', file)
      const res = await api.post('/finanzas/card-statements/parse', fd, { timeout: 240000 })
      const data = res.data
      const initial = {}
      for (const g of data.groups) {
        const s = g.suggestion || {}
        initial[g.id] = { include: true, itemId: s.itemId || null, newItemName: s.itemId ? null : (s.newItemName || null), categoryId: s.categoryId ? String(s.categoryId) : '', source: s.source || null }
      }
      setRows(initial)
      setArsAccountId(data.card.arsAccountId ? String(data.card.arsAccountId) : '')
      setUsdAccountId(data.card.usdAccountId ? String(data.card.usdAccountId) : '')
      setDateMode(data.statement.dueDate || data.statement.closingDate ? 'due' : 'line')
      setPreview(data)
    } catch (err) {
      const code = err.response?.data?.code
      if (code === 'PDF_PASSWORD_REQUIRED' || code === 'PDF_PASSWORD_INVALID') setAskPassword(true)
      setError(err.response?.data?.error || (err.code === 'ECONNABORTED' ? 'La lectura tardó demasiado. Probá de nuevo.' : 'No se pudo leer el resumen'))
    } finally { setParsing(false) }
  }

  function updateRow(id, patch) {
    setRows(r => ({ ...r, [id]: { ...r[id], ...patch } }))
  }

  function handleItem(group, item) {
    if (!item) { updateRow(group.id, { itemId: null }); return }
    if (!items.some(i => i.id === item.id)) setExtraItems(e => [...e, item])
    // Elegir un item trae su categoría habitual (si es del tipo correcto).
    const habitual = categories.find(c => c.id === item.categoryId && c.type === group.type)
    updateRow(group.id, { itemId: item.id, newItemName: null, ...(habitual ? { categoryId: String(habitual.id) } : {}), source: null })
  }

  function toggleExpanded(id) {
    setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const included = preview ? preview.groups.filter(g => rows[g.id]?.include) : []
  const currenciesNeeded = new Set(included.map(g => g.currency))
  const totals = useMemo(() => {
    const t = {}
    for (const g of included) {
      const sign = g.type === 'income' ? -1 : 1
      t[g.currency] = (t[g.currency] || 0) + sign * Number(g.total)
    }
    return t
  }, [included])

  async function handleConfirm() {
    const missing = included.find(g => (!rows[g.id].itemId && !rows[g.id].newItemName) || !rows[g.id].categoryId)
    if (missing) { setError(`Falta el item o la categoría de "${missing.lines[0].description}"`); return }
    if (currenciesNeeded.has('ARS') && !arsAccountId) { setError('Elegí de qué cuenta en pesos se pagan los consumos en pesos'); return }
    if (currenciesNeeded.has('USD') && !usdAccountId) { setError('Elegí de qué cuenta en dólares se pagan los consumos en dólares'); return }
    if (included.length === 0) { setError('No hay nada tildado para importar'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        cardId: card.id,
        arsAccountId: arsAccountId ? Number(arsAccountId) : null,
        usdAccountId: usdAccountId ? Number(usdAccountId) : null,
        dateMode,
        closingDate: preview.statement.closingDate,
        dueDate: preview.statement.dueDate,
        encrypted: preview.statement.encrypted,
        checks: preview.checks,
        groups: included.map(g => ({
          type: g.type, currency: g.currency,
          itemId: rows[g.id].itemId, newItemName: rows[g.id].itemId ? null : rows[g.id].newItemName,
          categoryId: Number(rows[g.id].categoryId),
          lines: g.lines,
        })),
      }
      const fd = new FormData()
      fd.append('payload', JSON.stringify(payload))
      fd.append('file', file)
      await api.post('/finanzas/card-statements', fd, { timeout: 120000 })
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo importar')
    } finally { setSaving(false) }
  }

  if (cards === null) return <p className="text-sm text-gray-400">Cargando…</p>

  // ── Paso 1: tarjeta + PDF ───────────────────────────────────────────────
  if (!preview) {
    return (
      <div className="space-y-4">
        {newCard ? (
          <div className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 space-y-3">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Nueva tarjeta</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className={label}>Nombre</label>
                <input className={input} value={newCard.name} placeholder="Visa Signature Patagonia" onChange={e => setNewCard(c => ({ ...c, name: e.target.value }))} />
              </div>
              <div>
                <label className={label}>Últimos 4 (opcional)</label>
                <input className={input} value={newCard.last4} maxLength={4} inputMode="numeric" onChange={e => setNewCard(c => ({ ...c, last4: e.target.value.replace(/\D/g, '') }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <AccountSelect label="Consumos en pesos salen de" currency="ARS" accounts={activeAccounts} value={newCard.arsAccountId} onChange={v => setNewCard(c => ({ ...c, arsAccountId: v }))} />
              <AccountSelect label="Consumos en dólares salen de" currency="USD" accounts={activeAccounts} value={newCard.usdAccountId} onChange={v => setNewCard(c => ({ ...c, usdAccountId: v }))} />
            </div>
            <div className="flex justify-end gap-2">
              {cards.length > 0 && <button type="button" className={btnGhost} onClick={() => setNewCard(null)}>Cancelar</button>}
              <button type="button" className={btnPrimary} onClick={saveNewCard}>Guardar tarjeta</button>
            </div>
          </div>
        ) : (
          <div>
            <label className={label}>Tarjeta</label>
            <div className="flex gap-2">
              <select className={input} value={cardId} onChange={e => setCardId(e.target.value)}>
                <option value="">Elegir tarjeta…</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.name}{c.last4 ? ` ·· ${c.last4}` : ''}</option>)}
              </select>
              <button type="button" className="shrink-0 text-sm text-primary-600 dark:text-primary-400 hover:underline px-2"
                onClick={() => setNewCard({ name: '', last4: '', arsAccountId: '', usdAccountId: '' })}>+ Nueva</button>
            </div>
          </div>
        )}

        <div>
          <label className={label}>PDF del resumen</label>
          <input type="file" accept="application/pdf,.pdf" onChange={e => { setFile(e.target.files?.[0] || null); setError('') }}
            className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 dark:file:bg-gray-700 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 dark:file:text-gray-200" />
        </div>

        <div>
          <label className={label}>Clave del PDF {askPassword ? '' : '(si tiene)'}</label>
          <input type="password" className={input} value={password} autoComplete="off" onChange={e => setPassword(e.target.value)}
            placeholder={askPassword ? 'Generalmente es tu DNI' : 'Dejala vacía si el PDF no tiene clave'} />
          <p className="text-xs text-gray-400 mt-1">Se usa solo para abrir el archivo; no se guarda.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {parsing && <p className="text-sm text-gray-500 dark:text-gray-400">Leyendo el resumen… puede tardar hasta un minuto.</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btnGhost} onClick={onClose}>Cancelar</button>
          <button type="button" className={btnPrimary} disabled={parsing || !card || !file} onClick={handleParse}>{parsing ? 'Leyendo…' : 'Leer resumen'}</button>
        </div>

        {card && <ImportedStatements cardId={card.id} />}
      </div>
    )
  }

  // ── Paso 2: revisión ────────────────────────────────────────────────────
  const { statement, checks, groups, payments, alreadyImported, droppedLines } = preview
  const badChecks = checks.filter(c => c.ok === false)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
        <span className="font-medium text-gray-900 dark:text-white">{card.name}</span>
        {statement.bank && <span>{statement.bank}</span>}
        <span>Cierre {fmtDay(statement.closingDate)}</span>
        <span>Vence {fmtDay(statement.dueDate)}</span>
        {statement.last4 && card.last4 && statement.last4 !== card.last4 && (
          <span className="text-amber-600">Ojo: el resumen es de la tarjeta ·· {statement.last4}</span>
        )}
      </div>

      {checks.length > 0 && (
        badChecks.length === 0 && checks.every(c => c.ok) ? (
          <p className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
            <Icon as={CheckCircle2} size={16} /> Los renglones leídos cierran con el saldo del resumen.
          </p>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-xl p-3 text-sm text-amber-800 dark:text-amber-300 space-y-1">
            <p className="flex items-center gap-1.5 font-medium"><Icon as={AlertTriangle} size={16} /> Revisá antes de importar</p>
            {badChecks.map(c => (
              <p key={c.currency}>En {c.currency === 'ARS' ? 'pesos' : 'dólares'}: lo leído da {fmtMoney(c.computed, c.currency)} y el resumen dice {fmtMoney(c.current, c.currency)} (diferencia {fmtMoney(c.diff, c.currency)}). Puede faltar o sobrar algún renglón.</p>
            ))}
            {checks.filter(c => c.ok === null).map(c => (
              <p key={c.currency}>En {c.currency === 'ARS' ? 'pesos' : 'dólares'} no se encontró el saldo del resumen para controlar.</p>
            ))}
            {droppedLines > 0 && <p>{droppedLines} renglón(es) no se pudieron leer bien y quedaron afuera.</p>}
          </div>
        )
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {currenciesNeeded.has('ARS') && <AccountSelect label="Consumos en pesos salen de" currency="ARS" accounts={activeAccounts} value={arsAccountId} onChange={setArsAccountId} />}
        {currenciesNeeded.has('USD') && <AccountSelect label="Consumos en dólares salen de" currency="USD" accounts={activeAccounts} value={usdAccountId} onChange={setUsdAccountId} />}
        <div>
          <label className={label}>Fecha de los movimientos</label>
          <select className={input} value={dateMode} onChange={e => setDateMode(e.target.value)}>
            <option value="due" disabled={!statement.dueDate && !statement.closingDate}>Vencimiento del resumen</option>
            <option value="line">Último consumo de cada grupo</option>
          </select>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No hay renglones nuevos para importar en este resumen.</p>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
          {groups.map(g => {
            const row = rows[g.id]
            const typeCategories = categories.filter(c => c.type === g.type && (c.active || String(c.id) === row.categoryId))
            const isOpen = expanded.has(g.id)
            return (
              <div key={g.id} className={`p-3 ${row.include ? '' : 'opacity-50'}`}>
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 md:items-start">
                  <div className="flex items-start gap-2 min-w-0">
                    <input type="checkbox" className="mt-1" checked={row.include} onChange={e => updateRow(g.id, { include: e.target.checked })} aria-label="Importar" />
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => toggleExpanded(g.id)} className="flex items-center gap-1 text-left text-sm font-medium text-gray-900 dark:text-white max-w-full">
                        <Icon as={isOpen ? ChevronDown : ChevronRight} size={14} className="shrink-0 text-gray-400" />
                        <span className="truncate">{g.lines.length === 1 ? g.lines[0].description : g.merchantKey}</span>
                      </button>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 pl-5 text-xs text-gray-500 dark:text-gray-400">
                        <span className={g.type === 'income' ? 'text-green-600 dark:text-green-400 font-medium' : 'font-medium text-gray-700 dark:text-gray-300'}>
                          {g.type === 'income' ? '+' : ''}{fmtMoney(g.total, g.currency)}
                        </span>
                        {g.lines.length > 1 && <span>{g.lines.length} renglones</span>}
                        {g.type === 'income' && <span>Ingreso (crédito)</span>}
                        {row.source && SOURCE_LABEL[row.source] && <span className={`px-1.5 py-0.5 rounded ${SOURCE_LABEL[row.source].cls}`}>{SOURCE_LABEL[row.source].text}</span>}
                      </div>
                    </div>
                  </div>
                  <div>
                    {!row.itemId && row.newItemName ? (
                      <div className="flex items-center justify-between gap-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm">
                        <span className="truncate text-gray-700 dark:text-gray-200">Crear «{row.newItemName}»</span>
                        <button type="button" aria-label="Elegir otro item" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" onClick={() => updateRow(g.id, { newItemName: null })}>
                          <Icon as={X} size={14} />
                        </button>
                      </div>
                    ) : (
                      <ItemPicker type={g.type} items={allItems} categories={categories} value={row.itemId} onChange={it => handleItem(g, it)} />
                    )}
                  </div>
                  <div>
                    <select className={input} value={row.categoryId} onChange={e => updateRow(g.id, { categoryId: e.target.value, source: null })} aria-label="Categoría">
                      <option value="">Categoría…</option>
                      {typeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                {isOpen && (
                  <ul className="mt-2 pl-7 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {g.lines.map(l => (
                      <li key={l.fingerprint} className="flex justify-between gap-3">
                        <span className="truncate">{fmtDay(l.date)} · {l.description}{l.installment ? ` · cuota ${l.installment}` : ''}</span>
                        <span className="shrink-0">{fmtMoney(l.amount, l.currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      {(payments.length > 0 || alreadyImported.length > 0) && (
        <details className="text-xs text-gray-500 dark:text-gray-400">
          <summary className="cursor-pointer select-none">
            No se importan: {[payments.length && `${payments.length} pago(s) del resumen anterior`, alreadyImported.length && `${alreadyImported.length} renglón(es) ya importados`].filter(Boolean).join(' · ')}
          </summary>
          <ul className="mt-2 space-y-0.5">
            {[...payments.map(l => ({ ...l, why: 'Pago' })), ...alreadyImported.map(l => ({ ...l, why: 'Ya importado' }))].map(l => (
              <li key={l.fingerprint} className="flex justify-between gap-3">
                <span className="truncate">{l.why} · {fmtDay(l.date)} · {l.description}</span>
                <span className="shrink-0">{fmtMoney(l.amount, l.currency)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {included.length} movimiento(s){Object.entries(totals).map(([cur, v]) => ` · ${fmtMoney(v, cur)}`).join('')}
        </p>
        <div className="flex gap-2">
          <button type="button" className={btnGhost} onClick={() => { setPreview(null); setError('') }}>Volver</button>
          <button type="button" className={btnPrimary} disabled={saving || included.length === 0} onClick={handleConfirm}>{saving ? 'Importando…' : 'Importar'}</button>
        </div>
      </div>
    </div>
  )
}

function AccountSelect({ label: text, currency, accounts, value, onChange }) {
  const options = accounts.filter(a => a.currency === currency)
  return (
    <div>
      <label className={label}>{text}</label>
      <select className={input} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{options.length ? 'Elegir cuenta…' : `No hay cuentas en ${currency}`}</option>
        {options.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>
  )
}

// Últimas importaciones de la tarjeta: ver el PDF (se guarda un año) o deshacer
// la importación (borra sus movimientos; la memoria de categorías queda).
function ImportedStatements({ cardId }) {
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setList(null)
    api.get(`/finanzas/cards/${cardId}/statements`).then(res => { if (!cancelled) setList(res.data) }).catch(() => { if (!cancelled) setList([]) })
    return () => { cancelled = true }
  }, [cardId])

  async function openPdf(s) {
    setError('')
    try {
      const res = await api.get(`/finanzas/card-statements/${s.id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch {
      setError('No se pudo abrir el PDF')
    }
  }

  async function undo(s) {
    if (!window.confirm(`¿Deshacer la importación del resumen con cierre ${fmtIsoDay(s.closingDate)}? Se borran sus ${s.movements} movimiento(s).`)) return
    setBusy(s.id); setError('')
    try {
      await api.delete(`/finanzas/card-statements/${s.id}`)
      setList(l => l.filter(x => x.id !== s.id))
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo deshacer')
    } finally { setBusy(null) }
  }

  if (!list || list.length === 0) return null
  return (
    <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Resúmenes importados</p>
      <ul className="space-y-1.5">
        {list.map(s => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-gray-700 dark:text-gray-300">
              Cierre {fmtIsoDay(s.closingDate)} <span className="text-gray-400">· {s.movements} movimiento(s)</span>
            </span>
            <span className="flex items-center gap-3 shrink-0">
              {s.hasFile && (
                <button type="button" onClick={() => openPdf(s)} className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  title={`${s.fileEncrypted ? 'Tiene la misma clave que el original. ' : ''}Se guarda hasta el ${fmtIsoDay(s.fileExpiresAt)}`}>
                  <Icon as={FileText} size={13} /> PDF
                </button>
              )}
              <button type="button" disabled={busy === s.id} onClick={() => undo(s)} className="text-xs text-red-600 hover:underline disabled:opacity-50">Deshacer</button>
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
