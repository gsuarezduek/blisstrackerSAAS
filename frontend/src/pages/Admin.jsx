import Navbar from '../components/Navbar'
import ProjectsTab from '../components/admin/ProjectsTab'
import TeamTab from '../components/admin/TeamTab'
import ServicesTab from '../components/admin/ServicesTab'
import RolesTab from '../components/admin/RolesTab'
import FeedbackTab from '../components/admin/FeedbackTab'
import { useState } from 'react'

const TABS = [
  { id: 'projects', label: '📁 Proyectos' },
  { id: 'team', label: '👥 Equipo' },
  { id: 'services', label: '🛠 Servicios' },
  { id: 'roles', label: '🏷 Roles' },
  { id: 'feedback', label: '💬 Feedback' },
]

export default function Admin() {
  const [tab, setTab] = useState('projects')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Panel de Administración</h1>

        {/* Tabs */}
        <div className="flex gap-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-1 mb-6 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'projects' && <ProjectsTab />}
        {tab === 'team' && <TeamTab />}
        {tab === 'services' && <ServicesTab />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'feedback' && <FeedbackTab />}
      </main>
    </div>
  )
}
