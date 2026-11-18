// Mailing → Configuración: con qué se manda (Resend o SMTP del cliente), desde
// qué remitente, con qué pie, cuántos por día y en qué horario.
import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Copy } from 'lucide-react'
import api from '../../../api/client'
import { Icon } from '../../ui/Icon'
import { Card, Field, inputCls, btnPrimary, btnSecondary, ErrorNote, WarnNote, apiError, fmtDateTime } from './ui'

const PROVIDERS = [
  { key: 'resend', label: 'Resend', help: 'Recomendado. Recibimos entregas, rebotes y quejas de spam automáticamente.' },
  { key: 'ses',    label: 'Amazon SES', help: 'El más barato a volumen. Rebotes y quejas por SNS (requiere configurarlo en AWS).' },
  { key: 'smtp',   label: 'SMTP',   help: 'Google Workspace, el hosting del cliente u otro servidor. Sin aviso de rebotes.' },
]

const AWS_REGIONS = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'sa-east-1', 'ca-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1', 'eu-south-1', 'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2']

const STATUS = {
  active:     { label: 'Verificada', icon: CheckCircle2, cls: 'text-green-700 dark:text-green-400' },
  invalid:    { label: 'Con error',  icon: AlertTriangle, cls: 'text-red-600 dark:text-red-400' },
  unverified: { label: 'Sin verificar', icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400' },
}

export default function MailingConfigPanel({ projectId }) {
  const base = `/marketing/projects/${projectId}/mailing`
  const [config, setConfig] = useState(null)
  const [form, setForm] = useState(null)
  const [creds, setCreds] = useState({})
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState([])
  const [saved, setSaved] = useState(false)
  const [secret, setSecret] = useState('')

  function load() {
    api.get(`${base}/config`).then(r => {
      setConfig(r.data)
      setForm({
        provider: r.data.provider || 'resend',
        fromName: r.data.fromName || '', fromEmail: r.data.fromEmail || '', replyTo: r.data.replyTo || '',
        postalAddress: r.data.postalAddress || '', brandColor: r.data.brandColor || '',
        dailyLimit: r.data.dailyLimit ?? 500,
        sendWindowStart: r.data.sendWindowStart || '09:00', sendWindowEnd: r.data.sendWindowEnd || '20:00',
      })
      const hint = r.data.credentialsHint
      setCreds(
        r.data.provider === 'smtp' && hint ? { host: hint.host, port: hint.port, user: hint.user || '' }
          : r.data.provider === 'ses' && hint ? { region: hint.region, configurationSet: hint.configurationSet || '' }
            : {},
      )
    }).catch(err => setError(apiError(err, 'No se pudo cargar la configuración')))
  }
  useEffect(load, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!form) return <Card className="p-6 text-sm text-gray-400">{error || 'Cargando…'}</Card>

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSaved(false) }
  const providerChanged = form.provider !== config.provider

  async function save() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const body = { ...form, dailyLimit: Number(form.dailyLimit), brandColor: form.brandColor || null }
      // Credenciales: solo si se escribió algo (vacío = conservar las guardadas).
      if (form.provider === 'resend' && creds.apiKey) body.credentials = { apiKey: creds.apiKey }
      if (form.provider === 'smtp' && creds.host) body.credentials = { host: creds.host, port: Number(creds.port) || 587, user: creds.user, pass: creds.pass || undefined }
      // SES: la access key es lo que identifica la cuenta; sin ella no se toca lo guardado.
      if (form.provider === 'ses' && creds.accessKeyId) body.credentials = { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey || undefined, region: creds.region || 'us-east-1', configurationSet: creds.configurationSet || undefined }
      const { data } = await api.put(`${base}/config`, body)
      setConfig(data); setCreds(c => ({ ...c, apiKey: '', pass: '', accessKeyId: '', secretAccessKey: '' })); setSaved(true)
      return data
    } catch (err) {
      setError(apiError(err, 'No se pudo guardar'))
      return null
    } finally { setSaving(false) }
  }

  async function verify() {
    setVerifying(true); setError(''); setWarnings([])
    try {
      const ok = await save()
      if (!ok) return
      const { data } = await api.post(`${base}/config/verify`)
      setConfig(data.config); setWarnings(data.warnings || [])
    } catch (err) {
      setError(apiError(err, 'No se pudo verificar'))
      if (err?.response?.data?.config) setConfig(err.response.data.config)
    } finally { setVerifying(false) }
  }

  async function saveSecret() {
    setError('')
    try {
      const { data } = await api.put(`${base}/config/webhook-secret`, { secret })
      setConfig(data); setSecret('')
    } catch (err) { setError(apiError(err, 'No se pudo guardar el secreto')) }
  }

  const st = STATUS[config.status] ?? STATUS.unverified

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Proveedor de envío</p>
            {config.exists !== false && (
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${st.cls}`}>
                <Icon as={st.icon} size={14} /> {st.label}
              </span>
            )}
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            {PROVIDERS.map(p => (
              <button key={p.key} type="button" onClick={() => set('provider', p.key)}
                className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${form.provider === p.key
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'}`}>
                <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{p.label}</span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{p.help}</span>
              </button>
            ))}
          </div>

          {form.provider === 'resend' ? (
            <Field label="API key de Resend"
              hint={<>Generala en resend.com → API Keys con <b>acceso completo</b>: así verificamos el dominio y creamos solos el webhook de rebotes. El dominio del remitente tiene que estar verificado en esa cuenta.</>}>
              <input type="password" autoComplete="off" className={inputCls}
                placeholder={config.provider === 'resend' && config.configured && !providerChanged ? `Guardada (${config.credentialsHint}) — dejala vacía para conservarla` : 're_…'}
                value={creds.apiKey || ''} onChange={e => setCreds(c => ({ ...c, apiKey: e.target.value }))} />
            </Field>
          ) : form.provider === 'ses' ? (
            <div className="grid sm:grid-cols-6 gap-3">
              <div className="sm:col-span-3"><Field label="Access key ID"
                hint={config.provider === 'ses' && config.configured && !providerChanged ? `Guardada (${config.credentialsHint?.accessKeyId}) — dejala vacía para conservarla` : 'De un usuario IAM con permisos ses:SendEmail, ses:GetAccount y ses:GetEmailIdentity.'}>
                <input className={inputCls} autoComplete="off" placeholder="AKIA…" value={creds.accessKeyId || ''} onChange={e => setCreds(c => ({ ...c, accessKeyId: e.target.value }))} />
              </Field></div>
              <div className="sm:col-span-3"><Field label="Secret access key" hint="Vacía = conservar la guardada.">
                <input type="password" autoComplete="new-password" className={inputCls} value={creds.secretAccessKey || ''} onChange={e => setCreds(c => ({ ...c, secretAccessKey: e.target.value }))} />
              </Field></div>
              <div className="sm:col-span-3"><Field label="Región">
                <select className={inputCls} value={creds.region || 'us-east-1'} onChange={e => setCreds(c => ({ ...c, region: e.target.value }))}>
                  {AWS_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field></div>
              <div className="sm:col-span-3"><Field label="Configuration set (opcional)" hint="Si usás uno para los eventos de envío.">
                <input className={inputCls} value={creds.configurationSet || ''} onChange={e => setCreds(c => ({ ...c, configurationSet: e.target.value }))} />
              </Field></div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-6 gap-3">
              <div className="sm:col-span-4"><Field label="Servidor SMTP">
                <input className={inputCls} placeholder="smtp.gmail.com" value={creds.host || ''} onChange={e => setCreds(c => ({ ...c, host: e.target.value }))} />
              </Field></div>
              <div className="sm:col-span-2"><Field label="Puerto">
                <select className={inputCls} value={creds.port || 587} onChange={e => setCreds(c => ({ ...c, port: Number(e.target.value) }))}>
                  {[587, 465, 2525, 25].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field></div>
              <div className="sm:col-span-3"><Field label="Usuario">
                <input className={inputCls} autoComplete="off" value={creds.user || ''} onChange={e => setCreds(c => ({ ...c, user: e.target.value }))} />
              </Field></div>
              <div className="sm:col-span-3"><Field label="Contraseña" hint="Vacía = conservar la guardada. En Gmail usá una contraseña de aplicación.">
                <input type="password" autoComplete="new-password" className={inputCls} value={creds.pass || ''} onChange={e => setCreds(c => ({ ...c, pass: e.target.value }))} />
              </Field></div>
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Remitente y pie</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nombre del remitente"><input className={inputCls} placeholder="Marca del cliente" value={form.fromName} onChange={e => set('fromName', e.target.value)} /></Field>
            <Field label="Email del remitente"><input className={inputCls} placeholder="novedades@cliente.com" value={form.fromEmail} onChange={e => set('fromEmail', e.target.value)} /></Field>
            <Field label="Responder a (opcional)"><input className={inputCls} placeholder="hola@cliente.com" value={form.replyTo} onChange={e => set('replyTo', e.target.value)} /></Field>
            <Field label="Color de botones y links">
              <div className="flex gap-2">
                <input type="color" className="h-9 w-12 rounded border border-gray-300 dark:border-gray-600 bg-transparent" value={form.brandColor || '#E67A1F'} onChange={e => set('brandColor', e.target.value)} />
                <input className={inputCls} placeholder="#E67A1F" value={form.brandColor} onChange={e => set('brandColor', e.target.value)} />
              </div>
            </Field>
          </div>
          <Field label="Dirección postal del remitente" hint="Obligatoria: va al pie de cada mail junto al link de baja (lo exigen las leyes anti-spam y los filtros de Gmail).">
            <input className={inputCls} placeholder="Av. Siempreviva 742, CABA, Argentina" value={form.postalAddress} onChange={e => set('postalAddress', e.target.value)} />
          </Field>
        </Card>

        <Card className="p-5 space-y-4">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Ritmo de envío</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Tope por día" hint="Lo que no entra hoy sale mañana.">
              <input type="number" min={1} className={inputCls} value={form.dailyLimit} onChange={e => set('dailyLimit', e.target.value)} />
            </Field>
            <Field label="Desde"><input type="time" className={inputCls} value={form.sendWindowStart} onChange={e => set('sendWindowStart', e.target.value)} /></Field>
            <Field label="Hasta"><input type="time" className={inputCls} value={form.sendWindowEnd} onChange={e => set('sendWindowEnd', e.target.value)} /></Field>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
            Con un dominio nuevo, arrancá con pocos mails por día (50–100) y subilo de a poco: los proveedores de correo desconfían de un dominio que de golpe manda miles.
          </p>
        </Card>

        <ErrorNote>{error || (config.status === 'invalid' && config.lastError) || ''}</ErrorNote>
        {warnings.map((w, i) => <WarnNote key={i}>{w}</WarnNote>)}
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnSecondary} onClick={save} disabled={saving || verifying}>{saving && !verifying ? 'Guardando…' : 'Guardar'}</button>
          <button className={btnPrimary} onClick={verify} disabled={saving || verifying}>{verifying ? 'Verificando…' : 'Guardar y verificar'}</button>
          {saved && !verifying && <span className="text-xs text-green-700 dark:text-green-400">Guardado</span>}
        </div>
      </div>

      <div className="space-y-4">
        <Card className="p-5 space-y-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Estado</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">Última verificación: {fmtDateTime(config.lastVerifiedAt)}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-snug">
            Hasta que la configuración esté verificada se pueden armar campañas y mandar pruebas, pero no lanzarlas.
          </p>
        </Card>

        {config.provider === 'ses' && config.configured && (
          <Card className="p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Rebotes y quejas (SNS)</p>
            {config.webhookConfigured ? (
              <p className="text-xs text-green-700 dark:text-green-400">Conectado: los rebotes y las quejas de spam suprimen al contacto solos.</p>
            ) : (
              <>
                <ol className="text-xs text-gray-600 dark:text-gray-400 leading-snug list-decimal pl-4 space-y-1">
                  <li>En AWS → SNS, creá un tópico (estándar) en la misma región.</li>
                  <li>Creá una suscripción <b>HTTPS</b> a ese tópico con esta URL. Se confirma sola.</li>
                  <li>En SES → Identidades → el dominio → Notificaciones, mandá <i>Bounce</i>, <i>Complaint</i> y <i>Delivery</i> a ese tópico.</li>
                </ol>
                <div className="flex gap-1.5">
                  <input readOnly className={`${inputCls} text-[11px]`} value={config.webhookUrl || ''} />
                  <button className={btnSecondary} onClick={() => navigator.clipboard?.writeText(config.webhookUrl)} title="Copiar"><Icon as={Copy} size={14} /></button>
                </div>
                <p className="text-[11px] text-gray-500">Mientras no esté conectado, los rebotes no se registran: revisá que la tasa de rebote no suba.</p>
              </>
            )}
          </Card>
        )}

        {config.provider === 'resend' && config.configured && (
          <Card className="p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Webhook de rebotes</p>
            {config.webhookConfigured ? (
              <p className="text-xs text-green-700 dark:text-green-400">Conectado: los rebotes y las quejas de spam suprimen al contacto solos.</p>
            ) : (
              <>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-snug">
                  Si la key es de solo envío, creá el webhook a mano en Resend → Webhooks con esta URL y los eventos
                  <i> delivered, bounced y complained</i>, y pegá acá su secreto.
                </p>
                <div className="flex gap-1.5">
                  <input readOnly className={`${inputCls} text-[11px]`} value={config.webhookUrl || ''} />
                  <button className={btnSecondary} onClick={() => navigator.clipboard?.writeText(config.webhookUrl)} title="Copiar"><Icon as={Copy} size={14} /></button>
                </div>
                <div className="flex gap-1.5">
                  <input className={inputCls} placeholder="whsec_…" value={secret} onChange={e => setSecret(e.target.value)} />
                  <button className={btnSecondary} onClick={saveSecret} disabled={!secret}>Guardar</button>
                </div>
              </>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
