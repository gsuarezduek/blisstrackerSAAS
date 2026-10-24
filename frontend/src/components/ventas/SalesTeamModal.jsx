import { useState, useEffect } from 'react'
import api from '../../api/client'

const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1'

function newSignature() { return { id: crypto.randomUUID(), label: '', closing: '', name: '', role: '', email: '', phone: '', note: '', showLogo: false } }

// Admin: configuración del módulo Ventas.
//  1. Proyecto para tareas futuras de próximas acciones (Workspace.salesTasksProjectId).
//  2. Indicaciones para propuestas — guía persistente que la IA respeta (Workspace.salesProposalGuidelines).
//  3. Firmas — una o más, datos de contacto que cierran el PDF de la propuesta (Workspace.salesSignatures).
//     Se elige cuál usar al generar/editar cada propuesta (Proposal.signatureId).
// Quién puede usar el módulo (antes "Equipo comercial" acá) ahora se configura desde
// Preferencias → Módulos adicionales, junto con el resto de los módulos.
export default function SalesTeamModal({ onClose, onSaved }) {
  const [guidelines, setGuidelines] = useState('')
  const [signatures, setSignatures] = useState([])
  const [tasksProjectId, setTasksProjectId] = useState('')
  const [projects, setProjects] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [webhookUrl, setWebhookUrl] = useState(null)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [webhookCopied, setWebhookCopied] = useState(false)

  useEffect(() => {
    api.get('/workspaces/current')
      .then(({ data }) => {
        setGuidelines(data.salesProposalGuidelines || '')
        setSignatures(Array.isArray(data.salesSignatures) ? data.salesSignatures : [])
        setTasksProjectId(data.salesTasksProjectId || '')
      })
      .catch(() => {})
    api.get('/projects').then(({ data }) => setProjects(data || [])).catch(() => {})
    api.get('/ventas/lead-webhook').then(({ data }) => setWebhookUrl(data.url || null)).catch(() => {})
  }, [])

  async function handleGenerateWebhook(confirmMsg) {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setWebhookLoading(true)
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
    setWebhookLoading(true)
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

  function addSignature() { setSignatures(s => [...s, newSignature()]) }
  function removeSignature(id) { setSignatures(s => s.filter(x => x.id !== id)) }
  function setSigField(id, k, v) { setSignatures(s => s.map(x => x.id === id ? { ...x, [k]: v } : x)) }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      await api.patch('/workspaces/current', {
        salesProposalGuidelines: guidelines, salesSignatures: signatures,
        salesTasksProjectId: tasksProjectId ? Number(tasksProjectId) : null,
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar'); setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 my-auto">
        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">Configuración de Ventas</h2>

        {/* 1. Proyecto para tareas futuras de próximas acciones */}
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Proyecto para tareas de Ventas</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Cuando una próxima acción tiene fecha, se crea además una tarea futura en el dashboard del responsable. Si el lead ya se convirtió a cliente, se usa su propio proyecto; si no, se usa este.
          </p>
          <select className={input} value={tasksProjectId} onChange={e => setTasksProjectId(e.target.value)}>
            <option value="">Sin configurar (no se crean tareas)</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* 2. Indicaciones para propuestas */}
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Indicaciones para propuestas (IA)</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Guía que la IA respeta al generar toda propuesta: tono, estructura, qué incluir o evitar, formato de precios, etc.
          </p>
          <textarea className={input} rows={5}
            placeholder={'Ej. Tono cercano y directo. Incluí siempre un cronograma por fases y resultados esperados a 90 días. No inventes precios: presentá el presupuesto como estimación.'}
            value={guidelines} onChange={e => setGuidelines(e.target.value)} />
        </div>

        {/* 3. Firmas / Contacto del PDF */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Firmas</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Una o más firmas para cerrar la propuesta en el PDF (sección "Contacto"). Al generar o editar cada propuesta se elige con cuál firmarla.
          </p>
          <div className="space-y-3">
            {signatures.map(sig => (
              <div key={sig.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input className={`${input} flex-1 font-medium`} placeholder={`Nombre de la firma (ej. "Comercial", "Fundador")`} value={sig.label} onChange={e => setSigField(sig.id, 'label', e.target.value)} />
                  <button type="button" onClick={() => removeSignature(sig.id)} className="text-gray-400 hover:text-red-500 text-lg leading-none px-1" title="Eliminar firma">×</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={label}>Cierre</label><input className={input} placeholder="Atte," value={sig.closing} onChange={e => setSigField(sig.id, 'closing', e.target.value)} /></div>
                  <div><label className={label}>Nombre</label><input className={input} placeholder="Nombre y apellido" value={sig.name} onChange={e => setSigField(sig.id, 'name', e.target.value)} /></div>
                  <div><label className={label}>Cargo</label><input className={input} placeholder="Ej. Ejecutivo comercial" value={sig.role} onChange={e => setSigField(sig.id, 'role', e.target.value)} /></div>
                  <div><label className={label}>Email</label><input className={input} placeholder="email@agencia.com" value={sig.email} onChange={e => setSigField(sig.id, 'email', e.target.value)} /></div>
                  <div><label className={label}>Teléfono</label><input className={input} placeholder="+54 …" value={sig.phone} onChange={e => setSigField(sig.id, 'phone', e.target.value)} /></div>
                </div>
                <div>
                  <label className={label}>Texto o frase de cierre (opcional)</label>
                  <textarea className={input} rows={2} placeholder="Ej. Quedamos a disposición para coordinar una reunión." value={sig.note} onChange={e => setSigField(sig.id, 'note', e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={sig.showLogo} onChange={e => setSigField(sig.id, 'showLogo', e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500" />
                  Incluir el logo del workspace en la firma
                </label>
              </div>
            ))}
            {signatures.length === 0 && <p className="text-xs text-gray-400">Sin firmas configuradas.</p>}
            <button type="button" onClick={addSignature} className="text-xs font-medium text-primary-600 hover:text-primary-700 border border-dashed border-primary-300 dark:border-primary-700 rounded-full px-3 py-1">+ Agregar firma</button>
          </div>
        </div>

        {/* 4. Formulario web → Leads automáticos */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Formulario web → Leads automáticos</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Un link que, al recibir un envío, crea un Lead automáticamente en este workspace. Pensado para conectar el formulario de contacto de tu sitio (ej. Contact Form 7 + el plugin "WP Webhooks" en WordPress, mapeando los campos <code>name</code>, <code>email</code>, <code>phone</code>, <code>company</code> y <code>message</code>).
          </p>
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

        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium rounded-xl py-2.5 text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold rounded-xl py-2.5 text-sm">{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
