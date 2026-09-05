import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import GlobalTab from './preferences/global'
import PersonalTab from './preferences/personal'

export default function Preferences() {
  const { user } = useAuth()
  const [prefTab, setPrefTab] = useState('global')
  const [weeklyEmail,  setWeeklyEmail]  = useState(true)
  const [dailyInsight, setDailyInsight] = useState(true)
  const [notesBoard,   setNotesBoard]   = useState(true)
  const [loaded,       setLoaded]       = useState(false)

  useEffect(() => {
    api.get('/profile').then(({ data }) => {
      setWeeklyEmail(data.weeklyEmailEnabled   ?? true)
      setDailyInsight(data.dailyInsightEnabled ?? true)
      setNotesBoard(data.notesBoardEnabled     ?? true)
      setLoaded(true)
    })
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Preferencias</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Configurá cómo querés usar BlissTracker.</p>
        </div>

        {/* Tabs — solo admins */}
        {user?.isAdmin && (
          <div className="mb-2">
            <select
              className="sm:hidden w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={prefTab}
              onChange={e => setPrefTab(e.target.value)}
            >
              <option value="global">Globales</option>
              <option value="personal">Personales</option>
            </select>
            <div className="hidden sm:flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1 w-fit">
              {[{ id: 'global', label: 'Globales' }, { id: 'personal', label: 'Personales' }].map(t => (
                <button
                  key={t.id}
                  onClick={() => setPrefTab(t.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    prefTab === t.id
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Globales (solo admins) ─────────────────────── */}
        {user?.isAdmin && prefTab === 'global' && <GlobalTab loaded={loaded} />}

        {/* ── Tab: Personales (no-admins siempre, admins si prefTab=personal) ── */}
        {(!user?.isAdmin || prefTab === 'personal') && (
          <PersonalTab
            loaded={loaded}
            weeklyEmail={weeklyEmail}
            dailyInsight={dailyInsight}
            notesBoard={notesBoard}
            setWeeklyEmail={setWeeklyEmail}
            setDailyInsight={setDailyInsight}
            setNotesBoard={setNotesBoard}
          />
        )}

      </main>
    </div>
  )
}
