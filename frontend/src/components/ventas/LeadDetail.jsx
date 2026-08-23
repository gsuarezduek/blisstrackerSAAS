import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../LoadingSpinner'
import ConfirmModal from '../ConfirmModal'
import StatusBadge, { fmtMoney } from './StatusBadge'
import LostReasonModal from './LostReasonModal'
import LeadModal from './LeadModal'
import ConvertToProjectModal from './ConvertToProjectModal'
import ResearchPanel from './ResearchPanel'
import ProposalsPanel from './ProposalsPanel'
import WhatsappLeadCard from './WhatsappLeadCard'
import LeadNotes from './LeadNotes'
import CollapsibleSectionHeader from './CollapsibleSectionHeader'
import { LEAD_STATUSES, originLabel, statusMeta } from './salesCatalog'

const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const card = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5'
const sectionTitle = 'text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3'

// Iconos por tipo de evento del timeline automático.
const EVENT_ICON = {
  lead_created: '✨', status_changed: '🔀', owner_changed: '👤', note_added: '📝',
  next_action_set: '📌', next_action_added: '📌', next_action_done: '✅',
  proposal_created: '📄', research_run: '🔎', diagnostic_report_created: '📣',
  converted_to_client: '🎉', project_created: '🚀',
  archived: '🗄', unarchived: '↩️', whatsapp_message: '💬', whatsapp_insight: '🧠',
}

function fmtDateTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function LeadDetail({ leadId, team, companies, onBack, onChanged }) {
  const { user } = useAuth()
  const [lead, setLead] = useState(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [showConvert, setShowConvert] = useState(false)
  const [naOpen, setNaOpen] = useState(false)
  const [na, setNa] = useState({ title: '', dueAt: '', ownerId: '' })
  const [histOpen, setHistOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [savingAction, setSavingAction] = useState(false)
  const [contactEdit, setContactEdit] = useState(false)
  const [ncMode, setNcMode] = useState(false) // sub-form "nuevo contacto"
  const [nc, setNc] = useState({ name: '', title: '', email: '', phone: '' })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Al pasar a estado Perdido se pide el motivo en un modal (no window.prompt).
  const [lostPendingStatus, setLostPendingStatus] = useState(null)
  const [lostSaving, setLostSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await api.get(`/ventas/leads/${leadId}`)
    setLead(data)
    setLoading(false)
  }, [leadId])

  useEffect(() => { load() }, [load])

  async function patch(url, body) {
    await api.patch(url, body)
    await load()
    onChanged?.()
  }

  function handleStatusChange(status) {
    if (status === lead.status) return
    if (statusMeta(status)?.isLost) {
      setLostPendingStatus(status) // pide el motivo antes de aplicar el cambio
      return
    }
    patch(`/ventas/leads/${leadId}/status`, { status })
  }

  async function confirmLost(reason) {
    setLostSaving(true)
    try {
      await patch(`/ventas/leads/${leadId}/status`, { status: lostPendingStatus, lostReason: reason })
      setLostPendingStatus(null)
    } finally {
      setLostSaving(false)
    }
  }

  async function addNote() {
    if (!note.trim()) return
    await api.post(`/ventas/leads/${leadId}/notes`, { content: note.trim() })
    setNote('')
    await load()
  }

  async function deleteNote(id) {
    await api.delete(`/ventas/leads/${leadId}/notes/${id}`)
    await load()
  }

  function toggleAddAction() {
    setNaOpen(o => {
      const opening = !o
      if (opening && !na.ownerId && user?.id) setNa(n => ({ ...n, ownerId: String(user.id) }))
      return opening
    })
  }

  async function addAction() {
    if (!na.title.trim()) return
    setSavingAction(true)
    try {
      await api.post(`/ventas/leads/${leadId}/actions`, {
        title: na.title.trim(),
        dueAt: na.dueAt || null,
        ownerId: na.ownerId ? Number(na.ownerId) : undefined,
      })
      setNa({ title: '', dueAt: '', ownerId: user?.id ? String(user.id) : '' })
      setNaOpen(false)
      await load()
      onChanged?.()
    } finally {
      setSavingAction(false)
    }
  }

  async function resolveAction(actionId) {
    await api.patch(`/ventas/leads/${leadId}/actions/${actionId}/resolve`)
    await load()
    onChanged?.()
  }

  async function deleteAction(actionId) {
    await api.delete(`/ventas/leads/${leadId}/actions/${actionId}`)
    await load()
  }

  // Asigna un contacto existente de la empresa como contacto principal del lead (o lo quita).
  async function setPrimaryContact(contactId) {
    await api.patch(`/ventas/leads/${leadId}`, { primaryContactId: contactId ? Number(contactId) : null })
    setContactEdit(false); setNcMode(false)
    await load(); onChanged?.()
  }

  // Crea un contacto nuevo en la empresa y lo deja como contacto principal.
  async function createAndAssignContact() {
    if (!nc.name.trim()) return
    const { data } = await api.post('/ventas/contacts', { companyId: lead.companyId, ...nc })
    await api.patch(`/ventas/leads/${leadId}`, { primaryContactId: data.id })
    setNc({ name: '', title: '', email: '', phone: '' }); setNcMode(false); setContactEdit(false)
    await load(); onChanged?.()
  }

  async function toggleArchive() {
    await patch(`/ventas/leads/${leadId}/archive`, { archived: !lead.archived })
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/ventas/leads/${leadId}`)
      onChanged?.()
      onBack()
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading || !lead) return <LoadingSpinner />

  const c = lead.company
  const ct = lead.primaryContact
  const canDeleteNote = a => a.userId === user?.id || user?.isAdmin

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button onClick={onBack} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-2">← Volver</button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{c?.name || 'Lead'}</h1>
            <StatusBadge status={lead.status} title={lead.status === 'perdido' ? lead.lostReason : undefined} />
            {lead.archived && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">🗄 Archivado</span>}
          </div>
          {lead.title && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{lead.title}</p>}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {!lead.convertedProjectId
            ? ['propuesta', 'ganado'].includes(lead.status)
              ? <button onClick={() => setShowConvert(true)} className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-4 py-2 text-sm font-semibold">🚀 Crear proyecto</button>
              : <span title="El lead debe estar en Propuesta o Ganado para convertirlo en proyecto" className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">🚀 Crear proyecto (requiere Propuesta o Ganado)</span>
            : <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-xl px-3 py-2 font-medium">✓ Proyecto: {lead.convertedProject?.name}</span>}
          <button onClick={() => setShowEdit(true)} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl px-3 py-2 text-sm font-medium">Editar</button>
          <button onClick={toggleArchive} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl px-3 py-2 text-sm font-medium">
            {lead.archived ? '↩️ Desarchivar' : '🗄 Archivar'}
          </button>
          <button onClick={() => setConfirmDelete(true)} className="border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl px-3 py-2 text-sm font-medium">Eliminar</button>
        </div>
      </div>

      <ConfirmModal
        open={confirmDelete}
        title="Eliminar lead"
        message="Esta acción no se puede deshacer."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* Notas de reunión + Investigación de la empresa (IA) — 50/50, arriba de todo */}
      <div className="grid lg:grid-cols-2 gap-5">
        <LeadNotes leadId={leadId} initialContent={lead.notes} />
        <ResearchPanel leadId={leadId} companyName={c?.name} onChanged={load} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Columna izquierda: Información, Empresa, Contacto */}
        <div className="space-y-5">
          {/* Información principal */}
          <div className={card}>
            <h3 className={sectionTitle}>Información principal</h3>
            <dl className="space-y-3 text-sm">
              <Row label="Estado">
                <select value={lead.status} onChange={e => handleStatusChange(e.target.value)} className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1 text-sm">
                  {LEAD_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </Row>
              <Row label="Responsable">
                <select value={lead.ownerId || ''} onChange={e => patch(`/ventas/leads/${leadId}/owner`, { ownerId: e.target.value ? Number(e.target.value) : null })} className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1 text-sm">
                  <option value="">Sin asignar</option>
                  {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Row>
              {lead.status === 'perdido' && lead.lostReason && <Row label="Motivo de pérdida">{lead.lostReason}</Row>}
              <Row label="Origen">{originLabel(lead.origin)}</Row>
              <Row label="Valor estimado">{fmtMoney(lead.estimatedValue, lead.currency)}</Row>
              <Row label="Próximo contacto">{fmtDate(lead.nextContactAt)}</Row>
              <Row label="Creado">{fmtDate(lead.createdAt)}{lead.createdBy ? ` · ${lead.createdBy.name}` : ''}</Row>
            </dl>
          </div>

          {/* Empresa */}
          <div className={card}>
            <h3 className={sectionTitle}>Empresa</h3>
            <dl className="space-y-2 text-sm">
              <Row label="Nombre">{c?.name}</Row>
              <Row label="Sitio web">{c?.website ? <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">{c.website}</a> : '—'}</Row>
              <Row label="Rubro">{c?.industry || '—'}</Row>
              {c?.notes && <Row label="Observaciones">{c.notes}</Row>}
            </dl>
          </div>

          {/* Contacto */}
          <div className={card}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`${sectionTitle} mb-0`}>Contacto principal</h3>
              <button onClick={() => { setContactEdit(e => !e); setNcMode(false) }} className="text-xs text-primary-600 hover:underline">
                {contactEdit ? 'Cerrar' : (ct ? 'Cambiar' : 'Asignar')}
              </button>
            </div>

            {!contactEdit ? (
              ct ? (
                <dl className="space-y-2 text-sm">
                  <Row label="Nombre">{ct.name}</Row>
                  <Row label="Cargo">{ct.title || '—'}</Row>
                  <Row label="Email">{ct.email ? <a href={`mailto:${ct.email}`} className="text-primary-600 hover:underline">{ct.email}</a> : '—'}</Row>
                  <Row label="Teléfono">{ct.phone || '—'}</Row>
                </dl>
              ) : <p className="text-sm text-gray-400">Sin contacto principal.</p>
            ) : ncMode ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input className={input} placeholder="Nombre *" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} />
                  <input className={input} placeholder="Cargo" value={nc.title} onChange={e => setNc({ ...nc, title: e.target.value })} />
                  <input className={input} placeholder="Email" value={nc.email} onChange={e => setNc({ ...nc, email: e.target.value })} />
                  <input className={input} placeholder="Teléfono" value={nc.phone} onChange={e => setNc({ ...nc, phone: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setNcMode(false)} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg py-2 text-sm">Volver</button>
                  <button onClick={createAndAssignContact} disabled={!nc.name.trim()} className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-semibold">Crear y asignar</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <select className={input} value={lead.primaryContactId || ''} onChange={e => setPrimaryContact(e.target.value)}>
                  <option value="">Sin contacto principal</option>
                  {(c?.contacts || []).map(x => <option key={x.id} value={x.id}>{x.name}{x.title ? ` — ${x.title}` : ''}</option>)}
                </select>
                <button onClick={() => setNcMode(true)} className="text-xs text-primary-600 hover:underline">＋ Nuevo contacto</button>
              </div>
            )}
          </div>

        </div>

        {/* Columna derecha: Próximas acciones + Propuestas + Historial */}
        <div className="space-y-5">
        {/* Próximas acciones */}
        <div className={card}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`${sectionTitle} mb-0`}>Próximas acciones</h3>
            <button onClick={toggleAddAction} className="text-xs text-primary-600 hover:underline">{naOpen ? 'Cerrar' : '+ Agregar'}</button>
          </div>

          {naOpen && (
            <div className="space-y-2 mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
              <input className={input} placeholder="Ej. Llamar, Enviar propuesta…" value={na.title} onChange={e => setNa({ ...na, title: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') addAction() }} />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" className={input} value={na.dueAt} onChange={e => setNa({ ...na, dueAt: e.target.value })} />
                <select className={input} value={na.ownerId} onChange={e => setNa({ ...na, ownerId: e.target.value })}>
                  <option value="">Responsable…</option>
                  {team.map(m => <option key={m.id} value={m.id}>{m.name}{String(m.id) === String(user?.id) ? ' (vos)' : ''}</option>)}
                </select>
              </div>
              {na.dueAt && (
                <p className="text-[11px] text-gray-400">📌 Además se crea una tarea futura para el responsable, con fecha {fmtDate(na.dueAt)}.</p>
              )}
              <button onClick={addAction} disabled={!na.title.trim() || savingAction} className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-semibold">
                {savingAction ? 'Agregando...' : 'Agregar acción'}
              </button>
            </div>
          )}

          {lead.actions.filter(a => a.status === 'pending').length === 0 ? (
            <p className="text-sm text-gray-400">Sin próximas acciones pendientes.</p>
          ) : (
            <ul className="space-y-2">
              {lead.actions.filter(a => a.status === 'pending').map(a => (
                <li key={a.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 dark:text-white">{a.title}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {a.dueAt ? `📅 ${fmtDate(a.dueAt)}` : 'Sin fecha'}
                      {a.owner ? ` · ${a.owner.name}` : ''}
                      {a.taskId ? ' · 🔗 tarea creada' : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => resolveAction(a.id)} className="text-xs font-medium text-green-600 hover:underline">✓ Resolver</button>
                    <button onClick={() => deleteAction(a.id)} className="text-xs text-gray-400 hover:text-red-500">✕</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {lead.actions.filter(a => a.status === 'done').length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setHistOpen(o => !o)} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">
                {histOpen ? 'Ocultar' : 'Ver'} historial ({lead.actions.filter(a => a.status === 'done').length})
              </button>
              {histOpen && (
                <ul className="mt-2 space-y-1.5">
                  {lead.actions.filter(a => a.status === 'done').map(a => (
                    <li key={a.id} className="text-xs text-gray-400">
                      <span className="line-through">{a.title}</span> — resuelta {fmtDate(a.doneAt)}{a.doneBy ? ` por ${a.doneBy.name}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <ProposalsPanel leadId={leadId} companyName={c?.name} currency={lead.currency} onChanged={load} />
        <WhatsappLeadCard leadId={leadId} lead={lead} onChanged={load} />
        <div className={card}>
          <CollapsibleSectionHeader
            title="🕘 Historial"
            hasContent={lead.activities.length > 0}
            open={timelineOpen}
            onToggle={() => setTimelineOpen(o => !o)}
          />
          {timelineOpen && (
          <div className="mt-3">
          <div className="flex gap-2 mb-4">
            <input className={input} placeholder="Agregar una nota (reunión, llamada, comentario…)" value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addNote() }} />
            <button onClick={addNote} disabled={!note.trim()} className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg px-4 text-sm font-semibold shrink-0">Agregar</button>
          </div>

          <ol className="space-y-3">
            {lead.activities.length === 0 && <li className="text-sm text-gray-400">Sin actividad todavía.</li>}
            {lead.activities.map(a => (
              <li key={a.id} className="flex gap-3">
                <div className="shrink-0 text-lg leading-none mt-0.5">{a.kind === 'note' ? '📝' : (EVENT_ICON[a.type] || '•')}</div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${a.kind === 'note' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
                    {a.kind === 'event' && <span className="font-medium">{a.user?.name || 'Sistema'} </span>}
                    {a.content}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                    <span>{a.kind === 'note' && a.user?.name ? `${a.user.name} · ` : ''}{fmtDateTime(a.createdAt)}</span>
                    {a.kind === 'note' && canDeleteNote(a) && (
                      <button onClick={() => deleteNote(a.id)} className="text-red-400 hover:text-red-600">Borrar</button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          </div>
          )}
        </div>
        </div>
      </div>

      {showEdit && <LeadModal lead={lead} companies={companies} team={team} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); load(); onChanged?.() }} />}
      {showConvert && <ConvertToProjectModal lead={lead} onClose={() => setShowConvert(false)} onConverted={() => { setShowConvert(false); load(); onChanged?.() }} />}
      <LostReasonModal open={!!lostPendingStatus} loading={lostSaving} onConfirm={confirmLost} onCancel={() => setLostPendingStatus(null)} />
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-gray-500 dark:text-gray-400 shrink-0">{label}</dt>
      <dd className="text-gray-900 dark:text-gray-100 text-right min-w-0">{children}</dd>
    </div>
  )
}
