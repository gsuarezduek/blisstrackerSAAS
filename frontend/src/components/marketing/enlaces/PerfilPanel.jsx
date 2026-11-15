import { useState } from 'react'
import api from '../../../api/client'
import DomainRatingCard from '../seo/DomainRatingCard'
import { fmtDateShort, fmtNum, REPORTED_SOURCES, sourceLabel } from './enlacesHelpers'

/**
 * El perfil de enlaces: lo que tenemos cargado contra lo que dice la herramienta.
 *
 * La brecha entre las dos columnas ES el dato: Ahrefs dice 412 dominios de
 * referencia y nuestro inventario tiene 37, así que sabemos que estamos
 * vigilando el 9% del perfil. Ese número no se puede derivar de nada nuestro —
 * existe solo porque alguien lo leyó y lo cargó.
 */
export default function PerfilPanel({ projectId, profile, loading, onReload }) {
  const [showForm, setShowForm] = useState(false)

  if (loading) return <p className="text-sm text-gray-400 dark:text-gray-500">Cargando el perfil…</p>
  if (!profile) return null

  const { live, readings = [], snapshots = [], totalLinks } = profile
  const last = readings[0]
  const coverage = last?.reportedDomains ? Math.round((live.referringDomains / last.reportedDomains) * 100) : null

  return (
    <div className="space-y-4">
      <DomainRatingCard projectId={projectId} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Enlaces activos"      value={fmtNum(live.activeLinks)} hint={`${fmtNum(totalLinks)} cargados en total`} />
        <Kpi label="Dominios de referencia" value={fmtNum(live.referringDomains)} hint="Sitios distintos que nos enlazan" />
        <Kpi label="Follow"               value={fmtNum(live.followLinks)} hint="Los que transmiten autoridad" />
        <Kpi label="DR promedio"          value={live.avgDomainRating ?? '—'} hint="De los dominios que sabemos" />
      </div>

      {/* La comparación con la herramienta externa */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Nuestro inventario vs. la herramienta</h4>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Ahrefs y Semrush descubren todo el perfil; acá vigilamos lo que cargamos. La diferencia dice cuánto falta cargar.
            </p>
          </div>
          <button onClick={() => setShowForm(v => !v)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            {showForm ? 'Cancelar' : '+ Registrar lectura'}
          </button>
        </div>

        {showForm && (
          <ReadingForm projectId={projectId} onClose={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); onReload?.() }} />
        )}

        {last ? (
          <div className="mt-3 flex items-center gap-6 flex-wrap">
            <div>
              <span className="text-2xl font-bold text-gray-800 dark:text-gray-100">{fmtNum(live.referringDomains)}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">nuestros</span>
            </div>
            <span className="text-gray-300 dark:text-gray-600">de</span>
            <div>
              <span className="text-2xl font-bold text-gray-500 dark:text-gray-400">{fmtNum(last.reportedDomains)}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">según {sourceLabel(last.reportedSource)}</span>
            </div>
            {coverage != null && (
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                coverage >= 60 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                : coverage >= 25 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                {coverage}% cargado
              </span>
            )}
            <span className="text-[11px] text-gray-400 dark:text-gray-500">Leído el {fmtDateShort(last.capturedAt)}</span>
          </div>
        ) : (
          !showForm && (
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
              Todavía no se registró ninguna lectura. Abrí Ahrefs o Semrush, mirá los dominios de referencia y cargalos acá para tener el punto de partida.
            </p>
          )
        )}
      </div>

      {/* Lecturas acumuladas: nunca se pisan, dos fuentes del mismo mes conviven */}
      {readings.length > 1 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Lecturas anteriores</h4>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {readings.map(r => (
              <div key={r.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                <span className="text-gray-500 dark:text-gray-400 w-28 shrink-0">{fmtDateShort(r.capturedAt)}</span>
                <span className="text-gray-400 dark:text-gray-500 w-24 shrink-0">{sourceLabel(r.reportedSource)}</span>
                <span className="text-gray-700 dark:text-gray-200 flex-1">
                  {fmtNum(r.reportedDomains)} dominios · {fmtNum(r.reportedLinks)} enlaces
                </span>
                <span className="text-gray-400 dark:text-gray-500 shrink-0">
                  nuestro: {fmtNum(r.ownDomains)}
                </span>
                {(r.createdByAgent || r.createdBy) && (
                  <span className="text-gray-400 dark:text-gray-500 shrink-0 hidden sm:inline">
                    {r.createdByAgent ? `vía ${r.createdByAgentName || r.createdByAgent.label}` : r.createdBy.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {snapshots.length >= 2 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Evolución mensual</h4>
          <div className="flex items-end gap-2 h-24">
            {snapshots.map(s => {
              const max = Math.max(...snapshots.map(x => x.referringDomains), 1)
              return (
                <div key={s.month} className="flex-1 flex flex-col items-center gap-1" title={`${s.month}: ${s.referringDomains} dominios`}>
                  <div className="w-full bg-primary-500/80 rounded-t" style={{ height: `${(s.referringDomains / max) * 100}%`, minHeight: 2 }} />
                  <span className="text-[9px] text-gray-400">{s.month.slice(5)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, hint }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-3">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <p className="text-xl font-bold text-gray-800 dark:text-gray-100 mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>}
    </div>
  )
}

/**
 * Los conteos propios no se piden acá: los calcula el backend al guardar, para
 * que la fila se explique sola años después aunque alguien borre enlaces.
 */
function ReadingForm({ projectId, onClose, onSaved }) {
  const [form, setForm] = useState({ reportedDomains: '', reportedLinks: '', reportedSource: 'ahrefs', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.post(`/marketing/projects/${projectId}/backlinks/profile/readings`, form)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo guardar la lectura.')
    } finally { setSaving(false) }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const cls = 'w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <form onSubmit={submit} className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Dominios de referencia</span>
          <input type="number" min="0" value={form.reportedDomains} onChange={e => set('reportedDomains', e.target.value)}
            placeholder="412" className={`${cls} mt-1`} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Backlinks totales</span>
          <input type="number" min="0" value={form.reportedLinks} onChange={e => set('reportedLinks', e.target.value)}
            placeholder="1890" className={`${cls} mt-1`} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">De dónde salió</span>
          <select value={form.reportedSource} onChange={e => set('reportedSource', e.target.value)} className={`${cls} mt-1`}>
            {REPORTED_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={saving || (!form.reportedDomains && !form.reportedLinks)}
          className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
          {saving ? 'Guardando…' : 'Guardar lectura'}
        </button>
      </div>
    </form>
  )
}
