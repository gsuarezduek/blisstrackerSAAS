import { useState, useEffect } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Ticket } from 'lucide-react'
import { Icon } from '../../components/ui/Icon'

const BENEFIT_TYPES = [
  { value: 'discount_percent', label: 'Descuento %',        hint: 'Porcentaje de descuento sobre la suscripción, para siempre.' },
  { value: 'discount_fixed',   label: 'Descuento fijo',     hint: 'Monto fijo de descuento sobre la suscripción, para siempre.' },
  { value: 'free_months',      label: 'Meses gratis',       hint: '100% de descuento durante los primeros N meses de suscripción.' },
  { value: 'extra_trial_days', label: 'Trial extendido',    hint: 'Reemplaza el largo default del trial (no pasa por Stripe).' },
  { value: 'custom',           label: 'Otro / personalizado', hint: 'Beneficio informal, sin automatización — se gestiona a mano.' },
]

function benefitTypeInfo(value) {
  return BENEFIT_TYPES.find(t => t.value === value) ?? BENEFIT_TYPES[0]
}

function fmtDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Formulario de alta (el beneficio es inmutable una vez creado — ver edición abajo) ───

function InvitationCodeForm({ onSave, onCancel }) {
  const [form, setForm] = useState({
    code: '', description: '', benefitType: 'discount_percent',
    benefitValue: '', currency: 'usd', benefitLabel: '', maxUses: '', expiresAt: '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (form.benefitType === 'custom') {
      if (!form.benefitLabel.trim()) { setError('Describí el beneficio en "Texto a mostrar"'); return }
    } else if (!form.benefitValue || Number(form.benefitValue) <= 0) {
      setError('Ingresá un valor mayor a 0 para el beneficio'); return
    }

    const body = {
      code:        form.code.trim() || undefined,
      description: form.description.trim() || undefined,
      benefitType: form.benefitType,
      benefitValue: form.benefitType === 'custom'
        ? 0
        : form.benefitType === 'discount_fixed'
          ? Math.round(Number(form.benefitValue) * 100) // a centavos
          : Number(form.benefitValue),
      currency:     form.benefitType === 'discount_fixed' ? form.currency.trim().toLowerCase() : undefined,
      benefitLabel: form.benefitLabel.trim() || undefined,
      maxUses:      form.maxUses ? Number(form.maxUses) : undefined,
      expiresAt:    form.expiresAt || undefined,
    }

    setSaving(true)
    try { await onSave(body) }
    catch (e) { setError(e.response?.data?.error || 'Error al crear el código'); setSaving(false) }
  }

  const type = benefitTypeInfo(form.benefitType)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
            Código <span className="text-gray-400">(opcional, se autogenera si se deja vacío)</span>
          </label>
          <input type="text" value={form.code}
            onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
            placeholder="Ej: BIENVENIDA20"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Descripción interna (opcional)</label>
          <input type="text" value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            placeholder="Ej: Campaña de lanzamiento LinkedIn"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">Tipo de beneficio</label>
        <div className="flex flex-wrap gap-2">
          {BENEFIT_TYPES.map(t => (
            <button type="button" key={t.value}
              onClick={() => setForm(p => ({ ...p, benefitType: t.value }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                form.benefitType === t.value
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700'
                  : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >{t.label}</button>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{type.hint}</p>
      </div>

      {form.benefitType !== 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
              {form.benefitType === 'discount_percent' && 'Porcentaje (1-100)'}
              {form.benefitType === 'discount_fixed'   && 'Monto'}
              {form.benefitType === 'free_months'      && 'Cantidad de meses'}
              {form.benefitType === 'extra_trial_days' && 'Cantidad de días'}
            </label>
            <input type="number" min="1" max={form.benefitType === 'discount_percent' ? 100 : undefined} step={form.benefitType === 'discount_fixed' ? '0.01' : '1'}
              value={form.benefitValue}
              onChange={e => setForm(p => ({ ...p, benefitValue: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          {form.benefitType === 'discount_fixed' && (
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Moneda</label>
              <input type="text" value={form.currency}
                onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
                placeholder="usd"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
          Texto a mostrar al usuario {form.benefitType === 'custom' && <span className="text-red-500">*</span>}
          <span className="text-gray-400 font-normal"> (opcional para los demás tipos, se autogenera)</span>
        </label>
        <input type="text" value={form.benefitLabel}
          onChange={e => setForm(p => ({ ...p, benefitLabel: e.target.value }))}
          placeholder={form.benefitType === 'custom' ? 'Ej: 3 meses gratis + onboarding dedicado' : ''}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Cupo de usos (opcional)</label>
          <input type="number" min="1" value={form.maxUses}
            onChange={e => setForm(p => ({ ...p, maxUses: e.target.value }))}
            placeholder="Ilimitado"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Vence el (opcional)</label>
          <input type="date" value={form.expiresAt}
            onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
          {saving ? 'Creando…' : 'Crear código'}
        </button>
      </div>
    </form>
  )
}

// ─── Edición (solo campos no-inmutables) ───────────────────────────────────────

function InvitationCodeEditForm({ ic, onSave, onCancel }) {
  const [form, setForm] = useState({
    description:  ic.description  || '',
    benefitLabel: ic.benefitLabel || '',
    maxUses:      ic.maxUses ?? '',
    expiresAt:    ic.expiresAt ? ic.expiresAt.slice(0, 10) : '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      await onSave({
        description:  form.description.trim() || null,
        benefitLabel: form.benefitLabel.trim() || null,
        maxUses:      form.maxUses !== '' ? Number(form.maxUses) : null,
        expiresAt:    form.expiresAt || null,
      })
    } catch (e) { setError(e.response?.data?.error || 'Error al guardar'); setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
        El código y el beneficio ({benefitTypeInfo(ic.benefitType).label}) no se pueden cambiar una vez creado. Para otro beneficio, creá un código nuevo.
      </p>
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Descripción interna</label>
        <input type="text" value={form.description}
          onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Texto a mostrar al usuario</label>
        <input type="text" value={form.benefitLabel}
          onChange={e => setForm(p => ({ ...p, benefitLabel: e.target.value }))}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Cupo de usos</label>
          <input type="number" min="1" value={form.maxUses}
            onChange={e => setForm(p => ({ ...p, maxUses: e.target.value }))}
            placeholder="Ilimitado"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Vence el</label>
          <input type="date" value={form.expiresAt}
            onChange={e => setForm(p => ({ ...p, expiresAt: e.target.value }))}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex items-center justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={saving}
          className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

// ─── Card de un código ──────────────────────────────────────────────────────

function InvitationCodeCard({ ic, onToggle, onEdit, onDelete }) {
  const expired = ic.expiresAt && new Date(ic.expiresAt) < new Date()
  const maxedOut = ic.maxUses != null && ic.usesCount >= ic.maxUses

  return (
    <div className={`rounded-2xl border-2 p-5 transition-all ${ic.active && !expired && !maxedOut ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-60'}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded">{ic.code}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ic.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
              {ic.active ? 'Activo' : 'Inactivo'}
            </span>
            {expired && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Vencido</span>}
            {maxedOut && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Cupo agotado</span>}
          </div>
          <p className="font-semibold text-gray-900 dark:text-white">{ic.displayLabel}</p>
          {ic.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{ic.description}</p>}
          <div className="flex items-center gap-3 flex-wrap mt-2 text-xs text-gray-400 dark:text-gray-500">
            <span>{ic.usesCount} uso{ic.usesCount !== 1 ? 's' : ''}{ic.maxUses != null ? ` / ${ic.maxUses}` : ' (ilimitado)'}</span>
            {ic.expiresAt && <span>vence {fmtDate(ic.expiresAt)}</span>}
            {ic.workspaces.length > 0 && (
              <span>usado por: {ic.workspaces.map(w => w.name).join(', ')}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => onToggle(ic)}
            title={ic.active ? 'Desactivar' : 'Activar'}
            className={`p-1.5 rounded-lg transition-colors ${ic.active ? 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {ic.active
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              }
            </svg>
          </button>
          <button onClick={() => onEdit(ic)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button onClick={() => onDelete(ic)}
            disabled={ic.usesCount > 0}
            title={ic.usesCount > 0 ? 'Ya tiene usos — desactivalo en vez de borrarlo' : 'Eliminar'}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sección principal ──────────────────────────────────────────────────────

export function SectionInvitationCodes() {
  const [codes,        setCodes]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [creating,     setCreating]     = useState(false)
  const [editing,      setEditing]      = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useEffect(() => {
    api.get('/superadmin/invitation-codes')
      .then(r => setCodes(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate(body) {
    const { data } = await api.post('/superadmin/invitation-codes', body)
    setCodes(prev => [data, ...prev])
    setCreating(false)
  }

  async function handleEdit(body) {
    const { data } = await api.patch(`/superadmin/invitation-codes/${editing.id}`, body)
    setCodes(prev => prev.map(c => c.id === data.id ? data : c))
    setEditing(null)
  }

  async function handleToggle(ic) {
    const { data } = await api.patch(`/superadmin/invitation-codes/${ic.id}`, { active: !ic.active })
    setCodes(prev => prev.map(c => c.id === data.id ? data : c))
  }

  async function handleDelete(ic) {
    await api.delete(`/superadmin/invitation-codes/${ic.id}`)
    setCodes(prev => prev.filter(c => c.id !== ic.id))
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Códigos de invitación</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Códigos opcionales que un usuario puede ingresar al registrarse, con un beneficio asociado (descuento, período gratis, trial extendido u otro).
          </p>
        </div>
        <button
          onClick={() => { setCreating(true); setEditing(null) }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nuevo código
        </button>
      </div>

      {(creating || editing) && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <p className="font-semibold text-gray-900 dark:text-white mb-4">
            {creating ? 'Nuevo código de invitación' : `Editar ${editing.code}`}
          </p>
          {creating
            ? <InvitationCodeForm onSave={handleCreate} onCancel={() => setCreating(false)} />
            : <InvitationCodeEditForm ic={editing} onSave={handleEdit} onCancel={() => setEditing(null)} />
          }
        </div>
      )}

      {loading
        ? <LoadingSpinner className="py-12" />
        : codes.length === 0
          ? (
              <div className="text-center py-16 text-gray-400">
                <p className="mb-3"><Icon as={Ticket} size={32} className="inline-block text-gray-300 dark:text-gray-600" /></p>
                <p className="font-medium text-gray-500 dark:text-gray-400">No hay códigos de invitación creados todavía.</p>
                <p className="text-sm mt-1">Usá "Nuevo código" para dar de alta uno con su beneficio.</p>
              </div>
            )
          : (
              <div className="space-y-3">
                {codes.map(ic => (
                  <InvitationCodeCard
                    key={ic.id}
                    ic={ic}
                    onToggle={handleToggle}
                    onEdit={c => { setEditing(c); setCreating(false) }}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            )
      }

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200 dark:border-gray-700 p-6 text-center">
            <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">¿Eliminar código?</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              "<span className="font-mono font-medium text-gray-700 dark:text-gray-300">{deleteTarget.code}</span>" se eliminará permanentemente.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Cancelar
              </button>
              <button onClick={() => handleDelete(deleteTarget)}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
