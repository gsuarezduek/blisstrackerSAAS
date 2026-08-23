import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import api from '../api/client'
import DashboardTab from '../components/ventas/DashboardTab'
import PipelineTab from '../components/ventas/PipelineTab'
import MetricsTab from '../components/ventas/MetricsTab'
import CompaniesTab from '../components/ventas/CompaniesTab'
import WhatsappTab from '../components/ventas/WhatsappTab'
import LeadDetail from '../components/ventas/LeadDetail'
import LeadModal from '../components/ventas/LeadModal'
import SalesTeamModal from '../components/ventas/SalesTeamModal'

const BASE_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'pipeline',  label: 'Pipeline' },
  { id: 'metricas',  label: 'Métricas' },
  { id: 'empresas',  label: 'Empresas' },
]
const WHATSAPP_TAB = { id: 'whatsapp', label: 'WhatsApp' }

export default function Ventas() {
  const { user } = useAuth()
  const { enabled, loading: flagLoading } = useFeatureFlag('ventas')
  // Flag propio (independiente de 'ventas') — solo agrega el tab si SuperAdmin
  // habilitó WhatsApp para este workspace, ver backend/src/config/featureFlags.js.
  const { enabled: whatsappEnabled } = useFeatureFlag('whatsapp')
  const [searchParams, setSearchParams] = useSearchParams()

  const TABS = whatsappEnabled ? [...BASE_TABS, WHATSAPP_TAB] : BASE_TABS
  const VALID = new Set(TABS.map(t => t.id))
  const tab = VALID.has(searchParams.get('tab')) ? searchParams.get('tab') : 'dashboard'
  const leadId = searchParams.get('lead') ? Number(searchParams.get('lead')) : null

  // Datos compartidos entre tabs/modales: equipo comercial + empresas.
  const [team, setTeam] = useState([])
  const [companies, setCompanies] = useState([])
  const [showConfig, setShowConfig] = useState(false)
  // "+ Nuevo lead" vive acá (no en DashboardTab) para poder crear un lead desde
  // cualquier tab, igual que "Configuración". `leadsTick` fuerza un remount del
  // tab activo tras crear uno (Dashboard/Pipeline listan leads y recargan al montar).
  const [showNewLead, setShowNewLead] = useState(false)
  const [leadsTick, setLeadsTick] = useState(0)

  const loadShared = useCallback(async () => {
    const [t, c] = await Promise.all([api.get('/ventas/team'), api.get('/ventas/companies')])
    setTeam(t.data)
    setCompanies(c.data)
  }, [])

  useEffect(() => { if (enabled) loadShared() }, [enabled, loadShared])

  function handleLeadCreated() {
    setShowNewLead(false)
    loadShared()
    setLeadsTick(t => t + 1)
  }

  function setTab(id)      { setSearchParams({ tab: id }, { replace: true }) }
  // Conserva el tab actual al abrir un lead (y al volver) — así "Volver"
  // regresa a donde se estaba (Pipeline, WhatsApp, etc.), no siempre a Dashboard.
  function openLead(id)    { setSearchParams({ tab, lead: String(id) }, { replace: false }) }
  function backToPipeline() { setSearchParams({ tab }, { replace: false }) }

  if (flagLoading) {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-900"><Navbar /><div className="py-20"><LoadingSpinner /></div></div>
  }

  if (!enabled) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
            <p className="text-5xl mb-4">🔒</p>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Sección no disponible</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">El módulo de Ventas no está habilitado para este workspace.</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ventas</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">CRM comercial · pipeline de leads, empresas y oportunidades</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {user?.isAdmin && (
              <button onClick={() => setShowConfig(true)} className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl px-4 py-2 text-sm font-medium">⚙️ Configuración</button>
            )}
            <button onClick={() => setShowNewLead(true)} className="bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors">+ Nuevo lead</button>
          </div>
        </div>

        {/* Tabs — se mantienen visibles incluso dentro de un Lead (no solo en
            las vistas de lista), para poder saltar a otra sección sin tener
            que volver primero. El tab activo sigue marcando de dónde se vino. */}
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

        {leadId ? (
          <LeadDetail leadId={leadId} team={team} companies={companies} onBack={backToPipeline} onChanged={loadShared} />
        ) : (
          <>
            {tab === 'dashboard' && <DashboardTab key={leadsTick} team={team} onOpenLead={openLead} onDataChange={loadShared} />}
            {tab === 'pipeline'  && <PipelineTab key={leadsTick} onOpenLead={openLead} />}
            {tab === 'metricas'  && <MetricsTab />}
            {tab === 'empresas'  && <CompaniesTab onDataChange={loadShared} />}
            {tab === 'whatsapp'  && whatsappEnabled && <WhatsappTab onOpenLead={openLead} />}
          </>
        )}

        {showConfig && <SalesTeamModal onClose={() => setShowConfig(false)} onSaved={loadShared} />}
        {showNewLead && <LeadModal companies={companies} team={team} onClose={() => setShowNewLead(false)} onSaved={handleLeadCreated} />}
      </main>
    </div>
  )
}
