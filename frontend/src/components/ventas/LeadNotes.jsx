import { useState, useEffect } from 'react'
import DOMPurify from 'dompurify'
import api from '../../api/client'
import RichTextEditor from '../RichTextEditor'
import '../situation-editor.css'

// Notas de reunión del lead: WYSIWYG persistente, separado del timeline de
// actividad (LeadDetail.jsx → Historial). Mismo patrón que ProjectSituation.
export default function LeadNotes({ leadId, initialContent, onSaved }) {
  const [content, setContent] = useState(initialContent || '')
  const [draft,   setDraft]   = useState('')
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    setContent(initialContent || '')
    setEditing(false)
    setError('')
  }, [leadId, initialContent])

  function handleEdit() {
    setDraft(content)
    setEditing(true)
    setError('')
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await api.patch(`/ventas/leads/${leadId}`, { notes: draft })
      setContent(draft)
      setEditing(false)
      onSaved?.()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setEditing(false)
    setError('')
  }

  const isEmpty = !content || content === '<p></p>'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
          Notas de reunión
        </p>
        {!editing && (
          <button
            onClick={handleEdit}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium"
          >
            {isEmpty ? '+ Agregar' : 'Editar'}
          </button>
        )}
      </div>

      {editing && (
        <div className="mb-3">
          <RichTextEditor
            defaultContent={draft}
            onChange={setDraft}
            minHeight={140}
          />
        </div>
      )}

      {!editing && !isEmpty && (
        <div
          className="situation-content text-sm text-gray-700 dark:text-gray-300"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
        />
      )}

      {!editing && isEmpty && (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">Sin notas todavía. Usalo para dejar por escrito lo hablado en las reuniones.</p>
      )}

      {editing && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          <button
            onClick={handleCancel}
            className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            Cancelar
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  )
}
