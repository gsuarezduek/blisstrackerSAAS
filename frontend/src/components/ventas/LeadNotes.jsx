import { useState } from 'react'
import CollaborativeRichTextEditor from '../CollaborativeRichTextEditor'
import CollapsibleSectionHeader from './CollapsibleSectionHeader'

function hasHtmlContent(html) {
  return !!html && html !== '<p></p>'
}

// Notas de reunión del lead: WYSIWYG colaborativo en tiempo real (ver
// CollaborativeRichTextEditor), separado del timeline de actividad
// (LeadDetail.jsx → Historial). Colapsada por defecto (ver
// CollapsibleSectionHeader) — abrir la sección conecta al documento vivo,
// cerrarla la desconecta (no hay paso intermedio de "Editar": si hay permiso,
// es edición directa).
export default function LeadNotes({ leadId, initialContent, canEdit = true }) {
  const [open, setOpen] = useState(false)

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
          <CollaborativeRichTextEditor
            key={`lead:${leadId}:${canEdit}`}
            docKey={`lead:${leadId}`}
            editable={canEdit}
            fallbackContent={initialContent || ''}
            emptyText="Sin notas todavía. Usalo para dejar por escrito lo hablado en las reuniones."
            minHeight={140}
          />
        </div>
      )}
    </div>
  )
}
