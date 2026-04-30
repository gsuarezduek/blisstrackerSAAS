import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import GeoTab      from '../components/marketing/GeoTab'
import WebTab      from '../components/marketing/WebTab'
import SeoTab      from '../components/marketing/SeoTab'
import KeywordsTab from '../components/marketing/KeywordsTab'
import SaludTab    from '../components/marketing/SaludTab'
import InstagramTab from '../components/marketing/InstagramTab'
import MetaAdsTab    from '../components/marketing/MetaAdsTab'
import GoogleAdsTab  from '../components/marketing/GoogleAdsTab'
import ProjectSearchSelect from '../components/marketing/ProjectSearchSelect'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import api from '../api/client'

const NAV = [
  {
    id: 'geo-seo',
    label: '🤖 GEO / SEO',
    subs: [
      { id: 'geo',      label: '🤖 GEO' },
      { id: 'seo',      label: '🔍 SEO' },
      { id: 'keywords', label: '🔑 Keywords' },
    ],
  },
  {
    id: 'web',
    label: '🌐 Web',
    subs: [
      { id: 'analytics',   label: '📊 Analytics' },
      { id: 'performance', label: '⚡ Performance' },
    ],
  },
  {
    id: 'rrss',
    label: '📱 RRSS',
    subs: [
      { id: 'instagram', label: '📸 Instagram' },
      { id: 'tiktok',    label: '🎵 TikTok',   soon: true },
      { id: 'youtube',   label: '▶️ YouTube',  soon: true },
    ],
  },
  {
    id: 'anuncios',
    label: '📣 Anuncios',
    subs: [
      { id: 'meta-ads',   label: '📘 Meta Ads' },
      { id: 'google-ads', label: '🔍 Google Ads' },
    ],
  },
  {
    id: 'informes',
    label: '📊 Informes',
    subs: [],
  },
]

// Compatibilidad con URLs antiguas (?tab=geo, ?tab=web, etc.)
const LEGACY_MAP = {
  geo:        { tab: 'geo-seo',  sub: 'geo' },
  seo:        { tab: 'geo-seo',  sub: 'seo' },
  web:        { tab: 'web',      sub: 'analytics' },
  anuncios:   { tab: 'anuncios', sub: 'google-ads' },
  contenidos: { tab: 'rrss',     sub: 'instagram' },
  informes:   { tab: 'informes', sub: 'salud' },
}

const VALID_TABS = new Set(NAV.map(n => n.id))

function ComingSoon({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center text-3xl mb-4">
        🚧
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [projects,   setProjects]   = useState([])
  const [projectId,  setProjectId]  = useState(searchParams.get('projectId') ?? '')

  useEffect(() => {
    api.get('/projects').then(r => setProjects(r.data)).catch(() => {})
  }, [])

  function resolveNav() {
    const rawTab = searchParams.get('tab')
    const rawSub = searchParams.get('sub')

    // Backward compat
    if (rawTab && !VALID_TABS.has(rawTab) && LEGACY_MAP[rawTab]) {
      return LEGACY_MAP[rawTab]
    }

    const tab     = VALID_TABS.has(rawTab) ? rawTab : 'geo-seo'
    const navItem = NAV.find(n => n.id === tab)
    const validSubs = new Set(navItem?.subs.map(s => s.id) ?? [])
    const sub = validSubs.has(rawSub) ? rawSub : (navItem?.subs[0]?.id ?? '')
    return { tab, sub }
  }

  const { tab, sub } = resolveNav()

  function setTab(id) {
    const navItem = NAV.find(n => n.id === id)
    const firstSub = navItem?.subs[0]?.id ?? ''
    const params = { tab: id }
    if (firstSub) params.sub = firstSub
    if (projectId) params.projectId = projectId
    setSearchParams(params, { replace: true })
  }

  function setSub(id) {
    const params = { tab, sub: id }
    if (projectId) params.projectId = projectId
    setSearchParams(params, { replace: true })
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

  const activeNav = NAV.find(n => n.id === tab) ?? NAV[0]
  const activeSub = activeNav.subs.find(s => s.id === sub) ?? activeNav.subs[0]

  function renderContent() {
    if (tab === 'informes') return <SaludTab projectId={projectId} onNavigate={(t, s) => { setTab(t); setSub(s) }} />

    if (activeNav.soon || activeNav.subs.length === 0) return <ComingSoon label={activeNav.label} />
    if (activeSub?.soon)                               return <ComingSoon label={activeSub.label} />

    if (tab === 'geo-seo' && sub === 'geo')      return <GeoTab      projectId={projectId} projects={projects} />
    if (tab === 'geo-seo' && sub === 'seo')      return <SeoTab      projectId={projectId} projects={projects} />
    if (tab === 'geo-seo' && sub === 'keywords') return <KeywordsTab projectId={projectId} projects={projects} />
    if (tab === 'web')                           return <WebTab subtab={sub} projectId={projectId} projects={projects} />
    if (tab === 'rrss'     && sub === 'instagram') return <InstagramTab projectId={projectId} />
    if (tab === 'anuncios' && sub === 'meta-ads')    return <MetaAdsTab    projectId={projectId} />
    if (tab === 'anuncios' && sub === 'google-ads')  return <GoogleAdsTab  projectId={projectId} />

    return <ComingSoon label={activeSub?.label ?? activeNav.label} />
  }

  if (flagLoading) return <LoadingSpinner size="lg" fullPage />

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Marketing</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Herramientas de optimización y análisis para tus proyectos
            </p>
          </div>
          <div className="w-64">
            <ProjectSearchSelect
              projects={projects}
              value={projectId}
              onChange={handleProjectChange}
              placeholder="Seleccioná un proyecto…"
            />
          </div>
        </div>

        {!enabled ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Sección no disponible</h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
              Esta sección está siendo activada gradualmente. Si querés acceso anticipado, contactá al equipo de BlissTracker.
            </p>
          </div>
        ) : (
          <>
            {/* ── Tabs principales — desktop ── */}
            <div className="hidden sm:flex gap-1 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1">
              {NAV.map(n => (
                <button
                  key={n.id}
                  onClick={() => setTab(n.id)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors relative ${
                    tab === n.id
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {n.label}
                  {n.soon && tab !== n.id && (
                    <span className="absolute -top-1 -right-1 text-[9px] bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 rounded-full px-1 leading-4">
                      soon
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Subtabs — desktop ── */}
            {!activeNav.soon && activeNav.subs.length > 0 && (
              <div className="hidden sm:flex gap-0 mb-5 border-b border-gray-200 dark:border-gray-700">
                {activeNav.subs.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSub(s.id)}
                    className={`py-2 px-5 text-sm font-medium transition-colors relative ${
                      sub === s.id
                        ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400 -mb-px'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {s.label}
                    {s.soon && sub !== s.id && (
                      <span className="ml-1.5 text-[9px] bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 rounded-full px-1 leading-4">
                        soon
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* ── Mobile: selectores ── */}
            <div className="sm:hidden mb-5 space-y-2">
              <select
                value={tab}
                onChange={e => setTab(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {NAV.map(n => (
                  <option key={n.id} value={n.id}>{n.label}{n.soon ? ' (próximamente)' : ''}</option>
                ))}
              </select>
              {!activeNav.soon && activeNav.subs.length > 0 && (
                <select
                  value={sub}
                  onChange={e => setSub(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {activeNav.subs.map(s => (
                    <option key={s.id} value={s.id}>{s.label}{s.soon ? ' (próximamente)' : ''}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Contenido */}
            {renderContent()}
          </>
        )}
      </main>
    </div>
  )
}
