import { useState, useEffect } from 'react'
import api from '../../api/client'
import { timeAgo } from './shared'

export const SETTINGS_GROUP_LABELS = {
  commercial:  'Comercial',
  operational: 'Operativo',
  scraping:    'Scraping',
  platform:    'Notificaciones',
}

export const SETTINGS_GROUP_ORDER = ['commercial', 'operational', 'scraping', 'platform']

export const RETENTION_KEYS_FE = [
  'notificationReadRetentionDays',
  'notificationUnreadRetentionDays',
  'aiTokenLogsRetentionDays',
  'loginHistoryRetentionDays',
  'dailyInsightRetentionDays',
  'emailLogRetentionDays',
  'socialImageOrphanRetentionDays',
]

export const SENSITIVE_KEYS = new Set(['pricingTiers', 'haikuInputCostPer1M', 'haikuOutputCostPer1M'])

export const RETENTION_TABLE = {
  notificationReadRetentionDays:   'notifications',
  notificationUnreadRetentionDays: 'notifications',
  aiTokenLogsRetentionDays:        'aiTokenLog',
  loginHistoryRetentionDays:       'userLogin',
  dailyInsightRetentionDays:       'dailyInsight',
  emailLogRetentionDays:           'emailLog',
  socialImageOrphanRetentionDays:  'socialImages',
}

export function fmtSettingValue(s, value) {
  if (s.type === 'pricingTiers') {
    return value.map(t => `${t.upTo == null ? '20+' : `1–${t.upTo}`}: $${t.pricePerSeat}`).join(' · ')
  }
  return String(value)
}

export function PricingTiersEditor({ value, onChange }) {
  const tiers = Array.isArray(value) ? value : []

  function update(i, key, raw) {
    const next = tiers.map((t, idx) => {
      if (idx !== i) return t
      if (key === 'upTo')         return { ...t, upTo: raw === '' || raw === null ? null : Math.max(1, parseInt(raw, 10) || 0) }
      if (key === 'pricePerSeat') return { ...t, pricePerSeat: Math.max(0, parseFloat(raw) || 0) }
      return t
    })
    onChange(next)
  }
  function addTier() {
    onChange([...tiers, { upTo: 100, pricePerSeat: 1 }])
  }
  function removeTier(i) {
    onChange(tiers.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2">
      {tiers.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-12">Hasta</span>
          <input
            type="number"
            value={t.upTo ?? ''}
            placeholder="∞"
            onChange={e => update(i, 'upTo', e.target.value)}
            className="w-24 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">seats · $</span>
          <input
            type="number"
            step="0.01"
            value={t.pricePerSeat}
            onChange={e => update(i, 'pricePerSeat', e.target.value)}
            className="w-24 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">/ seat / mes</span>
          {tiers.length > 1 && (
            <button onClick={() => removeTier(i)} title="Eliminar tier"
              className="ml-auto text-xs text-red-500 hover:text-red-700">✕</button>
          )}
        </div>
      ))}
      <button onClick={addTier}
        className="text-xs text-primary-600 dark:text-primary-400 hover:underline">+ Agregar tier</button>
      <p className="text-xs text-amber-600 dark:text-amber-400 leading-snug">
        ⚠ Cambiar los tiers acá no actualiza Stripe. Tenés que sincronizar manualmente en el dashboard de Stripe.
      </p>
    </div>
  )
}

export function SettingInput({ setting, draft, onChange }) {
  const value = draft

  if (setting.type === 'pricingTiers') {
    return <PricingTiersEditor value={value} onChange={onChange} />
  }
  if (setting.type === 'boolean') {
    return (
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
        aria-pressed={!!value}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    )
  }
  if (setting.type === 'integer' || setting.type === 'float') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={setting.type === 'float' ? '0.01' : '1'}
          value={value ?? ''}
          min={setting.min ?? undefined}
          max={setting.max ?? undefined}
          onChange={e => onChange(setting.type === 'integer' ? parseInt(e.target.value, 10) : parseFloat(e.target.value))}
          className="w-32 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
        {(setting.min != null || setting.max != null) && (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            ({setting.min ?? '-∞'} – {setting.max ?? '∞'})
          </span>
        )}
      </div>
    )
  }
  return <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)}
    className="w-64 text-sm border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
  />
}

export function SectionSettings() {
  const [settings, setSettings] = useState([])
  const [drafts,   setDrafts]   = useState({})       // key → value editado
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [logs,     setLogs]     = useState([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [cleanupPreview, setCleanupPreview] = useState(null)
  const [cleanupRunning, setCleanupRunning] = useState(false)
  const [activeGroup, setActiveGroup] = useState('commercial')

  async function load() {
    setLoading(true)
    try {
      const { data } = await api.get('/superadmin/settings')
      setSettings(data.settings)
      setDrafts(Object.fromEntries(data.settings.map(s => [s.key, s.value])))
    } finally { setLoading(false) }
  }

  async function loadLogs() {
    const { data } = await api.get('/superadmin/settings/log?limit=20')
    setLogs(data.logs)
  }

  useEffect(() => { load() }, [])

  const dirty = settings.filter(s => JSON.stringify(s.value) !== JSON.stringify(drafts[s.key]))
  const hasChanges = dirty.length > 0
  const hasLoweredRetention = dirty.some(s =>
    RETENTION_KEYS_FE.includes(s.key) && (drafts[s.key] < s.value)
  )

  async function previewCleanup() {
    const loweredKeys = dirty.filter(s => RETENTION_KEYS_FE.includes(s.key) && drafts[s.key] < s.value).map(s => s.key)
    const tables = [...new Set(loweredKeys.map(k => RETENTION_TABLE[k]))].join(',')
    if (!tables) { setCleanupPreview(null); return }
    const { data } = await api.get(`/superadmin/settings/cleanup-preview?tables=${tables}`)
    setCleanupPreview(data.preview)
  }

  async function runCleanup() {
    if (!cleanupPreview) return
    const tables = Object.keys(cleanupPreview)
    const totalRows = Object.values(cleanupPreview).reduce((a, b) => a + b, 0)
    if (!window.confirm(`Eliminar ${totalRows} fila(s) ahora? Esta acción no se puede deshacer.`)) return
    setCleanupRunning(true)
    try {
      const { data } = await api.post('/superadmin/settings/cleanup-now', { tables })
      const total = Object.values(data.deleted).reduce((a, b) => a + b, 0)
      window.alert(`Eliminadas ${total} fila(s).`)
      setCleanupPreview(null)
    } catch (err) {
      window.alert(`Error: ${err.response?.data?.error || err.message}`)
    } finally {
      setCleanupRunning(false)
    }
  }

  async function save() {
    if (!hasChanges) return

    // Confirmación adicional para campos sensibles
    const sensitive = dirty.filter(s => SENSITIVE_KEYS.has(s.key))
    if (sensitive.length > 0) {
      const summary = sensitive.map(s => `• ${s.label}\n   ${fmtSettingValue(s, s.value)} → ${fmtSettingValue(s, drafts[s.key])}`).join('\n\n')
      if (!window.confirm(`Estás por modificar settings sensibles:\n\n${summary}\n\n¿Continuar?`)) return
    }

    setSaving(true)
    try {
      const changes = Object.fromEntries(dirty.map(s => [s.key, drafts[s.key]]))
      await api.put('/superadmin/settings', { changes })
      await load()
      if (logsOpen) await loadLogs()
    } catch (err) {
      const details = err.response?.data?.details
      const msg = details ? Object.entries(details).map(([k, v]) => `${k}: ${v}`).join('\n') : (err.response?.data?.error || err.message)
      window.alert(`Error al guardar:\n${msg}`)
    } finally {
      setSaving(false)
    }
  }

  function discard() {
    setDrafts(Object.fromEntries(settings.map(s => [s.key, s.value])))
    setCleanupPreview(null)
  }

  function toggleLogs() {
    if (!logsOpen) loadLogs()
    setLogsOpen(o => !o)
  }

  if (loading) {
    return <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-400 text-sm">Cargando...</div>
  }

  const groups = SETTINGS_GROUP_ORDER
    .map(g => ({
      id:    g,
      label: SETTINGS_GROUP_LABELS[g],
      items: settings.filter(s => s.group === g),
    }))
    .filter(g => g.items.length > 0)

  // Si el grupo activo quedó vacío (datos viejos), cae al primero disponible.
  const visibleGroups = groups.some(g => g.id === activeGroup)
    ? groups.filter(g => g.id === activeGroup)
    : groups.slice(0, 1)

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white">Configuración global</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Ajustes operativos y comerciales de la plataforma. Los cambios aplican inmediatamente (caché 60s).
        </p>
      </div>

      {/* Navegación por subsecciones */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur-sm">
        <div className="flex flex-wrap gap-2">
          {groups.map(group => {
            const groupDirty = dirty.filter(s => group.items.some(i => i.key === s.key)).length
            const isActive = group.id === activeGroup
            return (
              <button
                key={group.id}
                onClick={() => setActiveGroup(group.id)}
                className={`text-sm px-3 py-1.5 rounded-full font-medium transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-primary-300 dark:hover:border-primary-700'
                }`}
              >
                {group.label}
                {groupDirty > 0 && (
                  <span className={`text-xs px-1.5 rounded-full ${isActive ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                    {groupDirty}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {visibleGroups.map(group => (
        <div key={group.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">{group.label}</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {group.items.map(s => {
              const isDirty = JSON.stringify(s.value) !== JSON.stringify(drafts[s.key])
              return (
                <div key={s.key} className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-sm font-medium text-gray-900 dark:text-white">{s.label}</label>
                      {isDirty && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-medium">
                          Modificado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug mt-1">{s.help}</p>
                  </div>
                  <div className="flex-shrink-0">
                    <SettingInput setting={s} draft={drafts[s.key]} onChange={v => setDrafts(d => ({ ...d, [s.key]: v }))} />
                    {s.updatedAt && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">
                        Actualizado {timeAgo(s.updatedAt)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Barra de acciones sticky */}
      {hasChanges && (
        <div className="sticky bottom-4 bg-white dark:bg-gray-800 rounded-2xl border border-primary-300 dark:border-primary-700 shadow-lg p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {dirty.length} cambio{dirty.length !== 1 ? 's' : ''} sin guardar
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {dirty.map(s => s.label).join(' · ')}
            </p>
          </div>
          {hasLoweredRetention && (
            <button onClick={previewCleanup} disabled={cleanupRunning}
              className="text-sm px-3 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-300 font-medium disabled:opacity-50">
              Preview limpieza
            </button>
          )}
          <button onClick={discard} disabled={saving}
            className="text-sm px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 font-medium disabled:opacity-50">
            Descartar
          </button>
          <button onClick={save} disabled={saving}
            className="text-sm px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      )}

      {/* Preview de limpieza */}
      {cleanupPreview && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Limpieza pendiente</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            Bajaste retention. El cron del domingo aplicará el nuevo valor, pero podés ejecutarlo ahora:
          </p>
          <ul className="text-sm text-gray-800 dark:text-gray-200 mb-4 space-y-1">
            {Object.entries(cleanupPreview).map(([table, count]) => (
              <li key={table}>• <strong>{count.toLocaleString()}</strong> fila(s) en <code className="text-xs">{table}</code></li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button onClick={runCleanup} disabled={cleanupRunning}
              className="text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50">
              {cleanupRunning ? 'Ejecutando…' : 'Aplicar limpieza ahora'}
            </button>
            <button onClick={() => setCleanupPreview(null)}
              className="text-sm px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Historial de cambios */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
        <button onClick={toggleLogs}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
          <span className="font-semibold text-gray-900 dark:text-white">Historial de cambios</span>
          <span className="text-sm text-gray-400 dark:text-gray-500">{logsOpen ? '▾' : '▸'}</span>
        </button>
        {logsOpen && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            {logs.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">Sin cambios registrados todavía.</div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {logs.map(log => (
                  <div key={log.id} className="px-5 py-3 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{log.settingKey}</code>
                      <span className="text-gray-500 dark:text-gray-400">por <strong className="text-gray-700 dark:text-gray-200">{log.changedBy?.name || `User #${log.changedById}`}</strong></span>
                      <span className="text-xs text-gray-400 ml-auto">{timeAgo(log.createdAt)}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                      {log.oldValue ? <>de <code className="text-gray-700 dark:text-gray-300">{JSON.stringify(log.oldValue.value)}</code></> : <em>(inicial)</em>}
                      {' → '}
                      <code className="text-gray-900 dark:text-gray-100">{JSON.stringify(log.newValue.value)}</code>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Section: Storage (DB size + limpieza de imágenes huérfanas) ─────────────

