import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import LoadingSpinner from '../components/LoadingSpinner'
import GeoTab   from '../components/marketing/GeoTab'
import WebTab   from '../components/marketing/WebTab'
import { useFeatureFlag } from '../hooks/useFeatureFlag'

const TABS = [
  { id: 'geo',        label: '🤖 GEO' },
  { id: 'web',        label: '🌐 Web' },
  { id: 'seo',        label: '🔍 SEO',        soon: true },
  { id: 'anuncios',   label: '📣 Anuncios',    soon: true },
  { id: 'contenidos', label: '✍️ Contenidos',  soon: true },
  { id: 'informes',   label: '📊 Informes',    soon: true },
]
const VALID_TABS = new Set(TABS.map(t => t.id))

function ComingSoon({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center text-3xl mb-4">
        🚧
      </div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">{label} — Próximamente</h3>
      <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
        Esta sección está en desarrollo. Por ahora podés usar la funcionalidad GEO.
      </p>
    </div>
  )
}

export default function Marketing() {
  const { enabled, loading: flagLoading } = useFeatureFlag('marketing')
  const [searchParams, setSearchParams] = useSearchParams()

  const rawTab = searchParams.get('tab')
  const tab    = VALID_TABS.has(rawTab) ? rawTab : 'geo'

  function setTab(id) {
    setSearchParams({ tab: id }, { replace: true })
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
            {/* Tabs — desktop */}
            <div className="hidden sm:flex gap-1 mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors relative ${
                    tab === t.id
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {t.label}
                  {t.soon && tab !== t.id && (
                    <span className="absolute -top-1 -right-1 text-[9px] bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 rounded-full px-1 leading-4">
                      soon
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tabs — mobile */}
            <div className="sm:hidden mb-5">
              <select
                value={tab}
                onChange={e => setTab(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {TABS.map(t => (
                  <option key={t.id} value={t.id}>{t.label}{t.soon ? ' (próximamente)' : ''}</option>
                ))}
              </select>
            </div>

            {/* Content */}
            {tab === 'geo'        && <GeoTab />}
            {tab === 'web'        && <WebTab />}
            {tab === 'seo'        && <ComingSoon label="SEO" />}
            {tab === 'anuncios'   && <ComingSoon label="Anuncios" />}
            {tab === 'contenidos' && <ComingSoon label="Contenidos" />}
            {tab === 'informes'   && <ComingSoon label="Informes" />}
          </>
        )}
      </main>
    </div>
  )
}
