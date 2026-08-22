import { useState } from 'react'
import api from '../../api/client'

// Conecta (o edita) el WhatsApp del workspace pegando las credenciales
// obtenidas del dashboard del BSP (hoy: Chakra, Admin ▸ Team ▸ Secrets) —
// mismo patrón que el "Token de Business Manager" ya usado para Meta
// Ads/Instagram/Facebook, no un redirect OAuth (el embedded signup
// multi-tenant de Chakra no está confirmado, ver Fase 1 del plan de
// WhatsApp). Solo admin/owner (ver whatsapp.routes.js).
//
// `initialAccount` (opcional): si se pasa, el form arranca en modo edición —
// prellena los campos no sensibles (nunca los secretos, el backend no los
// devuelve) y accessToken/webhookSecret quedan opcionales: dejarlos vacíos
// conserva lo ya guardado en vez de pisarlo.
export default function WhatsappConnectForm({ onClose, onConnected, initialAccount }) {
  const isEdit = Boolean(initialAccount)
  const [form, setForm] = useState({
    id: initialAccount?.id || null,
    phoneNumberId: initialAccount?.phoneNumberId || '',
    wabaId: initialAccount?.wabaId || '',
    displayPhoneNumber: initialAccount?.displayPhoneNumber || '',
    pluginId: initialAccount?.pluginId || '',
    accessToken: '',
    webhookSecret: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function set(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.phoneNumberId.trim() || !form.pluginId.trim()) {
      setError('phoneNumberId y Plugin ID son obligatorios')
      return
    }
    if (!isEdit && !form.accessToken.trim()) {
      setError('accessToken es obligatorio para conectar por primera vez')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { data } = await api.post('/whatsapp/account', form)
      onConnected(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo conectar la cuenta')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{isEdit ? 'Editar conexión de WhatsApp' : 'Conectar WhatsApp'}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {isEdit
            ? 'Los campos de token/secret quedan vacíos por seguridad — dejalos así si no cambiaron.'
            : 'Pegá los datos del número que diste de alta en tu dashboard de Chakra (Admin ▸ WhatsApp Setup / Admin ▸ Team ▸ Secrets).'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field
            label="Phone Number ID *"
            value={form.phoneNumberId}
            onChange={set('phoneNumberId')}
            placeholder="1300293189836092"
            hint="El ID técnico numérico (metadata.phone_number_id en el payload de Meta) — NO el número en formato +54 9 11..., ese va en el campo de abajo."
          />
          <Field label="WABA ID" value={form.wabaId} onChange={set('wabaId')} placeholder="identifica la cuenta ante los webhooks" />
          <Field label="Número (informativo)" value={form.displayPhoneNumber} onChange={set('displayPhoneNumber')} placeholder="+54 9 11 2233-4455" />
          <Field label="Plugin ID *" value={form.pluginId} onChange={set('pluginId')} placeholder="UUID del plugin de WhatsApp en Chakra" />
          <Field label={isEdit ? 'Access Token (dejar vacío para no cambiar)' : 'Access Token *'} value={form.accessToken} onChange={set('accessToken')} placeholder="token permanente" secret />
          <Field label={isEdit ? 'Webhook Secret (dejar vacío para no cambiar)' : 'Webhook Secret'} value={form.webhookSecret} onChange={set('webhookSecret')} placeholder="para verificar la firma del webhook" secret />

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-xl">
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Conectar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, secret, disabled, hint }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</span>
      <input
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 disabled:opacity-60"
      />
      {hint && <span className="block text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{hint}</span>}
    </label>
  )
}
