import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { computePeopleScore, peopleColumnKeys } from '../utils/peopleScore'
import { MiniDashboard } from './rrhh/dashboard'
import { TabIngresos } from './rrhh/ingresos'
import { TabLegajos } from './rrhh/legajos'
import { TabVacaciones } from './rrhh/vacaciones'

// ─── Shell del panel RRHH. Los tabs/modales viven en ./rrhh/*.jsx ───
const TABS = [
  { id: 'legajos',    label: '📋 Legajos'              },
  { id: 'vacaciones', label: '🏖️ Vacaciones y Licencias' },
  { id: 'ingresos',   label: '🕐 Ingresos'              },
]

export default function RRHH() {
  const [tab, setTab]           = useState('legajos')
  const [users, setUsers]       = useState([])
  const [lastLoginsMap, setLastLoginsMap] = useState({})
  const [dashStats, setDashStats] = useState({ projectsPerPerson: 0 })
  const [peopleScore, setPeopleScore] = useState(null)
  const { enabled: eosEnabled } = useFeatureFlag('eos')

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
    api.get('/admin/rrhh/last-logins')
      .then(r => {
        const map = {}
        for (const { userId, lastLogin } of r.data) map[userId] = lastLogin
        setLastLoginsMap(map)
      })
      .catch(() => {})
    api.get('/admin/rrhh/dashboard-stats')
      .then(r => setDashStats(r.data))
      .catch(() => {})
  }, [])

  // People Score (EOS) — solo si el módulo está habilitado y hay valores definidos.
  useEffect(() => {
    if (!eosEnabled) { setPeopleScore(null); return }
    api.get('/eos/personas')
      .then(r => {
        const { members, coreValues, ratingsMap, strikesMap } = r.data
        if (!coreValues?.length) { setPeopleScore(null); return }
        const strikesTotal = Object.values(strikesMap || {}).reduce((a, arr) => a + (arr?.length || 0), 0)
        setPeopleScore({ ...computePeopleScore(members, peopleColumnKeys(coreValues), ratingsMap), strikesTotal })
      })
      .catch(() => {})
  }, [eosEnabled])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">RRHH</h1>

        {/* Mini dashboard — siempre visible */}
        {users.length > 0 && <MiniDashboard users={users} lastLoginsMap={lastLoginsMap} dashStats={dashStats} peopleScore={peopleScore} />}

        {/* Tabs */}
        <div className="mb-4">
          <select className="sm:hidden w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
            value={tab} onChange={e => setTab(e.target.value)}>
            {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <div className="hidden sm:flex gap-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-1 w-fit">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'legajos'    && <TabLegajos    users={users.filter(u => u.active)} onVacationUpdate={updated => setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, vacationDays: updated.vacationDays } : u))} />}
        {tab === 'vacaciones' && <TabVacaciones />}
        {tab === 'ingresos'   && <TabIngresos   users={users.filter(u => u.active)} />}
      </main>
    </div>
  )
}
