import { useState } from 'react'
import api from '../../api/client'

// Config del bot de WhatsApp del workspace (Fase 4 del plan) — solo
// admin/owner (ver whatsapp.routes.js): interruptor maestro + prompt. v1 sin
// horario ni condiciones de activación, ver plan de WhatsApp.
export default function WhatsappBotConfigModal({ config, onClose, onSaved }) {
  const [enabled, setEnabled] = useState(Boolean(config?.enabled))
  const [prompt, setPrompt] = useState(config?.prompt || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { data } = await api.put('/whatsapp/bot', { enabled, prompt })
      onSaved(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">🤖 Bot de WhatsApp</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Mientras esté activo, responde automáticamente los mensajes entrantes usando el historial de cada conversación como
          contexto — hasta que alguien del equipo toca "Tomar el control" en esa conversación puntual. Consume el mismo
          presupuesto de IA del workspace que el resto de las funciones (Reportes, Investigar empresa, etc.).
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Bot activo</span>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Personalidad / instrucciones</span>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={6}
              placeholder="Sos un asistente comercial que responde por WhatsApp en nombre del equipo. Respondé de forma breve, cordial y directa…"
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Vacío = usa un texto genérico por defecto.</span>
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-xl">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
