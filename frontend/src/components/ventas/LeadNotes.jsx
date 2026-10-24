import { useState } from 'react'
import api from '../../api/client'
import AutosaveNotes from '../AutosaveNotes'
import CollapsibleSectionHeader from './CollapsibleSectionHeader'

function hasHtmlContent(html) {
  return !!html && html !== '<p></p>'
}

// Notas de reunión del lead: campo libre con autoguardado (AutosaveNotes, mismo
// patrón que ProjectSituation.jsx), separado del timeline de actividad
// (LeadDetail.jsx → Historial). Sin edición en vivo colaborativa — no hace falta
// para un campo que en la práctica edita una sola persona a la vez; esto además
// deja el contenido guardado visible de entrada (sección abierta por defecto) sin
// abrir ninguna conexión hasta que alguien aprieta "Editar".
export default function LeadNotes({ leadId, initialContent, canEdit = true }) {
  const [open, setOpen] = useState(true)
  const [content, setContent] = useState(initialContent || '')

  async function handleSave(html) {
    await api.patch(`/ventas/leads/${leadId}`, { notes: html })
    setContent(html)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <CollapsibleSectionHeader
        title="Notas de reunión"
        hasContent={hasHtmlContent(content)}
        open={open}
        onToggle={() => setOpen(o => !o)}
      />
      {open && (
        <div className="mt-3">
          <AutosaveNotes
            editorKey={`lead:${leadId}`}
            content={content}
            onSave={handleSave}
            emptyText="Sin notas todavía. Usalo para dejar por escrito lo hablado en las reuniones."
            minHeight={140}
            canEdit={canEdit}
          />
        </div>
      )}
    </div>
  )
}
