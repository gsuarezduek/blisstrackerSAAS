import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { useWorkspace } from '../context/WorkspaceContext'
import { computePeopleScore, peopleColumnKeys } from '../utils/peopleScore'
import { TabHoy } from './rrhh/hoy'
import { TabIngresos } from './rrhh/ingresos'
import { TabPersonas } from './rrhh/personas'
import { TabLicencias } from './rrhh/licencias'
import { TabVacaciones } from './rrhh/vacacionesBalance'
import { TabBeneficios } from './rrhh/beneficios'
import ProductivityTab from '../components/admin/ProductivityTab'
import LoadingSpinner from '../components/LoadingSpinner'
import { rrhhSections, resolveRrhhNav, DEFAULT_TAB } from './rrhh/rrhhNav'
import { todayStr } from './rrhh/shared'

// ─── Shell del panel RRHH ─────────────────────────────────────────────────────
// Secciones por tarea (ver rrhh/rrhhNav.js): Hoy (cola de aprobaciones + avisos +
// indicadores) · Personas · Ausencias (solicitudes / saldos de vacaciones /
// beneficios) · Asistencia · Productividad. Sección y vista viven en la URL
// (?tab=&view=); los ?tab= del panel anterior se reescriben vía LEGACY_TABS.

const EMPTY_PENDING = { leaves: [], benefits: [], approvedLeaves: [], loading: true, error: false }

export default function RRHH() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { workspace } = useWorkspace()
  const productivityEnabled = workspace?.productivityEnabled !== false
  const sections = rrhhSections({ productivityEnabled })
  const nav = resolveRrhhNav({ tab: searchParams.get('tab'), view: searchParams.get('view') }, { productivityEnabled })
  const { tab, view } = nav
  const personId = searchParams.get('userId')

  const [users, setUsers]       = useState([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [lastLoginsMap, setLastLoginsMap] = useState({})
  const [dashStats, setDashStats] = useState({ projectsPerPerson: 0 })
  const [peopleScore, setPeopleScore] = useState(null)
  const [pending, setPending] = useState(EMPTY_PENDING)
  const { enabled: eosEnabled } = useFeatureFlag('eos')

  // URL legacy o inválida → la canónica, sin sumar una entrada al historial.
  useEffect(() => {
    if (!nav.changed) return
    const next = new URLSearchParams(searchParams)
    if (tab === DEFAULT_TAB) next.delete('tab'); else next.set('tab', tab)
    if (view) next.set('view', view); else next.delete('view')
    setSearchParams(next, { replace: true })
  }, [nav.changed, tab, view]) // eslint-disable-line react-hooks/exhaustive-deps

  function goTo(nextTab, nextView = null, extra = {}) {
    const next = new URLSearchParams()
    if (nextTab !== DEFAULT_TAB) next.set('tab', nextTab)
    if (nextView) next.set('view', nextView)
    for (const [k, v] of Object.entries(extra)) if (v != null) next.set(k, String(v))
    setSearchParams(next)
  }

  // La ficha de una persona vive en ?tab=personas&userId= (deep-link desde notificaciones de legajo).
  function openPerson(id) {
    const next = new URLSearchParams()
    next.set('tab', 'personas')
    if (id) next.set('userId', String(id))
    setSearchParams(next)
    window.scrollTo({ top: 0 })
  }

  const loadUsers = useCallback(() => api.get('/users').then(r => setUsers(r.data)).catch(() => {}).finally(() => setUsersLoaded(true)), [])
  const loadDashStats = useCallback(() => api.get('/admin/rrhh/dashboard-stats').then(r => setDashStats(r.data)).catch(() => {}), [])

  // Solicitudes que esperan decisión (licencias + beneficios) y licencias aprobadas
  // vigentes (para avisar superposiciones al aprobar).
  const loadPending = useCallback(async () => {
    try {
      const [leavesRes, benefitsRes] = await Promise.all([
        api.get('/vacation/admin/requests'),
        api.get('/benefits/admin/requests', { params: { status: 'pending' } }),
      ])
      const today = todayStr()
      setPending({
        leaves: leavesRes.data.filter(r => r.status === 'pending'),
        approvedLeaves: leavesRes.data.filter(r => r.status === 'approved' && r.endDate >= today),
        benefits: benefitsRes.data,
        loading: false, error: false,
      })
    } catch {
      setPending(p => ({ ...p, loading: false, error: true }))
    }
  }, [])

  useEffect(() => {
    loadUsers()
    loadDashStats()
    api.get('/admin/rrhh/last-logins')
      .then(r => setLastLoginsMap(Object.fromEntries(r.data.map(({ userId, lastLogin }) => [userId, lastLogin]))))
      .catch(() => {})
  }, [loadUsers, loadDashStats])

  // La cola se recarga cada vez que se vuelve a "Hoy" (pudo resolverse algo desde Ausencias).
  useEffect(() => { if (tab === 'hoy') loadPending() }, [tab, loadPending])

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

  // Resolver una solicitud la saca de la cola al instante; después se refrescan
  // saldos (aprobar vacaciones descuenta días) y la lista de quién está fuera.
  function handleDecided(item, status) {
    setPending(p => ({
      ...p,
      leaves: item.kind === 'leave' ? p.leaves.filter(r => r.id !== item.id) : p.leaves,
      benefits: item.kind === 'benefit' ? p.benefits.filter(r => r.id !== item.id) : p.benefits,
    }))
    if (status === 'approved') { loadUsers(); loadDashStats(); loadPending() }
  }

  const pendingCount = pending.loading ? 0 : pending.leaves.length + pending.benefits.length
  const activeSection = sections.find(s => s.id === tab)
  const activeUsers = users.filter(u => u.active)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">RRHH</h1>

        {/* Secciones: subrayado, scroll horizontal en mobile */}
        <nav aria-label="Secciones de RRHH"
          className="-mx-4 px-4 sm:mx-0 sm:px-0 mb-5 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-none">
          <div className="flex gap-1 min-w-max">
            {sections.map(s => {
              const active = tab === s.id
              const badge = s.id === 'hoy' && pendingCount > 0 ? pendingCount : null
              return (
                <button key={s.id} type="button" onClick={() => goTo(s.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    active
                      ? 'border-primary-600 text-primary-700 dark:border-primary-400 dark:text-primary-300'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                  {s.label}
                  {badge && (
                    <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center"
                      aria-label={`${badge} para resolver`}>{badge}</span>
                  )}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Vistas de la sección (ej. Ausencias), como selector segmentado */}
        {activeSection?.views && (
          <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none mb-5">
            <div role="tablist" className="inline-flex min-w-max gap-0.5 p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              {activeSection.views.map(v => {
                const active = view === v.id
                return (
                  <button key={v.id} type="button" role="tab" aria-selected={active} onClick={() => goTo(tab, v.id)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                      active
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                    {v.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'hoy' && !usersLoaded && <LoadingSpinner className="py-16" />}
        {tab === 'hoy' && usersLoaded && (
          <TabHoy users={users} lastLoginsMap={lastLoginsMap} dashStats={dashStats} peopleScore={peopleScore}
            pending={pending} onDecided={handleDecided} onNavigate={goTo} />
        )}
        {tab === 'personas' && (
          <TabPersonas users={activeUsers} lastLoginsMap={lastLoginsMap} leaves={dashStats.leaves ?? []}
            selectedId={personId} onSelect={openPerson} initialFilter={searchParams.get('filter')} onUsersChanged={loadUsers} productivityEnabled={productivityEnabled} />
        )}
        {tab === 'ausencias' && view === 'solicitudes' && <TabLicencias />}
        {tab === 'ausencias' && view === 'vacaciones' && (
          <TabVacaciones users={activeUsers}
            onVacationUpdate={updated => setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, vacationDays: updated.vacationDays } : u))} />
        )}
        {tab === 'ausencias' && view === 'beneficios' && <TabBeneficios />}
        {tab === 'asistencia' && <TabIngresos users={activeUsers} />}
        {tab === 'productividad' && productivityEnabled && <ProductivityTab />}
      </main>
    </div>
  )
}
