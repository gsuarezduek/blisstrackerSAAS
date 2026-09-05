import { useState, useEffect, useMemo } from 'react'
import api from '../../api/client'
import ProjectSearchSelect from './ProjectSearchSelect'
import {
  SECTION_CATALOG, IntegrationChip,
  prevMonthStr, monthLabel, monthFirstDay, monthLastDay, todayYmd, dmy,
} from './InformesTabParts'

// ─── Modal de generación (selección de secciones) ──────────────────────────────

export function GenerateModal({ projectId, month, availableSections: initialAvailable, initialSelected, initialPeriod, onGenerate, onClose, generating }) {
  const [available, setAvailable]   = useState(initialAvailable)
  const [refreshing, setRefreshing] = useState(false)

  // ── Período de datos del informe ──
  const prevMonth = prevMonthStr(month)
  // Si el informe ya tenía un rango elegido, reabrir en "Personalizado" con esas fechas
  const [preset, setPreset] = useState(initialPeriod?.start ? 'custom' : 'prev')
  const [customStart, setCustomStart] = useState(initialPeriod?.start || monthFirstDay(prevMonth))
  const [customEnd,   setCustomEnd]   = useState(initialPeriod?.end   || monthLastDay(prevMonth))

  const period = useMemo(() => {
    if (preset === 'prev')       { const pm = prevMonthStr(month); return { start: monthFirstDay(pm), end: monthLastDay(pm) } }
    if (preset === 'thisToDate') return { start: monthFirstDay(month), end: todayYmd() }
    if (preset === 'last3') {
      const endM = prevMonthStr(month)
      let s = endM; for (let i = 0; i < 2; i++) s = prevMonthStr(s)
      return { start: monthFirstDay(s), end: monthLastDay(endM) }
    }
    return { start: customStart, end: customEnd }
  }, [preset, month, customStart, customEnd])

  const periodInvalid = !period.start || !period.end || period.start > period.end

  // Refresca el estado de conexión al abrir (por si se reconectó algo en otra pestaña)
  async function refreshStatus() {
    setRefreshing(true)
    try {
      const res = await api.get(`/marketing/projects/${projectId}/report-sections`)
      setAvailable(res.data.availableSections)
    } catch { /* mantenemos el estado inicial */ }
    finally { setRefreshing(false) }
  }
  useEffect(() => { refreshStatus() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Solo se ofrecen las secciones con datos/fuente disponible
  const offered = SECTION_CATALOG.filter(s => available?.[s.key]?.available)

  const [selected, setSelected] = useState(() => {
    const base = Array.isArray(initialSelected)
      ? SECTION_CATALOG.filter(s => initialSelected.includes(s.key)).map(s => s.key)
      : SECTION_CATALOG.filter(s => initialAvailable?.[s.key]?.available).map(s => s.key)  // por defecto: todas las disponibles
    return new Set(base)
  })

  function toggle(key) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const allChecked = offered.length > 0 && offered.every(s => selected.has(s.key))
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(offered.map(s => s.key)))
  }

  // Secciones seleccionadas cuya integración está caída → aviso para reconectar
  const expiredSelected = offered.filter(s => selected.has(s.key) && available?.[s.key]?.integration === 'expired')

  // ── Chequeo de disponibilidad antes de generar ──
  // Antes de generar de verdad, corre un chequeo en vivo (RRSS: asegura el snapshot
  // del mes; Ads: ping con el rango real) — así una integración caída se descubre acá,
  // con un mensaje claro y la chance de reintentar, en vez de colarse en el informe.
  const [checking,     setChecking]     = useState(false)
  const [checkResults, setCheckResults] = useState(null) // null = sin chequear todavía (o hay que rechequear)
  const selectedKey = [...selected].sort().join(',')
  useEffect(() => { setCheckResults(null) }, [selectedKey, period.start, period.end])

  async function runCheck() {
    setChecking(true)
    let results = []
    try {
      const res = await api.post(`/marketing/projects/${projectId}/reports/${month}/check-readiness`, {
        enabledSections: [...selected], periodStart: period.start, periodEnd: period.end,
      })
      results = res.data.results || []
    } catch { /* si el chequeo en sí falla, no bloqueamos — se genera igual */ }
    setChecking(false)
    return results
  }

  async function handlePrimaryClick() {
    if (checkResults?.some(r => !r.ok)) {
      // ya se chequeó y hay fallas: este click es "generar igual"
      onGenerate([...selected], { periodStart: period.start, periodEnd: period.end })
      return
    }
    const results = await runCheck()
    const failed = results.filter(r => !r.ok)
    if (failed.length === 0) {
      onGenerate([...selected], { periodStart: period.start, periodEnd: period.end })
    } else {
      setCheckResults(results)
    }
  }

  const failedChecks = checkResults?.filter(r => !r.ok) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">📄 Generar informe</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Elegí el período de datos y qué secciones incluir. Solo se muestran las secciones con datos o fuente conectada. Las que dejes sin marcar no se generan ni aparecen en el link del cliente.
        </p>

        {/* ── Período de datos ── */}
        <div className="mb-4 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">📅 Período de datos</p>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {[
              { k: 'prev',       label: `Mes anterior (${monthLabel(prevMonth)})` },
              { k: 'thisToDate', label: 'Este mes hasta hoy' },
              { k: 'last3',      label: 'Últimos 3 meses' },
              { k: 'custom',     label: 'Personalizado' },
            ].map(p => (
              <button
                key={p.k}
                onClick={() => setPreset(p.k)}
                className={`text-[11px] px-2 py-1.5 rounded-lg border transition-colors text-left capitalize ${
                  preset === p.k
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium'
                    : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/60'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2 mb-2">
              <input type="date" value={customStart} max={customEnd || undefined} onChange={e => setCustomStart(e.target.value)}
                className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200" />
              <span className="text-gray-400 text-xs">al</span>
              <input type="date" value={customEnd} min={customStart || undefined} onChange={e => setCustomEnd(e.target.value)}
                className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200" />
            </div>
          )}

          {periodInvalid ? (
            <p className="text-[11px] text-red-600 dark:text-red-400">La fecha de inicio no puede ser posterior a la de fin.</p>
          ) : (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Datos del <strong>{dmy(period.start)}</strong> al <strong>{dmy(period.end)}</strong>.
              {period.end >= todayYmd() && (
                <span className="text-amber-600 dark:text-amber-400"> Incluye días del mes en curso: las RRSS pueden ser aproximadas (datos en vivo).</span>
              )}
            </p>
          )}
        </div>

        {offered.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Este proyecto todavía no tiene datos ni integraciones para armar un informe.
            <br />Conectá una fuente (web, RRSS, Ads…) y volvé a intentarlo.
          </div>
        ) : (
          <>
            {expiredSelected.length > 0 && (
              <div className="mb-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                ⚠️ Hay secciones desconectadas: <strong>{expiredSelected.map(s => s.label).join(', ')}</strong>. Reconectalas desde su pestaña en Marketing para incluir datos actualizados (sin reconectar, el informe usa los últimos datos guardados o queda incompleto).
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <button
                onClick={toggleAll}
                className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                {allChecked ? 'Desmarcar todas' : 'Marcar todas'}
              </button>
              <button
                onClick={refreshStatus}
                disabled={refreshing}
                className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
              >
                {refreshing ? 'Actualizando…' : '🔄 Actualizar estado'}
              </button>
            </div>

            <div className="space-y-1 overflow-y-auto pr-1">
              {offered.map(s => {
                const integration = available?.[s.key]?.integration
                return (
                  <label
                    key={s.key}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(s.key)}
                      onChange={() => toggle(s.key)}
                      className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-base leading-none">{s.icon}</span>
                    <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0">{s.label}</span>
                    <IntegrationChip integration={integration} />
                  </label>
                )
              })}
            </div>
          </>
        )}

        {failedChecks.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">⚠️ No se pudo confirmar {failedChecks.length === 1 ? 'esta sección' : 'estas secciones'} ahora mismo:</p>
            <ul className="space-y-0.5 mb-1.5">
              {failedChecks.map(r => <li key={r.section}>• <strong>{r.label}</strong>: {r.message}</li>)}
            </ul>
            <p>Podés generar igual (esas secciones quedarán con datos anteriores o vacías) o reintentar el chequeo.</p>
            <button onClick={runCheck} disabled={checking} className="mt-1.5 font-medium underline disabled:opacity-50">
              {checking ? 'Verificando…' : '🔄 Reintentar chequeo'}
            </button>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handlePrimaryClick}
            disabled={generating || checking || selected.size === 0 || periodInvalid}
            className={`flex-1 py-2 text-sm text-white rounded-xl font-medium transition-colors disabled:opacity-50 ${
              failedChecks.length > 0 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-primary-600 hover:bg-primary-700'
            }`}
          >
            {generating ? 'Generando…' : checking ? 'Verificando datos…' : failedChecks.length > 0 ? 'Generar igual' : 'Generar informe'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de configuración de secciones (rueda "⚙️", por proyecto) ────────────
// Define qué secciones de Marketing están habilitadas para ofrecer al generar el
// informe de este proyecto (ej: un proyecto sin web no ofrece "Performance web"/"GEO").
// Si se abre sin proyecto seleccionado, primero pide elegir uno.
export function SectionsConfigModal({ projects, initialProjectId, onClose }) {
  const [pid,     setPid]     = useState(initialProjectId || '')
  const [loading, setLoading] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)
  const [config,   setConfig]   = useState(null) // { projectName, services, sections }
  const [selected, setSelected] = useState(new Set())

  useEffect(() => {
    if (!pid) { setConfig(null); return }
    setLoading(true)
    setError(null)
    api.get(`/marketing/projects/${pid}/report-sections-config`)
      .then(r => {
        setConfig(r.data)
        setSelected(new Set(r.data.sections))
      })
      .catch(() => setError('No se pudo cargar la configuración de este proyecto.'))
      .finally(() => setLoading(false))
  }, [pid])

  function toggle(key) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const allChecked = SECTION_CATALOG.every(s => selected.has(s.key))
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(SECTION_CATALOG.map(s => s.key)))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/marketing/projects/${pid}/report-sections-config`, { sections: [...selected] })
      onClose()
    } catch {
      setError('No se pudo guardar la configuración.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">⚙️ Secciones del informe</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        {!pid ? (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Elegí el proyecto que querés configurar.
            </p>
            <ProjectSearchSelect projects={projects} value={pid} onChange={setPid} placeholder="Buscar proyecto…" />
          </>
        ) : loading ? (
          <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : error && !config ? (
          <p className="text-sm text-red-500 dark:text-red-400 py-6 text-center">{error}</p>
        ) : config ? (
          <>
            <div className="mb-3">
              {!initialProjectId && (
                <button onClick={() => setPid('')} className="text-xs text-primary-600 dark:text-primary-400 hover:underline mb-2">
                  ← Cambiar proyecto
                </button>
              )}
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{config.projectName}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {config.services.length
                  ? `Servicios: ${config.services.map(s => s.name).join(', ')}`
                  : 'Sin servicios asociados'}
              </p>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Elegí qué secciones de Marketing están disponibles para este proyecto. Las que desmarques no se van a poder incluir al generar el informe.
            </p>

            <div className="flex items-center justify-between mb-2">
              <button onClick={toggleAll} className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
                {allChecked ? 'Desmarcar todas' : 'Marcar todas'}
              </button>
            </div>

            {error && <p className="text-xs text-red-500 dark:text-red-400 mb-2">{error}</p>}

            <div className="space-y-1 overflow-y-auto pr-1">
              {SECTION_CATALOG.map(s => (
                <label
                  key={s.key}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.key)}
                    onChange={() => toggle(s.key)}
                    className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-base leading-none">{s.icon}</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0">{s.label}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ─── Popup tras publicar: ofrece avisar al cliente por email ──────────────────
// Se abre solo al pasar de borrador a publicado (nunca al despublicar). El envío
// requiere portal de cliente activo con contactos — mismo criterio que "Pedir
// aprobación" de Contenido; si falta algo, el error del backend lo explica acá.
export function PublishNotifyModal({ projectId, month, contacts = [], onClose }) {
  const [state, setState] = useState('idle') // 'idle' | 'sending' | 'sent' | 'error'
  const [error, setError] = useState('')
  const activeContacts = contacts.filter(c => c.active)

  async function handleSend() {
    setState('sending')
    setError('')
    try {
      await api.post(`/marketing/projects/${projectId}/reports/${month}/notify`)
      setState('sent')
    } catch (err) {
      setState('error')
      setError(err.response?.data?.error || 'No se pudo enviar el aviso')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        {state === 'sent' ? (
          <>
            <p className="text-4xl mb-3">📨</p>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Aviso enviado</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Le avisamos por email a los contactos del portal de este proyecto.</p>
            <button onClick={onClose} className="w-full py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors">
              Listo
            </button>
          </>
        ) : (
          <>
            <p className="text-4xl mb-3">✅</p>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Informe publicado</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">¿Querés avisarle a tu cliente por email de que ya está disponible?</p>

            {activeContacts.length > 0 ? (
              <div className="text-left bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 mb-3 max-h-32 overflow-y-auto">
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">Le va a llegar a:</p>
                <ul className="space-y-0.5">
                  {activeContacts.map(c => (
                    <li key={c.id} className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {c.name || c.email}
                      {c.name && <span className="text-gray-400 dark:text-gray-500"> · {c.email}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">No hay contactos activos configurados en el portal de este proyecto.</p>
            )}

            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-4">
              ¿Falta alguien o querés cambiar los destinatarios? Se administra desde Proyecto → Info → Portal Cliente.
            </p>

            {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Ahora no
              </button>
              <button
                onClick={handleSend}
                disabled={state === 'sending' || activeContacts.length === 0}
                className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
              >
                {state === 'sending' ? 'Enviando…' : 'Sí, avisar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
