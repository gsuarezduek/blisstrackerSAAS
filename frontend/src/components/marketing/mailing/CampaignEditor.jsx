// Editor de una campaña en borrador: datos del mail, a quién se manda (bases
// incluidas y excluidas), contenido por bloques con vista previa en vivo (la
// genera el backend con el mismo render del envío), prueba y lanzamiento.
// Autoguarda con debounce mientras se edita.
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Monitor, Smartphone } from 'lucide-react'
import api from '../../../api/client'
import { Icon } from '../../ui/Icon'
import BlockEditor from './BlockEditor'
import {
  Card, Modal, Field, inputCls, btnPrimary, btnSecondary, btnGhost, ErrorNote, WarnNote,
  StatusPill, CAMPAIGN_STATUS, apiError, fmtInt, fmtDay, fmtDateTime,
} from './ui'

const VARIABLES = ['{{nombre}}', '{{apellido}}', '{{email}}', '{{nombre|hola}}', '{{campo.ciudad}}']

function ListChips({ lists, selected, other, onToggle, tone }) {
  if (!lists.length) return <p className="text-xs text-gray-400">No hay bases. Creá una en «Bases y contactos».</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {lists.map(l => {
        const on = selected.includes(l.id)
        const blocked = other.includes(l.id)
        return (
          <button key={l.id} type="button" disabled={blocked} onClick={() => onToggle(l.id)}
            title={blocked ? 'Ya está en la otra lista' : undefined}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-40 ${on
              ? tone === 'include'
                ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                : 'border-red-400 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400'}`}>
            {l.name} <span className="opacity-60">· {fmtInt(l.subscribed)}</span>
          </button>
        )
      })}
    </div>
  )
}

// A/B de asunto: una parte de la audiencia recibe A o B; pasadas N horas gana el
// que tuvo más clics (o aperturas si nadie hizo clic) y el resto recibe ese.
const AB_PERCENTS = [10, 20, 30, 50, 100]
function AbTestFields({ c, set, editable }) {
  const on = c.subjectB != null
  if (!on) {
    return editable ? (
      <button type="button" className="text-xs text-primary-700 dark:text-primary-400 hover:underline" onClick={() => set({ subjectB: '', abTestPercent: c.abTestPercent ?? 20 })}>
        + Probar dos asuntos (test A/B)
      </button>
    ) : null
  }
  const pct = c.abTestPercent ?? 20
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Test A/B de asunto</p>
        {editable && <button type="button" className={btnGhost} onClick={() => set({ subjectB: null })}>Quitar</button>}
      </div>
      <Field label="Asunto B"><input className={inputCls} value={c.subjectB} disabled={!editable} onChange={e => set({ subjectB: e.target.value })} placeholder="Otra forma de decirlo" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Prueban">
          <select className={inputCls} value={pct} disabled={!editable} onChange={e => set({ abTestPercent: Number(e.target.value) })}>
            {AB_PERCENTS.map(p => <option key={p} value={p}>{p === 100 ? 'Toda la audiencia (mitad y mitad)' : `${p}% de la audiencia`}</option>)}
          </select>
        </Field>
        {pct < 100 && (
          <Field label="Elegir el ganador después de">
            <select className={inputCls} value={c.abWaitHours ?? 4} disabled={!editable} onChange={e => set({ abWaitHours: Number(e.target.value) })}>
              {[1, 2, 4, 8, 12, 24, 48].map(h => <option key={h} value={h}>{h} {h === 1 ? 'hora' : 'horas'}</option>)}
            </select>
          </Field>
        )}
      </div>
      <p className="text-[11px] text-gray-500 leading-snug">
        {pct < 100
          ? `El ${pct}% recibe A o B (mitad y mitad). Pasado ese tiempo —y cuando la prueba terminó de salir— gana el de más clics (o aperturas, si nadie hizo clic) y el resto recibe ese asunto. Con audiencias de menos de 100 personas se parte todo mitad y mitad.`
          : 'Toda la audiencia se parte mitad y mitad: en las métricas ves cuál funcionó mejor para la próxima.'}
      </p>
    </div>
  )
}

function TestModal({ base, campaignId, onClose }) {
  const [emails, setEmails] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  async function send() {
    setBusy(true); setError(''); setMsg('')
    try {
      const { data } = await api.post(`${base}/campaigns/${campaignId}/test`, { emails: emails.split(/[\s,;]+/).filter(Boolean) })
      setMsg(`Prueba enviada a ${data.sent} ${data.sent === 1 ? 'dirección' : 'direcciones'}.${data.failed?.length ? ` Fallaron: ${data.failed.join('; ')}` : ''}`)
    } catch (err) { setError(apiError(err, 'No se pudo enviar la prueba')) }
    finally { setBusy(false) }
  }
  return (
    <Modal title="Enviar prueba" onClose={onClose}
      footer={<><button className={btnSecondary} onClick={onClose}>Cerrar</button><button className={btnPrimary} disabled={busy || !emails.trim()} onClick={send}>{busy ? 'Enviando…' : 'Enviar'}</button></>}>
      <div className="space-y-3">
        <Field label="Enviar a" hint="Hasta 5 direcciones separadas por coma. La prueba usa datos de ejemplo en las variables, no cuenta para el tope diario ni para las métricas.">
          <input autoFocus className={inputCls} value={emails} onChange={e => setEmails(e.target.value)} placeholder="vos@agencia.com, cliente@cliente.com" />
        </Field>
        {msg && <p className="text-xs text-green-700 dark:text-green-400">{msg}</p>}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  )
}

function LaunchModal({ base, campaign, audience, onClose, onLaunched }) {
  const [mode, setMode] = useState('now')
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [problems, setProblems] = useState([])
  const cap = audience?.capacity
  async function go() {
    setBusy(true); setError(''); setProblems([])
    try {
      const body = mode === 'later' && when ? { scheduledAt: new Date(when).toISOString() } : {}
      await api.post(`${base}/campaigns/${campaign.id}/launch`, body)
      onLaunched()
    } catch (err) {
      setError(apiError(err, 'No se pudo lanzar'))
      setProblems(err?.response?.data?.problems || [])
    } finally { setBusy(false) }
  }
  return (
    <Modal title="Lanzar campaña" onClose={onClose}
      footer={<><button className={btnSecondary} onClick={onClose}>Cancelar</button>
        <button className={btnPrimary} disabled={busy || !audience?.count || (mode === 'later' && !when)} onClick={go}>
          {busy ? 'Lanzando…' : mode === 'later' ? 'Programar' : `Enviar a ${fmtInt(audience?.count)}`}
        </button></>}>
      <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
        <p><b>{fmtInt(audience?.count)}</b> destinatarios suscriptos (cada persona recibe un solo mail aunque esté en varias bases).</p>
        {cap && audience.count > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">
            Tope de {fmtInt(cap.dailyLimit)} mails por día{cap.warmup && !cap.warmup.done ? ` hoy (calentamiento, día ${cap.warmup.day}: crece cada día)` : ''} entre {cap.sendWindowStart} y {cap.sendWindowEnd}
            {cap.queuedAhead > 0 && <> · hay {fmtInt(cap.queuedAhead)} mails de otras campañas en cola antes</>}.{' '}
            {cap.days <= 1 ? 'Debería salir completa hoy.' : <>Si sale ahora, termina el <b>{fmtDay(cap.finishDate)}</b> ({cap.days} días de envío).</>}
          </p>
        )}
        <div className="flex gap-2">
          {[['now', 'Enviar ahora'], ['later', 'Programar']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${mode === k ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-gray-200 dark:border-gray-600'}`}>{l}</button>
          ))}
        </div>
        {mode === 'later' && (
          <Field label="Fecha y hora" hint="La audiencia se calcula en ese momento: los que se den de baja antes no la reciben.">
            <input type="datetime-local" className={inputCls} value={when} onChange={e => setWhen(e.target.value)} />
          </Field>
        )}
        {campaign.subjectB != null && (campaign.abTestPercent ?? 20) < 100 && (
          <p className="text-xs text-gray-500">Test A/B: primero sale el {campaign.abTestPercent ?? 20}% de la audiencia; el resto recibe el asunto ganador, así que la campaña completa tarda más que la estimación.</p>
        )}
        <p className="text-xs text-gray-500">Una vez lanzada, la campaña no se puede editar (sí pausar o cancelar).</p>
        <ErrorNote>{error}</ErrorNote>
        {problems.length > 1 && <ul className="text-xs text-red-600 list-disc pl-5">{problems.slice(1).map(p => <li key={p}>{p}</li>)}</ul>}
      </div>
    </Modal>
  )
}

export default function CampaignEditor({ projectId, campaignId, onBack, onLaunched }) {
  const base = `/marketing/projects/${projectId}/mailing`
  const [c, setC] = useState(null)
  const [lists, setLists] = useState([])
  const [config, setConfig] = useState(null)
  const [saveState, setSaveState] = useState('saved')
  const [error, setError] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  const [device, setDevice] = useState('desktop')
  const [audience, setAudience] = useState(null)
  const [modal, setModal] = useState(null)
  const dirty = useRef(false)

  useEffect(() => {
    Promise.all([
      api.get(`${base}/campaigns/${campaignId}`),
      api.get(`${base}/lists`),
      api.get(`${base}/config`),
    ]).then(([a, b, cfg]) => { setC(a.data); setLists(b.data.lists); setConfig(cfg.data) })
      .catch(err => setError(apiError(err, 'No se pudo cargar la campaña')))
  }, [base, campaignId])

  const editable = c && ['draft', 'scheduled'].includes(c.status)

  // Autoguardado.
  useEffect(() => {
    if (!c || !dirty.current || !editable) return
    setSaveState('pending')
    const t = setTimeout(async () => {
      setSaveState('saving')
      try {
        await api.patch(`${base}/campaigns/${c.id}`, {
          name: c.name, subject: c.subject, preheader: c.preheader, blocks: c.blocks,
          includeListIds: c.includeListIds, excludeListIds: c.excludeListIds,
          subjectB: c.subjectB ?? null, abTestPercent: c.subjectB != null ? (c.abTestPercent ?? 20) : null, abWaitHours: c.abWaitHours ?? 4,
        })
        dirty.current = false
        setSaveState('saved')
      } catch (err) { setSaveState('error'); setError(apiError(err, 'No se pudo guardar')) }
    }, 900)
    return () => clearTimeout(t)
  }, [c, base, editable])

  // Vista previa (render del servidor).
  useEffect(() => {
    if (!c) return
    const t = setTimeout(() => {
      api.post(`${base}/campaigns/${c.id}/preview`, { subject: c.subject, preheader: c.preheader, blocks: c.blocks })
        .then(r => setPreviewHtml(r.data.html)).catch(() => {})
    }, 600)
    return () => clearTimeout(t)
  }, [c?.subject, c?.preheader, c?.blocks, base]) // eslint-disable-line react-hooks/exhaustive-deps

  // Audiencia en vivo (de las bases, o los que no abrieron la original si es un reenvío).
  useEffect(() => {
    if (!c) return
    const body = c.resendOfId ? { resendOfId: c.resendOfId } : { includeListIds: c.includeListIds, excludeListIds: c.excludeListIds }
    api.post(`${base}/audience`, body).then(r => setAudience(r.data)).catch(() => {})
  }, [c?.includeListIds, c?.excludeListIds, c?.resendOfId, base]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return <Card className="p-6 text-sm text-gray-400">{error || 'Cargando…'}</Card>

  const set = patch => { dirty.current = true; setC(prev => ({ ...prev, ...patch })) }
  const toggle = (key, id) => {
    const cur = c[key] || []
    set({ [key]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] })
  }

  async function unschedule() {
    try { await api.post(`${base}/campaigns/${c.id}/unschedule`); setC(prev => ({ ...prev, status: 'draft', scheduledAt: null })) }
    catch (err) { setError(apiError(err)) }
  }

  const configReady = config?.status === 'active'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className={btnGhost} onClick={onBack}><Icon as={ArrowLeft} size={14} /> Campañas</button>
        <StatusPill map={CAMPAIGN_STATUS} status={c.status} />
        {c.status === 'scheduled' && <span className="text-xs text-gray-500">Sale el {fmtDateTime(c.scheduledAt)}</span>}
        <span className="text-[11px] text-gray-400">
          {saveState === 'saving' ? 'Guardando…' : saveState === 'pending' ? 'Cambios sin guardar' : saveState === 'error' ? 'Error al guardar' : 'Guardado'}
        </span>
        <div className="flex-1" />
        <button className={btnSecondary} onClick={() => setModal('test')} disabled={!config?.configured}>Enviar prueba</button>
        {c.status === 'scheduled'
          ? <button className={btnSecondary} onClick={unschedule}>Desprogramar</button>
          : <button className={btnPrimary} onClick={() => setModal('launch')} disabled={saveState !== 'saved'}>Lanzar…</button>}
      </div>

      {!configReady && (
        <WarnNote>
          La configuración de envío de este proyecto no está verificada: podés armar la campaña y {config?.configured ? 'mandar pruebas' : 'guardarla'}, pero para lanzarla primero verificala en Mailing → Configuración.
        </WarnNote>
      )}
      <ErrorNote>{error}</ErrorNote>

      <div className="grid xl:grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          <Card className="p-5 space-y-3">
            <Field label="Nombre interno"><input className={inputCls} value={c.name} disabled={!editable} onChange={e => set({ name: e.target.value })} /></Field>
            <Field label="Asunto"><input className={inputCls} value={c.subject} disabled={!editable} onChange={e => set({ subject: e.target.value })} placeholder="Lo que la persona ve en la bandeja" /></Field>
            <AbTestFields c={c} set={set} editable={editable} />
            <Field label="Texto de vista previa (opcional)" hint="Aparece al lado del asunto en Gmail y otros clientes.">
              <input className={inputCls} value={c.preheader || ''} disabled={!editable} onChange={e => set({ preheader: e.target.value })} />
            </Field>
            <p className="text-[11px] text-gray-500 leading-snug">
              Variables: {VARIABLES.map(v => <code key={v} className="mr-1.5 px-1 rounded bg-gray-100 dark:bg-gray-700">{v}</code>)}
              <br />Con <code>|</code> se pone un valor por defecto para quien no tenga el dato.
            </p>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Destinatarios</p>
              <p className="text-sm text-gray-700 dark:text-gray-300"><b>{fmtInt(audience?.count)}</b> suscriptos</p>
            </div>
            {c.resendOfId ? (
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-snug">
                Reenvío de <b>«{c.resendOf?.name}»</b> a quienes la recibieron y no la abrieron ni hicieron clic (y siguen suscriptos). Se calcula al lanzar.
                Cambiale el asunto: es lo que más mueve la apertura en un segundo intento{c.resendOf?.subject ? <> (el original era «{c.resendOf.subject}»)</> : ''}.
              </p>
            ) : (
              <>
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Mandar a quienes estén en alguna de estas bases</p>
                  <ListChips tone="include" lists={lists} selected={c.includeListIds || []} other={c.excludeListIds || []} onToggle={id => editable && toggle('includeListIds', id)} />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">…excepto quienes estén en estas</p>
                  <ListChips tone="exclude" lists={lists} selected={c.excludeListIds || []} other={c.includeListIds || []} onToggle={id => editable && toggle('excludeListIds', id)} />
                </div>
              </>
            )}
          </Card>

          <Card className="p-5">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Contenido</p>
            <BlockEditor blocks={c.blocks || []} onChange={blocks => set({ blocks })} uploadUrl={`${base}/images`} disabled={!editable} />
            <p className="text-[11px] text-gray-500 mt-3">El pie con la dirección del remitente y el link de baja se agrega solo a todos los mails.</p>
          </Card>
        </div>

        <Card className="xl:sticky xl:top-4 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Vista previa</p>
            <div className="flex gap-1">
              <button className={btnGhost} title="Escritorio" onClick={() => setDevice('desktop')}><Icon as={Monitor} size={14} className={device === 'desktop' ? 'text-primary-600' : ''} /></button>
              <button className={btnGhost} title="Celular" onClick={() => setDevice('mobile')}><Icon as={Smartphone} size={14} className={device === 'mobile' ? 'text-primary-600' : ''} /></button>
            </div>
          </div>
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 text-xs">
            <p className="text-gray-500 truncate"><b className="text-gray-700 dark:text-gray-200">{config?.fromName || 'Remitente'}</b> &lt;{config?.fromEmail || 'sin configurar'}&gt;</p>
            <p className="text-gray-800 dark:text-gray-100 truncate font-medium">{c.subject || '(sin asunto)'}</p>
          </div>
          <div className="bg-gray-100 dark:bg-gray-900 flex justify-center p-3">
            <iframe title="Vista previa del mail" sandbox="" srcDoc={previewHtml}
              className="bg-white rounded border-0 transition-all" style={{ width: device === 'mobile' ? 375 : '100%', height: 640 }} />
          </div>
        </Card>
      </div>

      {modal === 'test' && <TestModal base={base} campaignId={c.id} onClose={() => setModal(null)} />}
      {modal === 'launch' && <LaunchModal base={base} campaign={c} audience={audience} onClose={() => setModal(null)} onLaunched={() => { setModal(null); onLaunched(c.id) }} />}
    </div>
  )
}
