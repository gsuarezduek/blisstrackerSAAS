import Navbar from '../components/Navbar'
import ProjectsTab from '../components/admin/ProjectsTab'
import TeamTab from '../components/admin/TeamTab'
import ServicesTab from '../components/admin/ServicesTab'
import RolesTab from '../components/admin/RolesTab'
import FeedbackTab from '../components/admin/FeedbackTab'
import RoleExpectationsTab from '../components/admin/RoleExpectationsTab'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const TABS = [
  { id: 'projects',  label: '📁 Proyectos' },
  { id: 'team',      label: '👥 Equipo' },
  { id: 'services',  label: '🛠 Servicios' },
  { id: 'roles',     label: '🏷 Roles' },
  { id: 'role-ai',   label: '🎯 Roles IA' },
  { id: 'feedback',  label: '💬 Feedback' },
]

const VALID_TABS = new Set(TABS.map(t => t.id))

export default function Admin() {
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab')
  const [tab, setTab] = useState(VALID_TABS.has(initialTab) ? initialTab : 'projects')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Panel de Administración</h1>

        {/* Tabs — select en mobile, botones en desktop */}
        <div className="mb-6">
          {/* Mobile */}
          <select
            className="sm:hidden w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={tab}
            onChange={e => setTab(e.target.value)}
          >
            {TABS.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          {/* Desktop */}
          <div className="hidden sm:flex gap-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-1 w-fit">
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
        </div>

        {tab === 'projects' && <ProjectsTab />}
        {tab === 'team' && <TeamTab />}
        {tab === 'services' && <ServicesTab />}
        {tab === 'roles' && <RolesTab />}
        {tab === 'role-ai' && <RoleExpectationsTab />}
        {tab === 'feedback' && <FeedbackTab />}
      </main>
    </div>
  )
}
