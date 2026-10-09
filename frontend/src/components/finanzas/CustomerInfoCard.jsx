import { useState } from 'react'
import { Card, CardHeader, TextButton } from '../../pages/project-detail/ui.jsx'
import AutosaveNotes from '../AutosaveNotes'
import api from '../../api/client'

const input = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}
function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-3 text-sm py-1">
      <dt className="text-gray-400 shrink-0">{label}</dt>
      <dd className="text-gray-900 dark:text-white text-right truncate">{children ?? '—'}</dd>
    </div>
  )
}

const CUIT_RE = /^\d{2}-\d{8}-\d$/

// "Datos" (sección 4.5, columna lateral): botón Editar; contacto, teléfono,
// mail, CUIT, servicio contratado; métricas; notas con autoguardado.
export default function CustomerInfoCard({ customer, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setForm({ contactName: customer.contactName || '', phone: customer.phone || '', email: customer.email || '', taxId: customer.taxId || '', contractedService: customer.contractedService || '' })
    setEditing(true); setError('')
  }

  async function handleSave() {
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError('Mail inválido'); return }
    if (form.taxId && !CUIT_RE.test(form.taxId)) { setError('CUIT inválido (formato XX-XXXXXXXX-X)'); return }
    setSaving(true); setError('')
    try {
      await api.patch(`/finanzas/items/${customer.id}`, form)
      setEditing(false)
      onChanged()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  return (
    <Card>
      <CardHeader title="Datos" action={!editing && <TextButton onClick={startEdit}>Editar</TextButton>} />
      <div className="px-4 pb-4">
        {editing ? (
          <div className="space-y-2">
            <input className={input} placeholder="Contacto" value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} />
            <input className={input} placeholder="Teléfono" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <input className={input} placeholder="Mail" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input className={input} placeholder="CUIT (XX-XXXXXXXX-X)" value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })} />
            <input className={input} placeholder="Servicio contratado" value={form.contractedService} onChange={e => setForm({ ...form, contractedService: e.target.value })} />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(false)} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg py-1.5 text-xs font-medium">Cancelar</button>
              <button disabled={saving} onClick={handleSave} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-1.5 text-xs font-medium disabled:opacity-50">Guardar</button>
            </div>
          </div>
        ) : (
          <dl>
            <Row label="Contacto">{customer.contactName}</Row>
            <Row label="Teléfono">{customer.phone}</Row>
            <Row label="Mail">{customer.email}</Row>
            <Row label="CUIT">{customer.taxId}</Row>
            <Row label="Servicio contratado">{customer.contractedService}</Row>
            {customer.project && <Row label="Proyecto">{customer.project.name}</Row>}
          </dl>
        )}

        <div className="border-t border-gray-100 dark:border-gray-700 mt-3 pt-3">
          <dl>
            <Row label="Facturas emitidas">{customer.metrics.invoiceCount}</Row>
            <Row label="Días promedio de cobro">{customer.metrics.avgDaysToCollect != null ? `${customer.metrics.avgDaysToCollect}d` : '—'}</Row>
            <Row label="Último cobro">{fmtDate(customer.metrics.lastPaymentAt)}</Row>
          </dl>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 mt-3 pt-3">
          <AutosaveNotes
            label="Notas" content={customer.notes} emptyText="Sin notas todavía." minHeight={100}
            editorKey={customer.id}
            onSave={async (html) => { await api.patch(`/finanzas/items/${customer.id}`, { notes: html }) }}
          />
        </div>
      </div>
    </Card>
  )
}
