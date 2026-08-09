import api from '../api/client'
import AutosaveNotes from './AutosaveNotes'

export default function ProjectSituation({ encodedProjectId, initialContent }) {
  async function handleSave(html) {
    await api.patch(`/projects/${encodedProjectId}/situation`, { situation: html })
  }

  return (
    <div className="mb-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <AutosaveNotes
        editorKey={encodedProjectId}
        content={initialContent || ''}
        onSave={handleSave}
        label="Situación de la Cuenta"
        emptyText="Sin información todavía."
        minHeight={120}
      />
    </div>
  )
}
