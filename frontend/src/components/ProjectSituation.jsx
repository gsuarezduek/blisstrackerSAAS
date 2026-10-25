import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import api from '../api/client'
import AutosaveNotes from './AutosaveNotes'
import ConfirmModal from './ConfirmModal'
import { Icon } from './ui/Icon'
import { fmtCreatedAt, createdAtTitle } from '../utils/format'
import { agentName } from '../hooks/useMyAgents'

// Situación de la Cuenta: hojas que se acumulan. Se ve y se edita (con autoguardado) la
// hoja actual — la más nueva —; "+ Nueva hoja" arranca una vacía y la anterior pasa a
// verse de solo lectura con las flechas de navegación, en el mismo lugar donde se ve/edita
// la actual (no un historial aparte más abajo). La hoja nueva recién se crea en el backend
// con lo primero que se escribe: si se aprieta "Listo" sin escribir nada, vuelve a mostrarse
// la actual (una hoja vacía no tapa la situación vigente).

function isBlank(html) {
  return !html || !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

function whenLabel(iso) {
  const txt = fmtCreatedAt(iso)
  return txt === 'hoy' || txt === 'ayer' ? txt : `el ${txt}`
}

function byLabel(user, agent, declaredAgentName) {
  if (!user && !agent) return ''
  return ` por ${user?.name ?? 'alguien'}${agent ? ` (vía «${agentName(agent, declaredAgentName)}»)` : ''}`
}

function EntryMeta({ entry }) {
  const edited = new Date(entry.updatedAt) - new Date(entry.createdAt) > 60_000
  const viaAgent = entry.createdByAgent || (edited && entry.updatedByAgent)
  return (
    <span title={createdAtTitle(entry.createdAt)}>
      {viaAgent && <Icon as={Bot} size={12} className="inline mr-1 -mt-0.5" />}
      Creada {whenLabel(entry.createdAt)}{byLabel(entry.createdBy, entry.createdByAgent, entry.createdByAgentName)}
      {edited && <> · editada {whenLabel(entry.updatedAt)}{byLabel(entry.updatedBy, entry.updatedByAgent, entry.updatedByAgentName)}</>}
    </span>
  )
}

export default function ProjectSituation({ encodedProjectId }) {
  const base = `/projects/${encodedProjectId}/situation`
  const [entries, setEntries] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [editorKey, setEditorKey] = useState('loading')
  const [drafting, setDrafting] = useState(false) // hoja nueva todavía sin guardar
  const [editing, setEditing] = useState(false)
  const [viewIndex, setViewIndex] = useState(0) // 0 = hoja actual (editable); >0 = anteriores, solo lectura
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  // Hoja que edita el autoguardado (siempre la más nueva; null = la próxima escritura
  // crea una hoja nueva). Ref y no estado: onSave tiene que ser estable para AutosaveNotes.
  const currentIdRef = useRef(null)

  const showLatest = useCallback(entry => {
    currentIdRef.current = entry?.id ?? null
    setDrafting(false)
    setViewIndex(0)
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
        showLatest(data.entries[0])
      })
      .catch(() => { if (!cancelled) setLoadError(true) })
    return () => { cancelled = true }
  }, [base, showLatest])

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
    setViewIndex(0)
    setEditorKey(`new-${Date.now()}`)
  }

  // "Listo" sin haber escrito nada en la hoja nueva → vuelve a la actual.
  function handleDone() {
    if (currentIdRef.current == null && entries?.length) showLatest(entries[0])
  }

  function viewEntry(index) {
    setViewIndex(index)
    setEditorKey(`entry-${entries[index].id}`)
  }

  // Borrar cualquier hoja (la actual o una anterior) vuelve a mostrar la que queda más nueva.
  async function confirmDelete() {
    setDeleting(true)
    setDeleteError('')
    try {
      await api.delete(`${base}/${toDelete.id}`)
      const rest = entries.filter(e => e.id !== toDelete.id).map((e, i) => ({ ...e, isCurrent: i === 0 }))
      setEntries(rest)
      showLatest(rest[0])
      setToDelete(null)
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'No se pudo borrar la hoja.')
    } finally {
      setDeleting(false)
    }
  }

  const isLatest = viewIndex === 0
  const viewed = drafting ? null : entries?.[viewIndex]

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
            content={viewed?.content || ''}
            onSave={handleSave}
            canEdit={isLatest}
            label="Situación de la Cuenta"
            emptyText="Sin información todavía."
            minHeight={120}
            autoEdit={editorKey.startsWith('new-')}
            onEditingChange={setEditing}
            onDone={handleDone}
            headerActions={!editing && entries.length > 0 && (
              <div className="flex items-center gap-3">
                {!drafting && entries.length > 1 && (
                  <div className="flex items-center gap-1 text-gray-400 dark:text-gray-500">
                    <button onClick={() => viewEntry(viewIndex + 1)} disabled={viewIndex >= entries.length - 1}
                      title="Ver hoja anterior"
                      className="p-0.5 rounded hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:hover:text-gray-400 dark:disabled:hover:text-gray-500">
                      <Icon as={ChevronLeft} size={14} />
                    </button>
                    <span className="text-xs tabular-nums w-10 text-center">{viewIndex + 1}/{entries.length}</span>
                    <button onClick={() => viewEntry(viewIndex - 1)} disabled={isLatest}
                      title="Ver hoja siguiente"
                      className="p-0.5 rounded hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 disabled:hover:text-gray-400 dark:disabled:hover:text-gray-500">
                      <Icon as={ChevronRight} size={14} />
                    </button>
                  </div>
                )}
                {!drafting && isLatest && (
                  <button onClick={startNewSheet}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">
                    + Nueva hoja
                  </button>
                )}
              </div>
            )}
          />

          <div className="flex items-center justify-between gap-2 mt-2 text-xs text-gray-400 dark:text-gray-500">
            {drafting ? (
              <span>Hoja nueva: se guarda cuando empezás a escribir.</span>
            ) : viewed ? (
              <EntryMeta entry={viewed} />
            ) : <span />}
            {viewed?.canDelete && !editing && (
              <button onClick={() => setToDelete(viewed)} title="Borrar esta hoja"
                className="p-1 hover:text-red-500 flex-shrink-0">
                <Icon as={Trash2} size={14} />
              </button>
            )}
          </div>
        </>
      )}

      <ConfirmModal
        open={!!toDelete}
        title="Borrar hoja"
        message={deleteError || (isLatest
          ? 'Se borra la hoja actual y pasa a verse la anterior. No se puede deshacer.'
          : 'Se borra esta hoja. No se puede deshacer.')}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => { setToDelete(null); setDeleteError('') }}
      />
    </div>
  )
}
