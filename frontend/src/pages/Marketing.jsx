import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import HowToButton from '../components/HowToButton'
import PrioridadesTab from '../components/marketing/PrioridadesTab'
import { NAV, LEGACY_MAP, LEGACY_SUB_MAP, VALID_TABS } from '../components/marketing/marketingNav'
import GeoTab      from '../components/marketing/GeoTab'
import WebTab      from '../components/marketing/WebTab'
import SeoTab      from '../components/marketing/SeoTab'
import KeywordsTab from '../components/marketing/KeywordsTab'
import ContentBriefTab   from '../components/marketing/ContentBriefTab'
import OnPageTab         from '../components/marketing/OnPageTab'
import ContentGapTab     from '../components/marketing/ContentGapTab'
import CanibalizacionTab from '../components/marketing/CanibalizacionTab'
import InformesTab  from '../components/marketing/InformesTab'
import InstagramTab from '../components/marketing/InstagramTab'
import TikTokTab    from '../components/marketing/TikTokTab'
import YouTubeTab   from '../components/marketing/YouTubeTab'
import LinkedinTab  from '../components/marketing/LinkedinTab'
import FacebookTab  from '../components/marketing/FacebookTab'
import CompetitorsTab from '../components/marketing/CompetitorsTab'
import MetaAdsTab    from '../components/marketing/MetaAdsTab'
import GoogleAdsTab  from '../components/marketing/GoogleAdsTab'
import ProjectSearchSelect from '../components/marketing/ProjectSearchSelect'
import SocialIcon from '../components/marketing/SocialIcon'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import api from '../api/client'
import { Construction, Lock, X } from 'lucide-react'
import { Icon } from '../components/ui/Icon'

function ComingSoon({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4 text-gray-400">
        <Icon as={Construction} size={28} />
      </div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">{label} — Próximamente</h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
        Esta sección está en desarrollo.
      </p>
    </div>
  )
}

export default function Marketing() {
  const { enabled, loading: flagLoading } = useFeatureFlag('marketing')
  const { user } = useAuth()
  const moduleAllowed = enabled && !!user?.moduleAccess?.marketing
  const { workspace } = useWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const [projects,   setProjects]   = useState([])
  const [projectId,  setProjectId]  = useState(searchParams.get('projectId') ?? '')

  useEffect(() => {
    api.get('/projects').then(r => setProjects(r.data)).catch(() => {})
  }, [])

  const disabledSections = workspace?.marketingDisabledSections || []
  const visibleNav = NAV.filter(n => !disabledSections.includes(n.id))

  function resolveNav() {
    const rawTab  = searchParams.get('tab')
    const rawSub  = searchParams.get('sub')
    const rawView = searchParams.get('view')

    // Compat con URLs viejas: tab suelto (?tab=geo) y sub-pestañas que se fusionaron.
    if (rawTab && !VALID_TABS.has(rawTab) && LEGACY_MAP[rawTab]) {
      const m = LEGACY_MAP[rawTab]
      const legacySub = LEGACY_SUB_MAP[m.tab]?.[m.sub]
      return normalize(legacySub?.tab ?? m.tab, legacySub ? legacySub.sub : m.sub, legacySub?.view)
    }
    const legacySub = LEGACY_SUB_MAP[rawTab]?.[rawSub]
    if (legacySub) return normalize(legacySub.tab ?? rawTab, legacySub.sub, legacySub.view)
    return normalize(rawTab, rawSub, rawView)
  }

  function normalize(rawTab, rawSub, rawView) {
    let tab = VALID_TABS.has(rawTab) ? rawTab : 'hoy'
    if (disabledSections.includes(tab)) tab = visibleNav[0]?.id ?? tab
    const navItem = NAV.find(n => n.id === tab)
    const subItem = navItem?.subs.find(s => s.id === rawSub) ?? navItem?.subs[0]
    const view = subItem?.views
      ? (subItem.views.some(v => v.id === rawView) ? rawView : subItem.views[0].id)
      : ''
    return { tab, sub: subItem?.id ?? '', view }
  }

  const { tab, sub, view } = resolveNav()

  // Si la URL vino con nombres viejos, la reescribimos a la forma nueva (así los
  // links compartidos/marcadores quedan apuntando bien desde ahora).
  useEffect(() => {
    if (!moduleAllowed) return
    const cur = { tab: searchParams.get('tab') ?? '', sub: searchParams.get('sub') ?? '', view: searchParams.get('view') ?? '' }
    if (!cur.tab) return
    if (cur.tab === tab && (cur.sub || '') === sub && (cur.view || '') === view) return
    if (cur.tab === tab && !cur.sub && !cur.view) return
    navigateTo({ tab, sub, view })
  }, [tab, sub, view, moduleAllowed]) // eslint-disable-line react-hooks/exhaustive-deps

  function navigateTo({ tab: t, sub: s, view: v }) {
    const params = { tab: t }
    if (s) params.sub = s
    if (v) params.view = v
    if (projectId) params.projectId = projectId
    setSearchParams(params, { replace: true })
  }

  function setTab(id) {
    const navItem = NAV.find(n => n.id === id)
    const first = navItem?.subs[0]
    navigateTo({ tab: id, sub: first?.id, view: first?.views?.[0]?.id })
  }

  function setSub(id) {
    const subItem = activeNav.subs.find(s => s.id === id)
    navigateTo({ tab, sub: id, view: subItem?.views?.[0]?.id })
  }

  function setView(id) {
    navigateTo({ tab, sub, view: id })
  }

  function handleProjectChange(id) {
    setProjectId(id)
    setSearchParams(prev => {
      const p = Object.fromEntries(prev.entries())
      if (id) p.projectId = id
      else delete p.projectId
      return p
    }, { replace: true })
  }

  // Navega a una sub-pestaña puntual (usado por "Prioridades" para llevar cada
  // hallazgo/conexión a su pestaña de origen), conservando el proyecto. Pasa por
  // normalize() para completar sub/view por defecto y aceptar ids viejos.
  function handleNavigateTo({ tab: destTab, sub: destSub, view: destView }) {
    const legacy = LEGACY_SUB_MAP[destTab]?.[destSub]
    navigateTo(legacy
      ? normalize(legacy.tab ?? destTab, legacy.sub, legacy.view)
      : normalize(destTab, destSub, destView))
  }

  const activeNav = NAV.find(n => n.id === tab) ?? NAV[0]
  const activeSub = activeNav.subs.find(s => s.id === sub) ?? activeNav.subs[0]

  function renderContent() {
    if (tab === 'hoy')      return <PrioridadesTab projectId={projectId} projects={projects} onSelectProject={handleProjectChange} onNavigate={handleNavigateTo} />
    if (tab === 'informes') return <InformesTab projectId={projectId} onSelectProject={handleProjectChange} projects={projects} />

    if (tab === 'geo-seo' && sub === 'diagnostico') {
      if (view === 'seo')            return <SeoTab            projectId={projectId} projects={projects} onSelectProject={handleProjectChange} />
      if (view === 'onpage')         return <OnPageTab         projectId={projectId} projects={projects} />
      if (view === 'canibalizacion') return <CanibalizacionTab projectId={projectId} />
      return <GeoTab projectId={projectId} projects={projects} onSelectProject={handleProjectChange} />
    }
    if (tab === 'geo-seo' && sub === 'keywords')  return <KeywordsTab projectId={projectId} projects={projects} />
    if (tab === 'geo-seo' && sub === 'contenido') {
      if (view === 'gap') return <ContentGapTab projectId={projectId} projects={projects} />
      return <ContentBriefTab projectId={projectId} projects={projects} />
    }
    if (tab === 'web')                           return <WebTab subtab={sub} projectId={projectId} projects={projects} onSelectProject={handleProjectChange} />
    if (tab === 'rrss'     && sub === 'instagram') return <InstagramTab projectId={projectId} onSelectProject={handleProjectChange} projects={projects} />
    if (tab === 'rrss'     && sub === 'tiktok')    return <TikTokTab    projectId={projectId} onSelectProject={handleProjectChange} projects={projects} />
    if (tab === 'rrss'     && sub === 'youtube')   return <YouTubeTab   projectId={projectId} onSelectProject={handleProjectChange} projects={projects} />
    if (tab === 'rrss'     && sub === 'linkedin')  return <LinkedinTab  projectId={projectId} onSelectProject={handleProjectChange} projects={projects} />
    if (tab === 'rrss'     && sub === 'facebook')  return <FacebookTab  projectId={projectId} onSelectProject={handleProjectChange} projects={projects} />
    if (tab === 'rrss'     && sub === 'competidores') return <CompetitorsTab projectId={projectId} onSelectProject={handleProjectChange} />
    if (tab === 'anuncios' && sub === 'meta-ads')    return <MetaAdsTab    projectId={projectId} onSelectProject={handleProjectChange} projects={projects} />
    if (tab === 'anuncios' && sub === 'google-ads')  return <GoogleAdsTab  projectId={projectId} onSelectProject={handleProjectChange} projects={projects} />

    return <ComingSoon label={activeSub?.label ?? activeNav.label} />
  }

  if (flagLoading) return <LoadingSpinner size="lg" fullPage />

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Marketing</h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Herramientas de optimización y análisis para tus proyectos
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-64">
                <ProjectSearchSelect
                  projects={projects}
                  value={projectId}
                  onChange={handleProjectChange}
                  placeholder="Todos los proyectos…"
                />
              </div>
              {projectId && (
                <button
                  onClick={() => handleProjectChange('')}
                  title="Ver todos los proyectos"
                  className="flex-shrink-0 p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Ver todos los proyectos"
                >
                  <Icon as={X} size={16} />
                </button>
              )}
            </div>
            {projectId && (
              <Link
                to={`/my-projects/${projectId}`}
                className="self-start text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center gap-1"
              >
                Ir al proyecto →
              </Link>
            )}
          </div>
        </div>

        {!moduleAllowed ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
            <div className="mb-4"><Icon as={Lock} size={32} className="inline-block text-gray-300 dark:text-gray-600" /></div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Sección no disponible</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
              {enabled
                ? 'No tenés acceso a esta sección. Consultá con un administrador.'
                : 'Esta sección está siendo activada gradualmente. Si querés acceso anticipado, contactá al equipo de BlissTracker.'}
            </p>
          </div>
        ) : (
          <>
            {/* ── Secciones: subrayado, con scroll horizontal en mobile ── */}
            <nav aria-label="Secciones de Marketing"
              className="-mx-4 px-4 sm:mx-0 sm:px-0 mb-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-none">
              <div className="flex gap-1 min-w-max">
                {visibleNav.map(n => {
                  const active = tab === n.id
                  return (
                    <button key={n.id} type="button" onClick={() => setTab(n.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`shrink-0 whitespace-nowrap px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                        active
                          ? 'border-primary-600 text-primary-700 dark:border-primary-400 dark:text-primary-300'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                      {n.label}
                    </button>
                  )
                })}
              </div>
            </nav>

            {/* ── Sub-pestañas: chips ── */}
            {activeNav.subs.length > 0 ? (
              <div className="flex items-center justify-between gap-2 mt-3 mb-4">
                <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none flex-1 min-w-0">
                  <div className="flex gap-1.5 min-w-max">
                    {activeNav.subs.map(s => {
                      const active = sub === s.id
                      return (
                        <button key={s.id} type="button" onClick={() => setSub(s.id)}
                          aria-current={active ? 'true' : undefined}
                          className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            active
                              ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white text-white dark:text-gray-900'
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'}`}>
                          {s.network && <SocialIcon network={s.network} className="w-4 h-4" />}
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {tab === 'geo-seo' && <HowToButton topic="marketing.geoSeo" className="flex-shrink-0" />}
              </div>
            ) : <div className="mb-5" />}

            {/* ── Vistas dentro de una sub-pestaña (ej. Diagnóstico: GEO/SEO/On-Page/Canibalización) ── */}
            {activeSub?.views && (
              <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none mb-5">
                <div role="tablist" className="inline-flex min-w-max gap-0.5 p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  {activeSub.views.map(v => {
                    const active = view === v.id
                    return (
                      <button key={v.id} type="button" role="tab" aria-selected={active} onClick={() => setView(v.id)}
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

            {/* Contenido */}
            {renderContent()}
          </>
        )}
      </main>
    </div>
  )
}
