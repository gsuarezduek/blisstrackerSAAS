import { useState, useEffect } from 'react'
import axios from 'axios'
import ReportViewer from '../marketing/ReportViewer'
import { monthLabel } from '../marketing/ReportViewerParts'
import ReportFeedbackWidget from '../marketing/ReportFeedbackWidget'
import { Card, EmptyState, ErrorState, Icon, Segmented, SectionTitle, Skeleton, SecondaryButton } from './portalUi'

const API = import.meta.env.VITE_API_URL || ''
const LIVE_REFRESH_COOLDOWN_MS = 15 * 60 * 1000

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

function ReportSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-36" />
      <div className="grid sm:grid-cols-3 gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      <Skeleton className="h-64" />
    </div>
  )
}

// ─── Informes mensuales ──────────────────────────────────────────────────────

function MonthlyReports({ slug, token, requireReauth, reports, selected, onSelect, brandPrimary, agencyName }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [nonce, setNonce]     = useState(0)

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoading(true); setError(null)
    axios.get(`${API}/api/public/client-portal/${slug}/reports/${selected}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!cancelled) setData(r.data) })
      .catch(err => {
        if (cancelled) return
        if (err.response?.status === 401) requireReauth()
        else { setError(err.response?.data?.error || 'No se pudo cargar el informe.'); setData(null) }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [slug, token, selected, requireReauth, nonce])

  if (reports.length === 0) {
    return <Card><EmptyState icon="reports" title="Todavía no hay informes publicados">Cuando el equipo publique el primero, lo vas a encontrar acá.</EmptyState></Card>
  }

  return (
    <div>
      {/* Selector de período: pills horizontales en vez de un <select> — se ve de un
          vistazo cuántos informes hay y cuál estás mirando. */}
      {reports.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1" role="tablist" aria-label="Período del informe">
          {reports.map((r, i) => {
            const active = r.token === selected
            return (
              <button key={r.token} type="button" role="tab" aria-selected={active} onClick={() => onSelect(r.token)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  active ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {capitalize(monthLabel(r.month))}
                {i === 0 && !active && <span className="ml-1.5 text-[10px] font-semibold uppercase" style={{ color: brandPrimary }}>Nuevo</span>}
              </button>
            )
          })}
        </div>
      )}

      {loading ? <ReportSkeleton /> : error ? (
        <Card><ErrorState message={error} onRetry={() => setNonce(n => n + 1)} /></Card>
      ) : data ? (
        <>
          <ReportViewer data={data.data} isPublic report={data.report} workspace={data.workspace} showFooter={false} compactHero />
          {/* key: resetea el widget (estrellas/comentario) al cambiar de mes */}
          <ReportFeedbackWidget key={selected} token={selected} brandPrimary={brandPrimary} agencyName={agencyName} positionClass="bottom-24 right-4 sm:bottom-6 sm:right-6" />
        </>
      ) : null}
    </div>
  )
}

// ─── Métricas en vivo ────────────────────────────────────────────────────────

function LiveData({ slug, token, requireReauth, workspace }) {
  const [data, setData]         = useState(null)
  const [cachedAt, setCachedAt] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setLoading(true); setError(null)
    axios.get(`${API}/api/public/client-portal/${slug}/live`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { setData(r.data.data); setCachedAt(r.data.cachedAt) })
      .catch(err => {
        if (err.response?.status === 401) requireReauth()
        else setError(err.response?.data?.error || 'No se pudieron cargar las métricas')
      })
      .finally(() => setLoading(false))
  }, [slug, token, requireReauth])

  async function refresh() {
    setRefreshing(true); setError(null)
    try {
      const r = await axios.post(`${API}/api/public/client-portal/${slug}/live/refresh`, {}, { headers: { Authorization: `Bearer ${token}` } })
      setData(r.data.data); setCachedAt(r.data.cachedAt)
    } catch (err) {
      if (err.response?.status === 401) requireReauth()
      else if (err.response?.status === 429) setError(`Podés volver a actualizar en ${err.response.data.waitMins} min.`)
      else setError(err.response?.data?.error || 'No se pudo actualizar')
    } finally { setRefreshing(false) }
  }

  const remaining = cachedAt ? LIVE_REFRESH_COOLDOWN_MS - (Date.now() - new Date(cachedAt).getTime()) : 0
  const canRefresh = remaining <= 0

  return (
    <div>
      <Card className="px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600 flex items-center gap-2">
          <span className="relative flex w-2 h-2"><span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" /><span className="relative w-2 h-2 rounded-full bg-emerald-500" /></span>
          {cachedAt ? `Datos del mes en curso · actualizados el ${new Date(cachedAt).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Datos del mes en curso'}
        </p>
        <SecondaryButton onClick={refresh} disabled={refreshing || !canRefresh} className="!py-1.5 !px-3 text-xs">
          <Icon name="refresh" className="w-3.5 h-3.5" />
          {refreshing ? 'Actualizando…' : canRefresh ? 'Actualizar' : `Disponible en ${Math.ceil(remaining / 60000)} min`}
        </SecondaryButton>
      </Card>
      {error && <p className="text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-2.5 mb-4">{error}</p>}
      {loading ? <ReportSkeleton /> : data
        ? <ReportViewer data={data} isPublic report={null} workspace={workspace} showFooter={false} compactHero />
        : !error && <Card><EmptyState icon="pulse" title="Sin métricas todavía">Tocá «Actualizar» para traer los datos del mes.</EmptyState></Card>}
    </div>
  )
}

/**
 * Sección "Resultados": informes mensuales (lo que el equipo analizó y
 * publicó) + métricas en vivo (el mes en curso, sin análisis). Antes eran dos
 * pestañas de primer nivel ("Informes" y "Datos Actuales") y el cliente no
 * sabía cuál mirar; juntas en una sección dejan claro que son dos cortes del
 * mismo tema.
 */
export default function ClientReportsSection({ slug, token, requireReauth, meta, sub, onSubChange, selectedReport, onSelectReport, brandPrimary }) {
  const reports = meta.reports || []
  const workspace = meta.workspace || null
  const agencyName = workspace?.companyName || workspace?.name || ''
  const hasLive = !!meta.hasLiveSections
  const view = sub === 'vivo' && hasLive ? 'vivo' : (reports.length > 0 || !hasLive ? 'mensuales' : 'vivo')

  return (
    <div>
      <SectionTitle title="Resultados" subtitle={view === 'vivo' ? 'Cómo viene el mes, al día de hoy' : 'El análisis de cada mes, con lo que aprendimos y lo que sigue'} />
      {hasLive && reports.length > 0 && (
        <Segmented className="mb-4" brandPrimary={brandPrimary} value={view} onChange={onSubChange}
          options={[{ key: 'mensuales', label: 'Informes mensuales' }, { key: 'vivo', label: 'Métricas en vivo' }]} />
      )}
      {view === 'vivo'
        ? <LiveData slug={slug} token={token} requireReauth={requireReauth} workspace={workspace} />
        : <MonthlyReports slug={slug} token={token} requireReauth={requireReauth} reports={reports}
            selected={selectedReport} onSelect={onSelectReport} brandPrimary={brandPrimary} agencyName={agencyName} />}
    </div>
  )
}
