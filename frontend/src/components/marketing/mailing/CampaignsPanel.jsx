// Mailing → Campañas. La campaña abierta vive en la URL (`?campaign=<id>`) para
// que se pueda compartir el link y volver con el botón de atrás. Un borrador o
// una programada abre el editor; una lanzada, sus métricas.
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../../api/client'
import { OverflowMenu } from '../../ui/OverflowMenu'
import ConfirmModal from '../../ConfirmModal'
import CampaignEditor from './CampaignEditor'
import CampaignStats from './CampaignStats'
import { Card, btnPrimary, StatusPill, CAMPAIGN_STATUS, pct, fmtInt, fmtDateTime, apiError, ErrorNote, WarnNote } from './ui'

export default function CampaignsPanel({ projectId, onNavigate }) {
  const base = `/marketing/projects/${projectId}/mailing`
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = Number(searchParams.get('campaign')) || null
  const [campaigns, setCampaigns] = useState(null)
  const [config, setConfig] = useState(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(() => {
    api.get(`${base}/campaigns`).then(r => setCampaigns(r.data)).catch(err => setError(apiError(err)))
    api.get(`${base}/config`).then(r => setConfig(r.data)).catch(() => {})
  }, [base])
  useEffect(load, [load])

  function open(id) {
    const p = new URLSearchParams(searchParams)
    if (id) p.set('campaign', String(id)); else p.delete('campaign')
    setSearchParams(p)
  }

  async function create() {
    try {
      const { data } = await api.post(`${base}/campaigns`, { name: `Campaña ${new Date().toLocaleDateString('es-AR')}` })
      open(data.id)
    } catch (err) { setError(apiError(err)) }
  }

  async function act(c, action) {
    setError('')
    try {
      if (action === 'duplicate') { const { data } = await api.post(`${base}/campaigns/${c.id}/duplicate`); open(data.id); return }
      if (action === 'delete') await api.delete(`${base}/campaigns/${c.id}`)
      load()
    } catch (err) { setError(apiError(err)) }
  }

  if (openId) {
    const c = campaigns?.find(x => x.id === openId)
    if (!campaigns) return <Card className="p-6 text-sm text-gray-400">Cargando…</Card>
    if (c && !['draft', 'scheduled'].includes(c.status)) {
      return <CampaignStats projectId={projectId} campaignId={openId} onBack={() => { open(null); load() }} onDuplicate={() => act(c, 'duplicate')} onOpenCampaign={id => { load(); open(id) }} />
    }
    return <CampaignEditor projectId={projectId} campaignId={openId} onBack={() => { open(null); load() }} onLaunched={() => { load() }} />
  }

  return (
    <div className="space-y-3">
      {config && config.status !== 'active' && (
        <WarnNote>
          {config.configured
            ? 'La configuración de envío no está verificada: las campañas se pueden armar y probar, pero no lanzar.'
            : 'Este proyecto todavía no tiene configurado con qué mandar los mails.'}{' '}
          <button className="underline font-medium" onClick={() => onNavigate('configuracion')}>Ir a Configuración</button>
        </WarnNote>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{campaigns ? `${campaigns.length} campañas` : ''}</p>
        <button className={btnPrimary} onClick={create}>+ Nueva campaña</button>
      </div>
      <ErrorNote>{error}</ErrorNote>

      <Card className="overflow-hidden">
        {campaigns === null ? (
          <p className="px-5 py-6 text-sm text-gray-400">Cargando…</p>
        ) : campaigns.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300">Todavía no hay campañas.</p>
            <p className="text-xs text-gray-400 mt-1">Armá una base de contactos en «Bases y contactos» y después creá la primera campaña.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-5 py-2.5 font-medium">Campaña</th>
                  <th className="text-right px-3 py-2.5 font-medium">Enviados</th>
                  <th className="text-right px-3 py-2.5 font-medium">Aperturas</th>
                  <th className="text-right px-3 py-2.5 font-medium">Clics</th>
                  <th className="text-right px-3 py-2.5 font-medium hidden md:table-cell">Bajas</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => {
                  const launched = !['draft', 'scheduled'].includes(c.status)
                  return (
                    <tr key={c.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => open(c.id)}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusPill map={CAMPAIGN_STATUS} status={c.status} />
                          <span className="truncate text-gray-800 dark:text-gray-200 font-medium">{c.name}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                          {c.subject || '(sin asunto)'} · {c.status === 'scheduled' ? `sale ${fmtDateTime(c.scheduledAt)}` : launched ? `lanzada ${fmtDateTime(c.launchedAt)}` : `editada ${fmtDateTime(c.updatedAt)}`}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{launched ? `${fmtInt(c.sentCount)}/${fmtInt(c.recipients)}` : '—'}</td>
                      <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">{launched ? pct(c.openCount, c.sentCount) : '—'}</td>
                      <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400">{launched ? pct(c.clickCount, c.sentCount) : '—'}</td>
                      <td className="px-3 py-3 text-right text-gray-600 dark:text-gray-400 hidden md:table-cell">{launched ? fmtInt(c.unsubscribeCount) : '—'}</td>
                      <td className="pr-3" onClick={e => e.stopPropagation()}>
                        <OverflowMenu items={[
                          { label: 'Duplicar', onClick: () => act(c, 'duplicate') },
                          ...(['sending', 'paused'].includes(c.status) ? [] : [{ label: 'Eliminar', danger: true, onClick: () => setConfirm(c) }]),
                        ]} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ConfirmModal open={!!confirm} title={`Eliminar «${confirm?.name}»`}
        message={confirm && confirm.status === 'sent' ? 'Se pierden también sus métricas (aperturas, clics, bajas).' : 'Esta acción no se puede deshacer.'}
        onCancel={() => setConfirm(null)} onConfirm={() => { const c = confirm; setConfirm(null); act(c, 'delete') }} />
    </div>
  )
}
