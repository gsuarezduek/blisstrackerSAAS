import { useState } from 'react'
import api from '../../api/client'
import AutosaveNotes from '../AutosaveNotes'
import CollapsibleSectionHeader from './CollapsibleSectionHeader'

function hasHtmlContent(html) {
  return !!html && html !== '<p></p>'
}

// Notas de reunión del lead: WYSIWYG persistente, separado del timeline de
// actividad (LeadDetail.jsx → Historial). Autoguardado — ver AutosaveNotes.
// Colapsada por defecto (ver CollapsibleSectionHeader); colapsar mientras se
// edita dispara el guardado best-effort que ya hace AutosaveNotes al
// desmontarse, no se pierde nada sin confirmar.
export default function LeadNotes({ leadId, initialContent }) {
  const [open, setOpen] = useState(false)

  async function handleSave(html) {
    await api.patch(`/ventas/leads/${leadId}`, { notes: html })
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <CollapsibleSectionHeader
        title="📝 Notas de reunión"
        hasContent={hasHtmlContent(initialContent)}
        open={open}
        onToggle={() => setOpen(o => !o)}
      />
      {open && (
        <div className="mt-3">
          <AutosaveNotes
            editorKey={leadId}
            content={initialContent || ''}
            onSave={handleSave}
            emptyText="Sin notas todavía. Usalo para dejar por escrito lo hablado en las reuniones."
            minHeight={140}
          />
        </div>
      )}
    </div>
  )
}
