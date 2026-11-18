// Mailing → Bases y contactos. A la izquierda las bases (con sus suscriptos), a la
// derecha los contactos del proyecto filtrados por base / estado / texto. Un
// contacto es único por proyecto y puede estar en varias bases.
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import api from '../../../api/client'
import { Icon } from '../../ui/Icon'
import ConfirmModal from '../../ConfirmModal'
import CsvImportModal from './CsvImportModal'
import {
  Card, Modal, Field, inputCls, btnPrimary, btnSecondary, btnGhost, ErrorNote,
  StatusPill, CONTACT_STATUS, apiError, fmtInt,
} from './ui'

function ListModal({ list, onClose, onSave }) {
  const [name, setName] = useState(list?.name || '')
  const [description, setDescription] = useState(list?.description || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit() {
    setSaving(true); setError('')
    try { await onSave({ name, description }); onClose() }
    catch (err) { setError(apiError(err, 'No se pudo guardar')) }
    finally { setSaving(false) }
  }
  return (
    <Modal title={list ? 'Editar base' : 'Nueva base'} onClose={onClose}
      footer={<><button className={btnSecondary} onClick={onClose}>Cancelar</button><button className={btnPrimary} disabled={!name.trim() || saving} onClick={submit}>Guardar</button></>}>
      <div className="space-y-3">
        <Field label="Nombre"><input autoFocus className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="Clientes, Newsletter web, Evento 2026…" /></Field>
        <Field label="Descripción (opcional)"><input className={inputCls} value={description} onChange={e => setDescription(e.target.value)} /></Field>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  )
}

function ContactModal({ contact, lists, onClose, onSave }) {
  const [form, setForm] = useState({
    email: contact?.email || '', firstName: contact?.firstName || '', lastName: contact?.lastName || '',
    listIds: contact?.listIds || [], fieldsText: Object.entries(contact?.fields || {}).map(([k, v]) => `${k}=${v}`).join('\n'),
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  async function submit() {
    setSaving(true); setError('')
    const fields = {}
    for (const line of form.fieldsText.split('\n')) {
      const i = line.indexOf('=')
      if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
    try {
      await onSave({ email: form.email, firstName: form.firstName, lastName: form.lastName, listIds: form.listIds, fields })
      onClose()
    } catch (err) { setError(apiError(err, 'No se pudo guardar')) }
    finally { setSaving(false) }
  }
  return (
    <Modal title={contact ? 'Editar contacto' : 'Nuevo contacto'} onClose={onClose}
      footer={<><button className={btnSecondary} onClick={onClose}>Cancelar</button><button className={btnPrimary} disabled={!form.email.trim() || saving} onClick={submit}>Guardar</button></>}>
      <div className="space-y-3">
        <Field label="Email"><input autoFocus className={inputCls} value={form.email} onChange={e => set('email', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre"><input className={inputCls} value={form.firstName} onChange={e => set('firstName', e.target.value)} /></Field>
          <Field label="Apellido"><input className={inputCls} value={form.lastName} onChange={e => set('lastName', e.target.value)} /></Field>
        </div>
        {lists.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Bases</p>
            <div className="flex flex-wrap gap-2">
              {lists.map(l => {
                const on = form.listIds.includes(l.id)
                return (
                  <button type="button" key={l.id} onClick={() => set('listIds', on ? form.listIds.filter(x => x !== l.id) : [...form.listIds, l.id])}
                    className={`text-xs px-2.5 py-1 rounded-full border ${on ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                    {l.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <Field label="Variables personalizadas (opcional)" hint={<>Una por línea, <code>clave=valor</code>. Se usan en el mail como <code>{'{{campo.clave}}'}</code>.</>}>
          <textarea rows={3} className={inputCls} value={form.fieldsText} onChange={e => set('fieldsText', e.target.value)} placeholder="ciudad=Rosario" />
        </Field>
        {!contact && <p className="text-[11px] text-gray-500">Si el email ya existe en el proyecto, se suma a las bases elegidas sin cambiar su estado (un dado de baja sigue dado de baja).</p>}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  )
}

export default function ContactsPanel({ projectId }) {
  const base = `/marketing/projects/${projectId}/mailing`
  const [lists, setLists] = useState([])
  const [counts, setCounts] = useState(null)
  const [listId, setListId] = useState(null)
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], total: 0, pageSize: 50 })
  const [selected, setSelected] = useState([])
  const [modal, setModal] = useState(null) // { type: 'list'|'contact'|'import', item? }
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState('')

  const loadLists = useCallback(() => {
    api.get(`${base}/lists`).then(r => { setLists(r.data.lists); setCounts(r.data.contactCounts) }).catch(() => {})
  }, [base])

  const loadContacts = useCallback(() => {
    const params = { page, pageSize: 50 }
    if (listId) params.listId = listId
    if (status) params.status = status
    if (q.trim()) params.q = q.trim()
    api.get(`${base}/contacts`, { params }).then(r => { setData(r.data); setSelected([]) }).catch(err => setError(apiError(err)))
  }, [base, page, listId, status, q])

  useEffect(loadLists, [loadLists])
  useEffect(() => { const t = setTimeout(loadContacts, q ? 300 : 0); return () => clearTimeout(t) }, [loadContacts, q])
  useEffect(() => { setPage(1) }, [listId, status, q])

  const refresh = () => { loadLists(); loadContacts() }

  async function saveList(payload, list) {
    if (list) await api.patch(`${base}/lists/${list.id}`, payload)
    else await api.post(`${base}/lists`, payload)
    loadLists()
  }
  async function saveContact(payload, contact) {
    if (contact) await api.patch(`${base}/contacts/${contact.id}`, payload)
    else await api.post(`${base}/contacts`, payload)
    refresh()
  }
  async function bulk(action, extra = {}) {
    setError('')
    try { await api.post(`${base}/contacts/bulk`, { action, contactIds: selected, ...extra }); refresh() }
    catch (err) { setError(apiError(err)) }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))
  const allOnPage = data.items.length > 0 && data.items.every(c => selected.includes(c.id))
  const activeList = lists.find(l => l.id === listId)

  return (
    <div className="grid lg:grid-cols-4 gap-4">
      <Card className="p-3 h-fit">
        <div className="flex items-center justify-between px-1 mb-2">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Bases</p>
          <button className={btnGhost} onClick={() => setModal({ type: 'list' })}>+ Nueva</button>
        </div>
        <button onClick={() => setListId(null)}
          className={`w-full text-left rounded-lg px-2.5 py-2 text-sm ${!listId ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}>
          Todos los contactos
          {counts && <span className="block text-[11px] text-gray-400 font-normal">{fmtInt(counts.subscribed)} suscriptos de {fmtInt(counts.total)}</span>}
        </button>
        {lists.map(l => (
          <div key={l.id} className={`group flex items-start gap-1 rounded-lg ${listId === l.id ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}>
            <button onClick={() => setListId(l.id)} className="flex-1 min-w-0 text-left px-2.5 py-2">
              <span className={`block text-sm truncate ${listId === l.id ? 'text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>{l.name}</span>
              <span className="block text-[11px] text-gray-400">{fmtInt(l.subscribed)} suscriptos · {fmtInt(l.total)} en total</span>
            </button>
            <div className="hidden group-hover:flex items-center pt-2 pr-1">
              <button className={btnGhost} title="Editar" onClick={() => setModal({ type: 'list', item: l })}><Icon as={Pencil} size={13} /></button>
              <button className={btnGhost} title="Eliminar" onClick={() => setConfirm({ type: 'list', item: l })}><Icon as={Trash2} size={13} /></button>
            </div>
          </div>
        ))}
        {lists.length === 0 && <p className="text-xs text-gray-400 px-2.5 py-2">Creá una base para agrupar contactos (clientes, newsletter, un evento…).</p>}
      </Card>

      <div className="lg:col-span-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${inputCls} max-w-xs`} placeholder="Buscar por email o nombre…" value={q} onChange={e => setQ(e.target.value)} />
          <select className={`${inputCls} w-44`} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(CONTACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div className="flex-1" />
          <button className={btnSecondary} onClick={() => setModal({ type: 'import' })}>Importar CSV</button>
          <button className={btnPrimary} onClick={() => setModal({ type: 'contact' })}>+ Contacto</button>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2 text-xs">
            <span className="font-medium text-gray-700 dark:text-gray-200">{selected.length} seleccionados</span>
            {lists.length > 0 && (
              <select className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1" value=""
                onChange={e => e.target.value && bulk('add-to-list', { listId: Number(e.target.value) })}>
                <option value="">Agregar a base…</option>
                {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            )}
            {activeList && <button className={btnGhost} onClick={() => bulk('remove-from-list', { listId: activeList.id })}>Sacar de «{activeList.name}»</button>}
            <button className={btnGhost} onClick={() => bulk('unsubscribe')}>Dar de baja</button>
            <button className={`${btnGhost} text-red-600`} onClick={() => setConfirm({ type: 'bulk-delete' })}>Eliminar</button>
          </div>
        )}
        <ErrorNote>{error}</ErrorNote>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
                  <th className="w-8 pl-4 py-2.5"><input type="checkbox" className="rounded" checked={allOnPage}
                    onChange={() => setSelected(allOnPage ? [] : data.items.map(c => c.id))} /></th>
                  <th className="text-left px-3 py-2.5 font-medium">Contacto</th>
                  <th className="text-left px-3 py-2.5 font-medium">Estado</th>
                  <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">Bases</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {data.items.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                    <td className="pl-4 py-2.5"><input type="checkbox" className="rounded" checked={selected.includes(c.id)}
                      onChange={() => setSelected(s => s.includes(c.id) ? s.filter(x => x !== c.id) : [...s, c.id])} /></td>
                    <td className="px-3 py-2.5 min-w-0">
                      <p className="text-gray-800 dark:text-gray-200 truncate">{c.email}</p>
                      {(c.firstName || c.lastName) && <p className="text-[11px] text-gray-400">{[c.firstName, c.lastName].filter(Boolean).join(' ')}</p>}
                    </td>
                    <td className="px-3 py-2.5"><StatusPill map={CONTACT_STATUS} status={c.status} /></td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-xs text-gray-500">
                      {c.listIds.map(id => lists.find(l => l.id === id)?.name).filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="pr-3"><button className={btnGhost} title="Editar" onClick={() => setModal({ type: 'contact', item: c })}><Icon as={Pencil} size={13} /></button></td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                    {q || status || listId ? 'No hay contactos con este filtro.' : 'Todavía no hay contactos. Importá un CSV o agregalos a mano.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {data.total > data.pageSize && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500">
              <span>{fmtInt(data.total)} contactos</span>
              <div className="flex items-center gap-2">
                <button className={btnGhost} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
                <span>{page} / {totalPages}</span>
                <button className={btnGhost} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {modal?.type === 'list' && <ListModal list={modal.item} onClose={() => setModal(null)} onSave={p => saveList(p, modal.item)} />}
      {modal?.type === 'contact' && <ContactModal contact={modal.item} lists={lists} onClose={() => setModal(null)} onSave={p => saveContact(p, modal.item)} />}
      {modal?.type === 'import' && <CsvImportModal base={base} lists={lists} defaultListId={listId} onClose={() => setModal(null)} onDone={refresh} />}
      <ConfirmModal
        open={!!confirm}
        title={confirm?.type === 'list' ? `Eliminar la base «${confirm.item.name}»` : `Eliminar ${selected.length} contactos`}
        message={confirm?.type === 'list'
          ? 'Los contactos no se borran: siguen en el proyecto y en sus otras bases.'
          : 'Se borran del proyecto con su historial. Si alguno se había dado de baja, conviene darlo de baja en vez de borrarlo: borrado, una próxima importación lo volvería a suscribir.'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm; setConfirm(null)
          if (c.type === 'list') { await api.delete(`${base}/lists/${c.item.id}`).catch(() => {}); if (listId === c.item.id) setListId(null); refresh() }
          else bulk('delete')
        }}
      />
    </div>
  )
}
