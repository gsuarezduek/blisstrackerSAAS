import { useEffect, useState } from 'react'
import { Card, CardHeader, TextButton } from '../../pages/project-detail/ui.jsx'
import AutosaveNotes from '../AutosaveNotes'
import api from '../../api/client'
import { ITEM_IVA_CONDITIONS, itemIvaConditionLabel, normalizeCuit } from './financeCatalog'
import DeleteCustomerModal from './DeleteCustomerModal'

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

// "Datos" (sección 4.5, columna lateral): botón Editar; nombre, razón social,
// contacto, teléfono, mail, CUIT, servicio contratado, proyecto vinculado;
// métricas; notas con autoguardado. Al pie, dar de baja al cliente.
export default function CustomerInfoCard({ customer, issuers, onChanged, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [looking, setLooking] = useState(false)
  const [projects, setProjects] = useState([])
  const [deleting, setDeleting] = useState(false)

  // Los proyectos se piden solo cuando se abre el editor — la tarjeta en modo
  // lectura ya recibe el proyecto vinculado dentro de `customer`.
  useEffect(() => {
    if (!editing || projects.length) return
    api.get('/projects').then(r => setProjects(r.data.filter(pr => !pr.locked))).catch(() => {})
  }, [editing, projects.length])

  async function handleLookup() {
    const normalized = normalizeCuit(form.taxId)
    if (!CUIT_RE.test(normalized)) { setError('CUIT inválido (debe tener 11 dígitos)'); return }
    setForm(f => ({ ...f, taxId: normalized }))
    setLooking(true); setError('')
    try {
      const res = await api.get(`/finanzas/padron/${normalized}`)
      setForm(f => ({
        ...f,
        address: res.data.address || f.address,
        ivaCondition: res.data.ivaCondition || f.ivaCondition,
        legalName: res.data.name || f.legalName,
      }))
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo consultar el padrón')
    } finally { setLooking(false) }
  }

  function startEdit() {
    setForm({
      name: customer.name || '',
      legalName: customer.legalName || '', contactName: customer.contactName || '', phone: customer.phone || '', email: customer.email || '',
      taxId: customer.taxId || '', address: customer.address || '', contractedService: customer.contractedService || '',
      ivaCondition: customer.ivaCondition || '', defaultIssuerId: customer.defaultIssuer?.id ? String(customer.defaultIssuer.id) : '',
      projectId: customer.project?.id ? String(customer.project.id) : '',
    })
    setEditing(true); setError('')
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Nombre requerido'); return }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError('Mail inválido'); return }
    const normalizedTaxId = form.taxId ? normalizeCuit(form.taxId) : form.taxId
    if (normalizedTaxId && !CUIT_RE.test(normalizedTaxId)) { setError('CUIT inválido (debe tener 11 dígitos)'); return }
    setSaving(true); setError('')
    try {
      await api.patch(`/finanzas/items/${customer.id}`, {
        ...form,
        name: form.name.trim(),
        taxId: normalizedTaxId,
        ivaCondition: form.ivaCondition || null,
        defaultIssuerId: form.defaultIssuerId ? Number(form.defaultIssuerId) : null,
        projectId: form.projectId ? Number(form.projectId) : null,
      })
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
            <input className={input} placeholder="Nombre (como lo ves en la app)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className={input} placeholder="Razón social (la que sale en la factura)" value={form.legalName} onChange={e => setForm({ ...form, legalName: e.target.value })} />
            <input className={input} placeholder="Contacto" value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} />
            <input className={input} placeholder="Teléfono" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <input className={input} placeholder="Mail" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <div className="flex gap-1.5">
              <input className={input} placeholder="CUIT (o los 11 dígitos seguidos)" value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })} onBlur={e => setForm(f => ({ ...f, taxId: normalizeCuit(e.target.value) }))} />
              <button type="button" onClick={handleLookup} disabled={looking || !form.taxId} title="Buscar en el padrón de ARCA" className="shrink-0 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg px-2.5 text-xs font-medium disabled:opacity-50">{looking ? '…' : 'Buscar'}</button>
            </div>
            <input className={input} placeholder="Dirección (para facturar electrónicamente)" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            <input className={input} placeholder="Servicio contratado" value={form.contractedService} onChange={e => setForm({ ...form, contractedService: e.target.value })} />
            <select className={input} value={form.ivaCondition} onChange={e => setForm({ ...form, ivaCondition: e.target.value })}>
              <option value="">Condición de IVA (para facturar)</option>
              {ITEM_IVA_CONDITIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <select className={input} value={form.defaultIssuerId} onChange={e => setForm({ ...form, defaultIssuerId: e.target.value })}>
              <option value="">Emisor habitual (ninguno)</option>
              {issuers?.map(is => <option key={is.id} value={is.id}>{is.name}</option>)}
            </select>
            <select className={input} value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })}>
              <option value="">Proyecto vinculado (ninguno)</option>
              {/* El proyecto ya vinculado va igual, aunque sea privado y no venga en la lista. */}
              {customer.project && !projects.some(pr => pr.id === customer.project.id) && <option value={customer.project.id}>{customer.project.name}</option>}
              {projects.map(pr => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
            </select>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(false)} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg py-1.5 text-xs font-medium">Cancelar</button>
              <button disabled={saving} onClick={handleSave} className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-1.5 text-xs font-medium disabled:opacity-50">Guardar</button>
            </div>
          </div>
        ) : (
          <dl>
            <Row label="Nombre">{customer.name}</Row>
            <Row label="Razón social">{customer.legalName}</Row>
            <Row label="Contacto">{customer.contactName}</Row>
            <Row label="Teléfono">{customer.phone}</Row>
            <Row label="Mail">{customer.email}</Row>
            <Row label="CUIT">{customer.taxId}</Row>
            <Row label="Dirección">{customer.address}</Row>
            <Row label="Servicio contratado">{customer.contractedService}</Row>
            <Row label="Condición de IVA">{customer.ivaCondition ? itemIvaConditionLabel(customer.ivaCondition) : null}</Row>
            <Row label="Emisor habitual">{customer.defaultIssuer?.name}</Row>
            <Row label="Proyecto">{customer.project?.name}</Row>
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

        {onDeleted && (
          <div className="border-t border-gray-100 dark:border-gray-700 mt-3 pt-3">
            <button onClick={() => setDeleting(true)} className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline">Eliminar cliente</button>
          </div>
        )}
      </div>

      {deleting && (
        <DeleteCustomerModal customer={customer}
          onClose={() => setDeleting(false)}
          onDone={() => { setDeleting(false); onDeleted() }}
        />
      )}
    </Card>
  )
}
