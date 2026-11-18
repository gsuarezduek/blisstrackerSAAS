// Métricas de una campaña lanzada: progreso del envío (con el tope diario),
// tasas, links más clickeados, aperturas por hora y destinatarios uno por uno.
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import api from '../../../api/client'
import { Icon } from '../../ui/Icon'
import ConfirmModal from '../../ConfirmModal'
import {
  Card, btnSecondary, btnGhost, inputCls, ErrorNote, StatusPill, CAMPAIGN_STATUS,
  pct, fmtInt, fmtDateTime, fmtDay, apiError,
} from './ui'

const RECIPIENT_FILTERS = [
  ['', 'Todos'], ['opened', 'Abrieron'], ['clicked', 'Hicieron clic'], ['unsubscribed', 'Se dieron de baja'],
  ['bounced', 'Rebotaron'], ['failed', 'Fallidos'], ['queued', 'En cola'],
]

const SEND_LABEL = {
  queued: 'En cola', sending: 'Enviando', sent: 'Enviado', delivered: 'Entregado', failed: 'Falló',
  bounced: 'Rebotó', complained: 'Marcó spam', cancelled: 'Cancelado',
}

function Kpi({ label, value, sub }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
    </Card>
  )
}

// Una sola serie → sin leyenda (el título la nombra), un solo tono, barras finas
// ancladas a la base con tope redondeado y 2px de separación. Tooltip al hover.
function HourlyOpens({ hourly }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...hourly.map(h => h.opens))
  const total = hourly.reduce((a, h) => a + h.opens, 0)
  if (!total) return <p className="text-xs text-gray-400 py-6 text-center">Todavía no hay aperturas.</p>
  const h = hover != null ? hourly[hover] : null
  return (
    <div>
      <p className="text-xs text-gray-600 dark:text-gray-300 h-4 mb-1">
        {h ? <>Hora {h.hour}–{h.hour + 1} desde el lanzamiento: <b>{fmtInt(h.opens)}</b> {h.opens === 1 ? 'apertura' : 'aperturas'}</> : ' '}
      </p>
      <div className="flex items-end h-32 border-b border-gray-200 dark:border-gray-700" style={{ gap: 2 }} onMouseLeave={() => setHover(null)}>
        {hourly.map((b, i) => (
          <div key={b.hour} className="flex-1 h-full flex items-end cursor-default" onMouseEnter={() => setHover(i)}>
            <div className={`w-full rounded-t ${hover === i ? 'bg-primary-700' : 'bg-primary-500'}`}
              style={{ height: b.opens ? `${Math.max(3, (b.opens / max) * 100)}%` : 0 }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        <span>Lanzamiento</span><span>+{hourly.length} h</span>
      </div>
    </div>
  )
}

export default function CampaignStats({ projectId, campaignId, onBack, onDuplicate }) {
  const base = `/marketing/projects/${projectId}/mailing/campaigns/${campaignId}`
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [recips, setRecips] = useState({ items: [], total: 0, pageSize: 50 })
  const [confirm, setConfirm] = useState(false)

  const load = useCallback(() => {
    api.get(`${base}/stats`).then(r => setData(r.data)).catch(err => setError(apiError(err)))
  }, [base])
  useEffect(load, [load])

  // Mientras está saliendo, refrescar solo cada minuto (el cron manda de a lotes por minuto).
  useEffect(() => {
    if (data?.campaign?.status !== 'sending') return
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, 60000)
    return () => clearInterval(t)
  }, [data?.campaign?.status, load])

  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`${base}/recipients`, { params: { filter, q, page } }).then(r => setRecips(r.data)).catch(() => {})
    }, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [base, filter, q, page])
  useEffect(() => { setPage(1) }, [filter, q])

  async function action(name) {
    setError('')
    try { await api.post(`${base}/${name}`); load() }
    catch (err) { setError(apiError(err)) }
  }

  if (!data) return <Card className="p-6 text-sm text-gray-400">{error || 'Cargando…'}</Card>
  const c = data.campaign
  const sent = c.sentCount
  const cap = data.capacity
  const totalPages = Math.max(1, Math.ceil(recips.total / recips.pageSize))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnGhost} onClick={onBack}><Icon as={ArrowLeft} size={14} /> Campañas</button>
        <StatusPill map={CAMPAIGN_STATUS} status={c.status} />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white truncate">{c.name}</h2>
        <div className="flex-1" />
        {c.status === 'sending' && <button className={btnSecondary} onClick={() => action('pause')}>Pausar</button>}
        {c.status === 'paused' && <button className={btnSecondary} onClick={() => action('resume')}>Reanudar</button>}
        {['sending', 'paused'].includes(c.status) && <button className={`${btnSecondary} text-red-600`} onClick={() => setConfirm(true)}>Cancelar envío</button>}
        <button className={btnSecondary} onClick={onDuplicate}>Duplicar</button>
      </div>
      <p className="text-xs text-gray-500 -mt-2">«{c.subject}» · lanzada {fmtDateTime(c.launchedAt)}{c.finishedAt ? ` · terminó ${fmtDateTime(c.finishedAt)}` : ''}</p>
      <ErrorNote>{error}</ErrorNote>

      {data.pending > 0 && (
        <Card className="p-4">
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-300 mb-1.5">
            <span>Enviados {fmtInt(sent)} de {fmtInt(c.recipients)}</span>
            <span>{fmtInt(data.pending)} en cola</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full" style={{ width: `${c.recipients ? (sent / c.recipients) * 100 : 0}%` }} />
          </div>
          {c.status === 'paused'
            ? <p className="text-[11px] text-gray-500 mt-1.5">Pausada: no sale nada hasta que la reanudes.</p>
            : cap && (
              <p className="text-[11px] text-gray-500 mt-1.5">
                Tope de {fmtInt(cap.dailyLimit)} por día ({fmtInt(cap.usedToday)} ya usados hoy), entre {cap.sendWindowStart} y {cap.sendWindowEnd}.
                {cap.days > 1 ? <> Termina aproximadamente el {fmtDay(cap.finishDate)}.</> : ' Debería terminar hoy.'}
              </p>
            )}
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Enviados" value={fmtInt(sent)} sub={c.deliveredCount ? `${fmtInt(c.deliveredCount)} entregados` : c.failedCount ? `${fmtInt(c.failedCount)} fallaron` : null} />
        <Kpi label="Aperturas" value={pct(c.openCount, sent)} sub={`${fmtInt(c.openCount)} personas · estimado`} />
        <Kpi label="Clics" value={pct(c.clickCount, sent)} sub={`${fmtInt(c.clickCount)} personas · ${pct(c.clickCount, c.openCount)} de los que abrieron`} />
        <Kpi label="Bajas y rebotes" value={fmtInt(c.unsubscribeCount + c.bounceCount + c.complaintCount)}
          sub={`${fmtInt(c.unsubscribeCount)} bajas · ${fmtInt(c.bounceCount)} rebotes · ${fmtInt(c.complaintCount)} spam`} />
      </div>
      <p className="text-[11px] text-gray-400 -mt-2 leading-snug">
        Las aperturas son estimadas: Apple Mail precarga las imágenes (cuenta aperturas que no fueron) y otros clientes las bloquean (no cuenta algunas que sí). Los clics son el dato confiable.
      </p>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Aperturas por hora desde el lanzamiento</p>
          <HourlyOpens hourly={data.hourly} />
        </Card>
        <Card className="overflow-hidden">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 px-4 pt-4 pb-2">Links</p>
          {data.links.length === 0 ? <p className="px-4 pb-4 text-xs text-gray-400">El mail no tiene links.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-[11px] text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-4 py-2 font-medium">URL</th><th className="text-right px-3 py-2 font-medium">Personas</th><th className="text-right px-4 py-2 font-medium">Clics</th>
              </tr></thead>
              <tbody>
                {data.links.map(l => (
                  <tr key={l.idx} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                    <td className="px-4 py-2 max-w-0 w-full"><a href={l.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary-700 dark:text-primary-400 hover:underline" title={l.url}>{l.url}</a></td>
                    <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{fmtInt(l.uniqueClicks)}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{fmtInt(l.clickCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mr-2">Destinatarios</p>
          <select className={`${inputCls} w-44`} value={filter} onChange={e => setFilter(e.target.value)}>
            {RECIPIENT_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input className={`${inputCls} max-w-xs`} placeholder="Buscar email…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
              <th className="text-left px-4 py-2 font-medium">Email</th><th className="text-left px-3 py-2 font-medium">Estado</th>
              <th className="text-left px-3 py-2 font-medium">Abrió</th><th className="text-left px-3 py-2 font-medium">Clic</th>
            </tr></thead>
            <tbody>
              {recips.items.map(r => (
                <tr key={r.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                  <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{r.email}
                    {r.errorMsg && ['failed', 'cancelled', 'queued'].includes(r.status) && <p className="text-[11px] text-gray-400 truncate max-w-md" title={r.errorMsg}>{r.errorMsg}</p>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">{SEND_LABEL[r.status] || r.status}{r.unsubscribedAt ? ' · se dio de baja' : ''}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.firstOpenedAt ? `${fmtDateTime(r.firstOpenedAt)}${r.openCount > 1 ? ` (${r.openCount}×)` : ''}` : '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.firstClickedAt ? `${fmtDateTime(r.firstClickedAt)}${r.clickCount > 1 ? ` (${r.clickCount}×)` : ''}` : '—'}</td>
                </tr>
              ))}
              {recips.items.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-xs text-gray-400">Nadie con este filtro.</td></tr>}
            </tbody>
          </table>
        </div>
        {recips.total > recips.pageSize && (
          <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500">
            <button className={btnGhost} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
            <span>{page} / {totalPages}</span>
            <button className={btnGhost} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</button>
          </div>
        )}
      </Card>

      <ConfirmModal open={confirm} title="Cancelar el envío"
        message="Los mails que ya salieron no se pueden recuperar; los que están en cola no se van a mandar. No se puede reanudar después."
        confirmLabel="Cancelar envío" cancelLabel="Volver"
        onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); action('cancel') }} />
    </div>
  )
}
