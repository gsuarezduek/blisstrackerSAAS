import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import GeoTab from '../components/marketing/GeoTab'
import WebTab from '../components/marketing/WebTab'
import SeoTab from '../components/marketing/SeoTab'
import { useFeatureFlag } from '../hooks/useFeatureFlag'

const NAV = [
  {
    id: 'geo-seo',
    label: '🤖 GEO / SEO',
    subs: [
      { id: 'geo', label: '🤖 GEO' },
      { id: 'seo', label: '🔍 SEO' },
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
    soon: true,
    subs: [
      { id: 'metricas',   label: '📊 Métricas',   soon: true },
      { id: 'contenidos', label: '✍️ Contenidos', soon: true },
    ],
  },
  {
    id: 'anuncios',
    label: '📣 Anuncios',
    soon: true,
    subs: [
      { id: 'google-ads', label: '🔍 Google Ads', soon: true },
      { id: 'meta-ads',   label: '📘 Meta Ads',   soon: true },
    ],
  },
  {
    id: 'informes',
    label: '📊 Informes',
    soon: true,
    subs: [],
  },
]

// Compatibilidad con URLs antiguas (?tab=geo, ?tab=web, etc.)
const LEGACY_MAP = {
  geo:        { tab: 'geo-seo',  sub: 'geo' },
  seo:        { tab: 'geo-seo',  sub: 'seo' },
  web:        { tab: 'web',      sub: 'analytics' },
  anuncios:   { tab: 'anuncios', sub: 'google-ads' },
  contenidos: { tab: 'rrss',     sub: 'contenidos' },
  informes:   { tab: 'informes', sub: '' },
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
    setSearchParams(params, { replace: true })
  }

  function setSub(id) {
    setSearchParams({ tab, sub: id }, { replace: true })
  }

  const activeNav = NAV.find(n => n.id === tab) ?? NAV[0]
  const activeSub = activeNav.subs.find(s => s.id === sub) ?? activeNav.subs[0]

  function renderContent() {
    if (activeNav.soon || activeNav.subs.length === 0) return <ComingSoon label={activeNav.label} />
    if (activeSub?.soon)                               return <ComingSoon label={activeSub.label} />

    if (tab === 'geo-seo' && sub === 'geo') return <GeoTab />
    if (tab === 'geo-seo' && sub === 'seo') return <SeoTab />
    if (tab === 'web')                      return <WebTab subtab={sub} />

    return <ComingSoon label={activeSub?.label ?? activeNav.label} />
  }

  if (flagLoading) return <LoadingSpinner size="lg" fullPage />

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Marketing</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Herramientas de optimización y análisis para tus proyectos
          </p>
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
