import { useState, useEffect } from 'react'
import api from '../../api/client'

const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

// Sección "Formulario web" de Configuración de Ventas: generar/copiar/regenerar/
// desactivar el link que crea Leads automáticamente (Workspace.leadWebhookToken).
// Cuando llega un lead nuevo por acá se avisa a todo el equipo con acceso al
// módulo Ventas (notificación LEAD_CREATED) y, si el email/teléfono ya tenía un
// lead activo, se fusiona en vez de duplicar (ver publicLeadIntake.controller.js).
export default function ConfiguracionFormularioWeb() {
  const [webhookUrl, setWebhookUrl] = useState(null)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [webhookCopied, setWebhookCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/ventas/lead-webhook').then(({ data }) => setWebhookUrl(data.url || null)).catch(() => {})
  }, [])

  async function handleGenerateWebhook(confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setWebhookLoading(true); setError('')
    try {
      const { data } = await api.post('/ventas/lead-webhook/regenerate')
      setWebhookUrl(data.url)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al generar el link')
    } finally {
      setWebhookLoading(false)
    }
  }

  async function handleRevokeWebhook() {
    if (!window.confirm('¿Desactivar el formulario web? Los envíos que lleguen a ese link van a dejar de crear leads.')) return
    setWebhookLoading(true); setError('')
    try {
      await api.delete('/ventas/lead-webhook')
      setWebhookUrl(null)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al desactivar')
    } finally {
      setWebhookLoading(false)
    }
  }

  function handleCopyWebhook() {
    navigator.clipboard?.writeText(webhookUrl)
    setWebhookCopied(true)
    setTimeout(() => setWebhookCopied(false), 1500)
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Formulario web → Leads automáticos</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Un link que, al recibir un envío, crea un Lead automáticamente en este workspace (o lo fusiona con uno ya abierto del mismo contacto). Pensado para conectar el formulario de contacto de tu sitio (ej. Contact Form 7 + el plugin "WP Webhooks" en WordPress, mapeando los campos <code>name</code>, <code>email</code>, <code>phone</code>, <code>company</code> y <code>message</code>). Todo el equipo con acceso a Ventas recibe un aviso cuando llega uno nuevo.
      </p>
      {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 mb-3">{error}</p>}
      {webhookUrl ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input className={`${input} flex-1 font-mono text-xs`} readOnly value={webhookUrl} onClick={e => e.target.select()} />
            <button type="button" onClick={handleCopyWebhook} className="shrink-0 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg px-3 hover:bg-gray-50 dark:hover:bg-gray-700">
              {webhookCopied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <div className="flex gap-3">
            <button type="button" disabled={webhookLoading}
              onClick={() => handleGenerateWebhook('¿Regenerar el link? El anterior deja de funcionar — vas a tener que actualizar la configuración en WordPress.')}
              className="text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-60">
              Regenerar
            </button>
            <button type="button" disabled={webhookLoading} onClick={handleRevokeWebhook}
              className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60">
              Desactivar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={webhookLoading} onClick={() => handleGenerateWebhook(null)}
          className="text-xs font-medium text-primary-600 hover:text-primary-700 border border-dashed border-primary-300 dark:border-primary-700 rounded-full px-3 py-1 disabled:opacity-60">
          {webhookLoading ? 'Generando…' : '+ Generar link'}
        </button>
      )}
    </div>
  )
}
