import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import { fmtTokens, fmtCost } from './shared'
import { TokenBar } from './aiTokens'
import { SectionSettings } from './settings'
import ConfirmModal from '../../components/ConfirmModal'

const ACTION_LABELS = {
  connect:                     'Conexión',
  refresh:                     'Refresh manual',
  monthly_snapshot:            'Snapshot mensual',
  diagnostic:                  'Diagnóstico',
  collab_merge:                'Merge de collabs',
  competitor_add:              'Alta de competidor',
  competitor_refresh:          'Refresh de competidor',
  competitor_monthly_snapshot: 'Snapshot mensual (competidor)',
}
function actionLabel(key) { return ACTION_LABELS[key] || key }

const PLATFORM_LABELS = { instagram: 'Instagram', linkedin: 'LinkedIn', facebook: 'Facebook' }
function platformLabel(key) { return PLATFORM_LABELS[key] || key }

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// ─── Tarjetas de $ real por cuenta (en vivo contra la API de Apify) ────────────
function AccountsUsagePanel({ accounts, loading, onRefresh }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Gasto real del mes por cuenta</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Consultado en vivo a la API de Apify — mismo número que su dashboard de Apify (caché 5 min).</p>
        </div>
        <button
          onClick={onRefresh}
          className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0"
        >
          ↻ Refrescar
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !accounts || accounts.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Sin cuentas de Apify configuradas.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
          {accounts.map(a => (
            <div key={a.tokenId} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.label}</p>
                {!a.active && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 flex-shrink-0">inactiva</span>
                )}
              </div>
              {a.error ? (
                <p className="text-xs text-red-500 mt-1.5">{a.error}</p>
              ) : (
                <>
                  <p className="text-xl font-bold text-primary-600 dark:text-primary-400 mt-1">
                    {a.totalUsageCreditsUsdAfterVolumeDiscount != null ? fmtCost(a.totalUsageCreditsUsdAfterVolumeDiscount) : '—'}
                  </p>
                  {a.usageCycle && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {fmtDate(a.usageCycle.startAt)} – {fmtDate(a.usageCycle.endAt)}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Gestión de tokens (CRUD, patrón calcado de avatars.jsx) ───────────────────
function TokensPanel({ tokens, loading, onChanged }) {
  const [editId,     setEditId]     = useState(null)
  const [editLabel,  setEditLabel]  = useState('')
  const [deleteId,   setDeleteId]   = useState(null)
  const [deleting,   setDeleting]   = useState(false)
  const [addOpen,    setAddOpen]    = useState(false)
  const [newLabel,   setNewLabel]   = useState('')
  const [newToken,   setNewToken]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [changeId,   setChangeId]   = useState(null)
  const [changeVal,  setChangeVal]  = useState('')

  async function handleCreate() {
    if (!newLabel.trim() || !newToken.trim()) return
    setSaving(true)
    try {
      await api.post('/superadmin/apify-tokens', { label: newLabel.trim(), token: newToken.trim() })
      setAddOpen(false); setNewLabel(''); setNewToken('')
      onChanged()
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al agregar el token')
    } finally { setSaving(false) }
  }

  async function saveLabel(id) {
    if (!editLabel.trim()) return
    try {
      await api.patch(`/superadmin/apify-tokens/${id}`, { label: editLabel })
      onChanged()
    } catch {}
    setEditId(null)
  }

  async function saveNewTokenValue(id) {
    if (!changeVal.trim()) return
    setSaving(true)
    try {
      await api.patch(`/superadmin/apify-tokens/${id}`, { token: changeVal.trim() })
      setChangeId(null); setChangeVal('')
      onChanged()
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al actualizar el token')
    } finally { setSaving(false) }
  }

  async function handleToggle(id) {
    try {
      await api.patch(`/superadmin/apify-tokens/${id}/toggle`)
      onChanged()
    } catch {}
  }

  async function handleDelete(id) {
    setDeleting(true)
    try {
      await api.delete(`/superadmin/apify-tokens/${id}`)
      onChanged()
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al eliminar')
    } finally { setDeleting(false); setDeleteId(null) }
  }

  async function move(id, direction) {
    const idx = tokens.findIndex(t => t.id === id)
    const swap = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= tokens.length) return
    const reordered = [...tokens]
    ;[reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]]
    const items = reordered.map((t, i) => ({ id: t.id, order: i + 1 }))
    try {
      await api.patch('/superadmin/apify-tokens/reorder', { items })
      onChanged()
    } catch { onChanged() }
  }

  const active   = tokens.filter(t => t.active)
  const inactive = tokens.filter(t => !t.active)
  const deleteTarget = tokens.find(t => t.id === deleteId)
  const isOnlyActiveToken = deleteTarget?.active && active.length === 1

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Tokens de Apify</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {active.length} activos · {inactive.length} inactivos · se prueban en este orden si uno falla o se queda sin crédito.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-3 py-1.5 flex-shrink-0 transition-colors"
        >
          + Agregar token
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tokens.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          Sin tokens configurados — el scraping usa las variables de entorno legacy (APIFY_API_TOKEN…4) si existen.
        </p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {[...active, ...inactive].map((t, idx) => (
            <div key={t.id} className={`flex items-center gap-4 px-5 py-3 ${!t.active ? 'opacity-50' : ''}`}>
              <div className="flex-1 min-w-0">
                {editId === t.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveLabel(t.id); if (e.key === 'Escape') setEditId(null) }}
                      autoFocus
                      className="text-sm border border-primary-400 rounded-lg px-2 py-1 w-48 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <button onClick={() => saveLabel(t.id)} className="text-xs text-primary-600 font-medium hover:underline">Guardar</button>
                    <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:underline">Cancelar</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.label}</span>
                    <button onClick={() => { setEditId(t.id); setEditLabel(t.label) }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs flex-shrink-0" title="Renombrar">✏️</button>
                  </div>
                )}
                {changeId === t.id ? (
                  <div className="flex items-center gap-2 mt-1.5">
                    <input
                      type="password"
                      value={changeVal}
                      onChange={e => setChangeVal(e.target.value)}
                      placeholder="Nuevo valor del token"
                      autoFocus
                      className="text-xs border border-primary-400 rounded-lg px-2 py-1 w-56 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <button onClick={() => saveNewTokenValue(t.id)} disabled={saving} className="text-xs text-primary-600 font-medium hover:underline disabled:opacity-50">Guardar</button>
                    <button onClick={() => { setChangeId(null); setChangeVal('') }} className="text-xs text-gray-400 hover:underline">Cancelar</button>
                  </div>
                ) : (
                  <button onClick={() => { setChangeId(t.id); setChangeVal('') }} className="text-[11px] text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 mt-0.5">
                    Cambiar token…
                  </button>
                )}
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                  {t.lastUsedAt ? `Último uso: ${fmtDate(t.lastUsedAt)}` : 'Sin uso reciente'}
                  {t.lastFailedAt && ` · Último error: ${fmtDate(t.lastFailedAt)}${t.lastErrorMsg ? ` (${t.lastErrorMsg.slice(0, 60)})` : ''}`}
                </p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => move(t.id, 'up')} disabled={idx === 0} title="Subir prioridad" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors text-gray-500">▲</button>
                <button onClick={() => move(t.id, 'down')} disabled={idx === tokens.length - 1} title="Bajar prioridad" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors text-gray-500">▼</button>
                <button onClick={() => handleToggle(t.id)} title={t.active ? 'Desactivar' : 'Reactivar'} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline px-2">
                  {t.active ? 'Desactivar' : 'Reactivar'}
                </button>
                <button onClick={() => setDeleteId(t.id)} title="Eliminar" className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors">🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de alta */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setAddOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Agregar token de Apify</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">El valor se cifra al guardarse y no se vuelve a mostrar.</p>
            <div className="space-y-3">
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Nombre (ej: Cuenta principal)"
                autoFocus
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <input
                type="password"
                value={newToken}
                onChange={e => setNewToken(e.target.value)}
                placeholder="Token de Apify"
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setAddOpen(false)} className="flex-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg py-2 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200">Cancelar</button>
              <button onClick={handleCreate} disabled={saving || !newLabel.trim() || !newToken.trim()} className="flex-1 text-sm bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg py-2 font-medium transition-colors">
                {saving ? 'Guardando…' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteId}
        title="¿Eliminar token?"
        message={
          isOnlyActiveToken
            ? `"${deleteTarget?.label}" es la única cuenta activa. Si la borrás, el scraping cae al fallback de variables de entorno (si existen) o falla.`
            : `"${deleteTarget?.label}" será eliminado permanentemente. El historial de uso ya registrado se conserva.`
        }
        confirmLabel="Eliminar"
        loading={deleting}
        onConfirm={() => handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}

export function SectionScraping() {
  const [tokens,         setTokens]         = useState([])
  const [tokensLoading,  setTokensLoading]  = useState(true)
  const [accounts,       setAccounts]       = useState(null)
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [usage,          setUsage]          = useState(null)
  const [usageLoading,   setUsageLoading]   = useState(true)
  const [period,         setPeriod]         = useState('all')
  const [expanded,       setExpanded]       = useState(null)

  const loadTokens = useCallback(async () => {
    setTokensLoading(true)
    try {
      const { data } = await api.get('/superadmin/apify-tokens')
      setTokens(data)
    } finally { setTokensLoading(false) }
  }, [])

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const { data } = await api.get('/superadmin/apify-accounts-usage')
      setAccounts(data)
    } finally { setAccountsLoading(false) }
  }, [])

  const loadUsage = useCallback(async (p) => {
    setUsageLoading(true)
    try {
      const { data } = await api.get(`/superadmin/apify-usage?period=${p}`)
      setUsage(data)
    } finally { setUsageLoading(false) }
  }, [])

  useEffect(() => { loadTokens(); loadAccounts() }, [loadTokens, loadAccounts])
  useEffect(() => { loadUsage(period) }, [loadUsage, period])

  function handleTokensChanged() {
    loadTokens()
    loadAccounts()
  }

  const maxFnCalls = usage?.byFunction?.[0]?.calls ?? 1
  const maxWsCalls = usage?.byWorkspace?.[0]?.calls ?? 1

  const periodTabs = [
    { id: 'all', label: 'Todo el tiempo' },
    { id: '30d', label: 'Últimos 30 días' },
    { id: '7d',  label: 'Últimos 7 días' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Scraping</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Consumo de Apify por workspace, proyecto y función, gasto real en USD por cuenta, y gestión de tokens/actores.
        </p>
      </div>

      <AccountsUsagePanel accounts={accounts} loading={accountsLoading} onRefresh={loadAccounts} />
      <TokensPanel tokens={tokens} loading={tokensLoading} onChanged={handleTokensChanged} />

      <SectionSettings groupOrder={['scraping']} />

      {/* Breakdown de llamados */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Distribución de llamados</h3>
        <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-700 p-1 rounded-xl">
          {periodTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setPeriod(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                period === t.id
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {usageLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !usage ? (
        <p className="text-sm text-red-500 text-center py-8">Error al cargar el consumo de Apify.</p>
      ) : usage.totalCalls === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-12 text-center">
          <p className="text-3xl mb-2">🕸️</p>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sin llamados a Apify registrados para este período.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Llamados totales</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmtTokens(usage.totalCalls)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Errores</p>
              <p className="text-2xl font-bold text-red-500">{fmtTokens(usage.totalErrors)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {usage.totalCalls > 0 ? `${Math.round((usage.totalErrors / usage.totalCalls) * 100)}% del total` : '—'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Workspace top</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white mt-1 truncate">{usage.byWorkspace?.[0]?.name ?? '—'}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {usage.byWorkspace?.[0] ? `${fmtTokens(usage.byWorkspace[0].calls)} llamados` : 'sin datos'}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Función top</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white mt-1 truncate">
                {usage.byFunction?.[0] ? `${platformLabel(usage.byFunction[0].platform)} · ${actionLabel(usage.byFunction[0].action)}` : '—'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {usage.byFunction?.[0] ? `${fmtTokens(usage.byFunction[0].calls)} llamados` : 'sin datos'}
              </p>
            </div>
          </div>

          {/* Uso por función */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Uso por plataforma y función</h3>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                Una conexión/refresh de Instagram puede generar 2 llamados (perfil + posts) — "llamados" no equivale 1:1 a acciones del usuario.
              </p>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {usage.byFunction.map(fn => (
                <div key={`${fn.platform}::${fn.action}`} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-48 flex-shrink-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{platformLabel(fn.platform)} · {actionLabel(fn.action)}</p>
                  </div>
                  <TokenBar value={fn.calls} max={maxFnCalls} />
                  <div className="text-right flex-shrink-0 w-28">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmtTokens(fn.calls)}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{fn.errors > 0 ? `${fn.errors} error${fn.errors !== 1 ? 'es' : ''}` : 'sin errores'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ranking por workspace, expandible a proyecto */}
          {usage.byWorkspace.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Ranking por workspace
                  <span className="ml-2 text-xs font-normal text-gray-400">({usage.byWorkspace.length} con actividad)</span>
                </h3>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {usage.byWorkspace.map((ws, idx) => (
                  <div key={ws.workspaceId ?? 'none'}>
                    <button
                      className="w-full px-5 py-3 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors text-left"
                      onClick={() => setExpanded(prev => prev === ws.workspaceId ? null : ws.workspaceId)}
                    >
                      <span className="w-5 flex-shrink-0 text-xs font-bold text-gray-300 dark:text-gray-600 tabular-nums">{idx + 1}</span>
                      <div className="w-40 flex-shrink-0 min-w-0">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{ws.name}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">{ws.slug}</p>
                      </div>
                      <TokenBar value={ws.calls} max={maxWsCalls} />
                      <div className="text-right flex-shrink-0 w-28">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmtTokens(ws.calls)}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">{ws.errors > 0 ? `${ws.errors} error${ws.errors !== 1 ? 'es' : ''}` : 'sin errores'}</p>
                      </div>
                      <span className={`flex-shrink-0 text-gray-400 text-xs transition-transform duration-200 ${expanded === ws.workspaceId ? 'rotate-180' : ''}`}>▾</span>
                    </button>

                    {expanded === ws.workspaceId && (
                      <div className="bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700">
                        {ws.byProject.map(p => (
                          <div key={p.projectId ?? 'none'} className="px-5 py-2 pl-12 flex items-center gap-4">
                            <div className="w-40 flex-shrink-0">
                              <p className="text-xs text-gray-600 dark:text-gray-400">{p.name}</p>
                            </div>
                            <TokenBar value={p.calls} max={ws.calls} color="bg-primary-300 dark:bg-primary-700" />
                            <div className="text-right flex-shrink-0 w-28">
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{fmtTokens(p.calls)}</p>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500">{p.errors > 0 ? `${p.errors} error${p.errors !== 1 ? 'es' : ''}` : 'sin errores'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
