import { useCallback, useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { Bot, ChevronDown, Trash2 } from 'lucide-react'
import api from '../api/client'
import AutosaveNotes from './AutosaveNotes'
import ConfirmModal from './ConfirmModal'
import { Icon } from './ui/Icon'
import { fmtCreatedAt, createdAtTitle } from '../utils/format'
import { agentName } from '../hooks/useMyAgents'

// Situación de la Cuenta: hojas que se acumulan. Se ve y se edita (con autoguardado) la
// hoja actual — la más nueva —; "+ Nueva hoja" arranca una vacía y la anterior pasa al
// historial de solo lectura, sin perderse. La hoja nueva recién se crea en el backend con
// lo primero que se escribe: si se aprieta "Listo" sin escribir nada, vuelve a mostrarse
// la anterior (una hoja vacía no tapa la situación vigente).

function isBlank(html) {
  return !html || !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

function whenLabel(iso) {
  const txt = fmtCreatedAt(iso)
  return txt === 'hoy' || txt === 'ayer' ? txt : `el ${txt}`
}

function byLabel(user, agent) {
  if (!user && !agent) return ''
  return ` por ${user?.name ?? 'alguien'}${agent ? ` (vía «${agentName(agent)}»)` : ''}`
}

function EntryMeta({ entry }) {
  const edited = new Date(entry.updatedAt) - new Date(entry.createdAt) > 60_000
  const viaAgent = entry.createdByAgent || (edited && entry.updatedByAgent)
  return (
    <span title={createdAtTitle(entry.createdAt)}>
      {viaAgent && <Icon as={Bot} size={12} className="inline mr-1 -mt-0.5" />}
      Creada {whenLabel(entry.createdAt)}{byLabel(entry.createdBy, entry.createdByAgent)}
      {edited && <> · editada {whenLabel(entry.updatedAt)}{byLabel(entry.updatedBy, entry.updatedByAgent)}</>}
    </span>
  )
}

function HistoryItem({ entry, onDelete }) {
  const [open, setOpen] = useState(false)
  const preview = entry.content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  return (
    <li className="py-2">
      <div className="flex items-start gap-2">
        <button onClick={() => setOpen(o => !o)} className="flex-1 min-w-0 text-left group">
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Icon as={ChevronDown} size={14} className={`flex-shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
            <EntryMeta entry={entry} />
          </p>
          {!open && (
            <p className="text-sm text-gray-600 dark:text-gray-300 truncate pl-5 group-hover:text-gray-900 dark:group-hover:text-white">{preview}</p>
          )}
        </button>
        {entry.canDelete && (
          <button onClick={() => onDelete(entry)} title="Borrar hoja"
            className="p-1 text-gray-400 hover:text-red-500 flex-shrink-0">
            <Icon as={Trash2} size={14} />
          </button>
        )}
      </div>
      {open && (
        <div className="situation-content text-sm text-gray-700 dark:text-gray-300 pl-5 mt-1"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(entry.content) }} />
      )}
    </li>
  )
}

export default function ProjectSituation({ encodedProjectId }) {
  const base = `/projects/${encodedProjectId}/situation`
  const [entries, setEntries] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [editorKey, setEditorKey] = useState('loading')
  const [drafting, setDrafting] = useState(false) // hoja nueva todavía sin guardar
  const [editing, setEditing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  // Hoja que edita el autoguardado (null = la próxima escritura crea una hoja nueva).
  // Ref y no estado: onSave tiene que ser estable para AutosaveNotes.
  const currentIdRef = useRef(null)

  const showEntry = useCallback(entry => {
    currentIdRef.current = entry?.id ?? null
    setDrafting(false)
    setEditorKey(`entry-${entry?.id ?? 'none'}`)
  }, [])

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    setLoadError(false)
    api.get(base)
      .then(({ data }) => {
        if (cancelled) return
        setEntries(data.entries)
        showEntry(data.entries[0])
      })
      .catch(() => { if (!cancelled) setLoadError(true) })
    return () => { cancelled = true }
  }, [base, showEntry])

  const handleSave = useCallback(async html => {
    const id = currentIdRef.current
    if (id == null) {
      if (isBlank(html)) return
      const { data } = await api.post(base, { content: html })
      currentIdRef.current = data.id
      setDrafting(false)
      setEntries(prev => [data, ...(prev ?? []).map(e => ({ ...e, isCurrent: false }))])
    } else {
      const { data } = await api.patch(`${base}/${id}`, { content: html })
      setEntries(prev => prev.map(e => (e.id === data.id ? data : e)))
    }
  }, [base])

  function startNewSheet() {
    currentIdRef.current = null
    setDrafting(true)
    setEditorKey(`new-${Date.now()}`)
  }

  // "Listo" sin haber escrito nada en la hoja nueva → vuelve a la actual.
  function handleDone() {
    if (currentIdRef.current == null && entries?.length) showEntry(entries[0])
  }

  async function confirmDelete() {
    setDeleting(true)
    setDeleteError('')
    try {
      await api.delete(`${base}/${toDelete.id}`)
      const rest = entries.filter(e => e.id !== toDelete.id).map((e, i) => ({ ...e, isCurrent: i === 0 }))
      setEntries(rest)
      if (toDelete.id === currentIdRef.current) showEntry(rest[0])
      setToDelete(null)
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'No se pudo borrar la hoja.')
    } finally {
      setDeleting(false)
    }
  }

  const current = drafting ? null : entries?.[0]
  const history = (entries ?? []).filter(e => e.id !== current?.id)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      {loadError ? (
        <p className="text-sm text-red-500">No se pudo cargar la situación de la cuenta.</p>
      ) : entries === null ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Cargando…</p>
      ) : (
        <>
          <AutosaveNotes
            editorKey={editorKey}
            content={current?.content || ''}
            onSave={handleSave}
            label="Situación de la Cuenta"
            emptyText="Sin información todavía."
            minHeight={120}
            autoEdit={editorKey.startsWith('new-')}
            onEditingChange={setEditing}
            onDone={handleDone}
            headerActions={!editing && entries.length > 0 && (
              <button onClick={startNewSheet}
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">
                + Nueva hoja
              </button>
            )}
          />

          <div className="flex items-center justify-between gap-2 mt-2 text-xs text-gray-400 dark:text-gray-500">
            {drafting ? (
              <span>Hoja nueva: se guarda cuando empezás a escribir. La anterior queda en el historial.</span>
            ) : current ? (
              <EntryMeta entry={current} />
            ) : <span />}
            {current?.canDelete && !editing && (
              <button onClick={() => setToDelete(current)} title="Borrar esta hoja"
                className="p-1 hover:text-red-500 flex-shrink-0">
                <Icon as={Trash2} size={14} />
              </button>
            )}
          </div>

          {history.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => setHistoryOpen(o => !o)}
                className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center gap-1">
                <Icon as={ChevronDown} size={14} className={`transition-transform ${historyOpen ? '' : '-rotate-90'}`} />
                Hojas anteriores ({history.length})
              </button>
              {historyOpen && (
                <ul className="divide-y divide-gray-100 dark:divide-gray-700 mt-1">
                  {history.map(e => <HistoryItem key={e.id} entry={e} onDelete={setToDelete} />)}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={!!toDelete}
        title="Borrar hoja"
        message={deleteError || (toDelete?.isCurrent
          ? 'Se borra la hoja actual y pasa a verse la anterior. No se puede deshacer.'
          : 'Se borra esta hoja del historial. No se puede deshacer.')}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => { setToDelete(null); setDeleteError('') }}
      />
    </div>
  )
}
