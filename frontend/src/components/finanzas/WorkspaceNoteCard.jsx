import { useEffect, useState } from 'react'
import api from '../../api/client'
import { Card, CardHeader } from '../../pages/project-detail/ui.jsx'

// "Notas" (sección 4.6): textarea libre con autoguardado, simple (sin rich
// text — el PDF la muestra como un textarea plano).
export default function WorkspaceNoteCard() {
  const [content, setContent] = useState('')
  const [status, setStatus] = useState('idle') // idle | dirty | saving | saved

  useEffect(() => { api.get('/finanzas/workspace-note').then(res => setContent(res.data.content)) }, [])

  useEffect(() => {
    if (status !== 'dirty') return
    const timer = setTimeout(async () => {
      setStatus('saving')
      await api.patch('/finanzas/workspace-note', { content })
      setStatus('saved')
    }, 1500)
    return () => clearTimeout(timer)
  }, [content, status])

  return (
    <Card>
      <CardHeader title="Notas" action={
        <span className="text-[11px] text-gray-400">{status === 'saving' ? 'Guardando…' : status === 'saved' ? 'Guardado' : ''}</span>
      } />
      <div className="px-4 pb-4">
        <textarea
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm resize-y min-h-[90px]"
          placeholder="Notas libres del workspace…"
          value={content}
          onChange={e => { setContent(e.target.value); setStatus('dirty') }}
        />
      </div>
    </Card>
  )
}
