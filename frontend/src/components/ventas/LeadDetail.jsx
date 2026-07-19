import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import LoadingSpinner from '../LoadingSpinner'
import StatusBadge, { fmtMoney } from './StatusBadge'
import LeadModal from './LeadModal'
import ConvertToProjectModal from './ConvertToProjectModal'
import { LEAD_STATUSES, originLabel } from './salesCatalog'

const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const card = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5'
const sectionTitle = 'text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3'

// Iconos por tipo de evento del timeline automático.
const EVENT_ICON = {
  lead_created: '✨', status_changed: '🔀', owner_changed: '👤', note_added: '📝',
  next_action_set: '📌', proposal_created: '📄', research_run: '🔎',
  converted_to_client: '🎉', project_created: '🚀',
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

  const load = useCallback(async () => {
    const { data } = await api.get(`/ventas/leads/${leadId}`)
    setLead(data)
    setNa({
      title: data.nextActionTitle || '',
      dueAt: data.nextActionDueAt ? data.nextActionDueAt.slice(0, 10) : '',
      ownerId: data.nextActionOwnerId || '',
    })
    setLoading(false)
  }, [leadId])

  useEffect(() => { load() }, [load])

  async function patch(url, body) {
    await api.patch(url, body)
    await load()
    onChanged?.()
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

  async function saveNextAction() {
    await api.put(`/ventas/leads/${leadId}/next-action`, {
      title: na.title.trim() || null,
      dueAt: na.dueAt || null,
      ownerId: na.ownerId ? Number(na.ownerId) : null,
    })
    setNaOpen(false)
    await load()
    onChanged?.()
  }

  async function handleDelete() {
    if (!window.confirm('¿Eliminar este lead? Esta acción no se puede deshacer.')) return
    await api.delete(`/ventas/leads/${leadId}`)
    onChanged?.()
    onBack()
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
          <button onClick={onBack} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-2">← Volver al pipeline</button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{c?.name || 'Lead'}</h1>
            <StatusBadge status={lead.status} />
          </div>
          {lead.title && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{lead.title}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowEdit(true)} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl px-3 py-2 text-sm font-medium">Editar</button>
          <button onClick={handleDelete} className="border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl px-3 py-2 text-sm font-medium">Eliminar</button>
        </div>
      </div>

      {/* Acciones comerciales */}
      <div className="flex flex-wrap gap-2">
        <IaActionButton icon="🔎" label="Investigar empresa" />
        <IaActionButton icon="📄" label="Crear propuesta" />
        {!lead.convertedProjectId
          ? <button onClick={() => setShowConvert(true)} className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-4 py-2 text-sm font-semibold">🚀 Crear proyecto</button>
          : <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-xl px-4 py-2 font-medium">✓ Proyecto: {lead.convertedProject?.name}</span>}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Columna izquierda: datos */}
        <div className="space-y-5">
          {/* Información principal */}
          <div className={card}>
            <h3 className={sectionTitle}>Información principal</h3>
            <dl className="space-y-3 text-sm">
              <Row label="Estado">
                <select value={lead.status} onChange={e => patch(`/ventas/leads/${leadId}/status`, { status: e.target.value })} className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1 text-sm">
                  {LEAD_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </Row>
              <Row label="Responsable">
                <select value={lead.ownerId || ''} onChange={e => patch(`/ventas/leads/${leadId}/owner`, { ownerId: e.target.value ? Number(e.target.value) : null })} className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-2 py-1 text-sm">
                  <option value="">Sin asignar</option>
                  {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Row>
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
            <h3 className={sectionTitle}>Contacto principal</h3>
            {ct ? (
              <dl className="space-y-2 text-sm">
                <Row label="Nombre">{ct.name}</Row>
                <Row label="Cargo">{ct.title || '—'}</Row>
                <Row label="Email">{ct.email ? <a href={`mailto:${ct.email}`} className="text-primary-600 hover:underline">{ct.email}</a> : '—'}</Row>
                <Row label="Teléfono">{ct.phone || '—'}</Row>
              </dl>
            ) : <p className="text-sm text-gray-400">Sin contacto principal.</p>}
          </div>

          {/* Próxima acción */}
          <div className={card}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`${sectionTitle} mb-0`}>Próxima acción</h3>
              <button onClick={() => setNaOpen(o => !o)} className="text-xs text-primary-600 hover:underline">{naOpen ? 'Cerrar' : (lead.nextActionTitle ? 'Editar' : 'Definir')}</button>
            </div>
            {!naOpen ? (
              lead.nextActionTitle ? (
                <div className="text-sm">
                  <div className="font-medium text-gray-900 dark:text-white">{lead.nextActionTitle}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {lead.nextActionDueAt ? `📅 ${fmtDate(lead.nextActionDueAt)}` : 'Sin fecha'}
                    {lead.nextActionOwner ? ` · ${lead.nextActionOwner.name}` : ''}
                  </div>
                </div>
              ) : <p className="text-sm text-gray-400">Sin próxima acción definida.</p>
            ) : (
              <div className="space-y-2">
                <input className={input} placeholder="Ej. Llamar, Enviar propuesta…" value={na.title} onChange={e => setNa({ ...na, title: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" className={input} value={na.dueAt} onChange={e => setNa({ ...na, dueAt: e.target.value })} />
                  <select className={input} value={na.ownerId} onChange={e => setNa({ ...na, ownerId: e.target.value })}>
                    <option value="">Responsable…</option>
                    {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <button onClick={saveNextAction} className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2 text-sm font-semibold">Guardar acción</button>
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha: timeline + notas */}
        <div className={card}>
          <h3 className={sectionTitle}>Historial y notas</h3>
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
      </div>

      {showEdit && <LeadModal lead={lead} companies={companies} team={team} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); load(); onChanged?.() }} />}
      {showConvert && <ConvertToProjectModal lead={lead} onClose={() => setShowConvert(false)} onConverted={() => { setShowConvert(false); load(); onChanged?.() }} />}
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

// Acción de IA (Investigar / Propuesta). La lógica IA se implementa en la Fase 2;
// el botón deja el punto de integración visible y explica el estado.
function IaActionButton({ icon, label }) {
  const [hint, setHint] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setHint(h => !h)} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl px-4 py-2 text-sm font-medium">
        {icon} {label}
      </button>
      {hint && (
        <div className="absolute z-10 mt-1 w-56 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
          Disponible próximamente — la generación con IA (Claude) se activa en la Fase 2.
        </div>
      )}
    </div>
  )
}
