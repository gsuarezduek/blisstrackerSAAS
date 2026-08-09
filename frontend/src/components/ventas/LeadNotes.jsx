import api from '../../api/client'
import AutosaveNotes from '../AutosaveNotes'

// Notas de reunión del lead: WYSIWYG persistente, separado del timeline de
// actividad (LeadDetail.jsx → Historial). Autoguardado — ver AutosaveNotes.
export default function LeadNotes({ leadId, initialContent }) {
  async function handleSave(html) {
    await api.patch(`/ventas/leads/${leadId}`, { notes: html })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <AutosaveNotes
        editorKey={leadId}
        content={initialContent || ''}
        onSave={handleSave}
        label="Notas de reunión"
        emptyText="Sin notas todavía. Usalo para dejar por escrito lo hablado en las reuniones."
        minHeight={140}
      />
    </div>
  )
}
