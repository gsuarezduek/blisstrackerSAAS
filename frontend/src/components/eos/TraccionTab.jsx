import { useState } from 'react'
import '../situation-editor.css'
import { RocasSection } from './TraccionRocas'
import { MeetingSection } from './TraccionMeetings'

// ─── Shell del tab Tracción (EOS). Secciones en ./TraccionRocas y ./TraccionMeetings ───
export default function TraccionTab() {
  const [subTab, setSubTab] = useState('rocks')

  const SUB_TABS = [
    { id: 'rocks',   label: '🪨 Rocas',       title: 'Rocas Trimestrales' },
    { id: 'meeting', label: '📋 Reunión L10',  title: 'Reunión Level 10' },
  ]

  const current = SUB_TABS.find(t => t.id === subTab)

  return (
    <div className="space-y-5">
      {/* Sub-tab selector */}
      <div className="flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1 w-fit">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              subTab === t.id
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {subTab === 'rocks'   && <RocasSection />}
      {subTab === 'meeting' && <MeetingSection />}
    </div>
  )
}
