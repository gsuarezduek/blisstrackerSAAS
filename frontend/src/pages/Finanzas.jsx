import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { Lock } from 'lucide-react'
import { Icon } from '../components/ui/Icon'
import api from '../api/client'
import FinanzasConfiguracion from '../components/finanzas/FinanzasConfiguracion'
import LoadMovementModal from '../components/finanzas/LoadMovementModal'

const TABS = [
  { id: 'ingresos',  label: 'Ingresos' },
  { id: 'egresos',   label: 'Egresos' },
  { id: 'saldos',    label: 'Saldos' },
  { id: 'resumen',   label: 'Resumen' },
  { id: 'clientes',  label: 'Clientes' },
  { id: 'pendientes', label: 'Pendientes' },
]
const VALID = new Set(TABS.map(t => t.id))

// Las 6 pestañas se construyen incrementalmente (Etapas 3 a 8 del plan del
// módulo) — hasta entonces muestran este placeholder en vez de contenido roto.
function ComingSoon({ label }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
      <p className="text-sm text-gray-500 dark:text-gray-400">La sección "{label}" todavía se está construyendo.</p>
    </div>
  )
}

export default function Finanzas() {
  const { user } = useAuth()
  const { enabled, loading: flagLoading } = useFeatureFlag('finanzas')
  const [searchParams, setSearchParams] = useSearchParams()
  const [showConfig, setShowConfig] = useState(false)
  const [showLoadModal, setShowLoadModal] = useState(false)

  // Datos compartidos por el modal "+ Cargar" (y, en etapas siguientes, por
  // las pestañas Ingresos/Egresos/Saldos) — se cargan una vez acá arriba,
  // mismo patrón que `loadShared` en pages/Ventas.jsx.
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [taxes, setTaxes] = useState([])

  const loadShared = useCallback(async () => {
    const [a, c, i, t] = await Promise.all([
      api.get('/finanzas/accounts'),
      api.get('/finanzas/categories'),
      api.get('/finanzas/items'),
      api.get('/finanzas/taxes'),
    ])
    setAccounts(a.data)
    setCategories(c.data)
    setItems(i.data)
    setTaxes(t.data)
  }, [])

  useEffect(() => { if (enabled) loadShared() }, [enabled, loadShared])

  const tab = VALID.has(searchParams.get('tab')) ? searchParams.get('tab') : 'ingresos'
  function setTab(id) { setSearchParams({ tab: id }, { replace: true }) }

  function handleMovementSaved() {
    setShowLoadModal(false)
    loadShared()
  }

  if (flagLoading) {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-900"><Navbar /><div className="py-20"><LoadingSpinner /></div></div>
  }

  if (!enabled) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
            <p className="mb-4"><Icon as={Lock} size={40} className="inline-block text-gray-300 dark:text-gray-600" /></p>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Sección no disponible</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">El módulo de Finanzas no está habilitado para este workspace.</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {showConfig ? (
          <FinanzasConfiguracion onBack={() => setShowConfig(false)} />
        ) : (
          <>
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Finanzas</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ingresos, egresos, saldos e inversiones</p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {user?.isAdmin && (
                  <button onClick={() => setShowConfig(true)} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl px-4 py-2 text-sm font-medium">Configuración</button>
                )}
                <button onClick={() => setShowLoadModal(true)} className="bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors">+ Cargar</button>
              </div>
            </div>

            <div className="mb-6">
              <div className="hidden sm:flex flex-wrap gap-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-xl p-1 w-fit">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-primary-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <select className="sm:hidden w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-medium" value={tab} onChange={e => setTab(e.target.value)}>
                {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            <ComingSoon label={TABS.find(t => t.id === tab)?.label} />
          </>
        )}

        {showLoadModal && (
          <LoadMovementModal
            accounts={accounts} categories={categories} items={items} taxes={taxes}
            defaultMode={tab === 'egresos' ? 'expense' : 'income'}
            onClose={() => setShowLoadModal(false)}
            onSaved={handleMovementSaved}
          />
        )}
      </main>
    </div>
  )
}
