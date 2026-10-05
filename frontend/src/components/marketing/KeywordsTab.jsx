import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import ConfirmModal from '../ConfirmModal'
import ObjectiveProgressBars from './ObjectiveProgressBars'
import useObjectiveProgress from './useObjectiveProgress'
import OportunidadesTab from './OportunidadesTab'
import { KeyRound, Search } from 'lucide-react'
import { Icon } from '../ui/Icon'
import { currentMonthStr, countryLabel, exportCsv } from './keywords/keywordsHelpers'
import { CountrySelector } from './keywords/KeywordsUI'
import KeywordRow from './keywords/KeywordRow'
import KeywordHeatmap from './keywords/KeywordHeatmap'
import ClustersView from './keywords/ClustersView'
import SerpOverview from './keywords/SerpOverview'
import SuggestModal from './keywords/SuggestModal'

// ─── Componente principal ─────────────────────────────────────────────────────

export default function KeywordsTab({ projectId, projects }) {
  const objectives = useObjectiveProgress(projectId).filter(o => o.metric === 'posicionamiento')
  const [keywords,          setKeywords]          = useState([])
  const [loading,           setLoading]           = useState(false)
  const [error,             setError]             = useState('')
  const [expanded,          setExpanded]          = useState(null)
  const [suggestOpen,       setSuggestOpen]       = useState(false)
  const [view,              setView]              = useState('tabla') // 'tabla' | 'heatmap' | 'clusters' | 'serp'
  const [country,           setCountry]           = useState('arg')
  const [integrationCountry, setIntegrationCountry] = useState('arg')
  const [liveMode,          setLiveMode]          = useState(false)
  const [savingDefault,     setSavingDefault]     = useState(false)
  const [serpBatch,         setSerpBatch]         = useState({}) // { [kwId]: { position, serpFeatures, capturedAt } }
  const [kwToRemove,        setKwToRemove]        = useState(null) // keyword | null
  const [removingKw,        setRemovingKw]        = useState(false)

  const selectedProject = projects.find(p => String(p.id) === String(projectId))

  const loadSerpBatch = useCallback((pid) => {
    const id = pid ?? projectId
    if (!id) return
    api.get(`/marketing/projects/${id}/keywords/serp-batch`)
      .then(r => setSerpBatch(r.data.snapshots ?? {}))
      .catch(() => {})
  }, [projectId]) // eslint-disable-line

  const loadKeywords = useCallback((overrideCountry) => {
    if (!projectId) return
    const c = overrideCountry ?? country
    setLoading(true)
    setError('')
    const params = c ? `?country=${c}` : ''
    api.get(`/marketing/projects/${projectId}/keywords${params}`)
      .then(r => {
        const data = r.data
        setKeywords(data.keywords ?? [])
        setLiveMode(data.liveMode ?? false)
        if (data.integrationCountry) {
          setIntegrationCountry(data.integrationCountry)
          // Solo setea el country inicial desde la integración en la primera carga
          if (overrideCountry === undefined && !liveMode) {
            setCountry(data.integrationCountry)
          }
        }
      })
      .catch(err => setError(err.response?.data?.error ?? 'Error al cargar keywords'))
      .finally(() => setLoading(false))
  }, [projectId, country]) // eslint-disable-line

  // Carga inicial y cuando cambia el proyecto
  useEffect(() => {
    setCountry('arg')
    setIntegrationCountry('arg')
    setLiveMode(false)
    setExpanded(null)
    setSerpBatch({})
    loadKeywords('arg')
    loadSerpBatch(projectId)
  }, [projectId]) // eslint-disable-line

  function handleCountryChange(newCountry) {
    setCountry(newCountry)
    setExpanded(null)
    loadKeywords(newCountry)
  }

  async function handleSaveDefault() {
    setSavingDefault(true)
    try {
      await api.patch(`/marketing/projects/${projectId}/integrations/google_search_console`, { country })
      setIntegrationCountry(country)
      setLiveMode(false)
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al guardar el país predeterminado')
    } finally {
      setSavingDefault(false)
    }
  }

  function handleRemove(kwId) {
    setKwToRemove(keywords.find(k => k.id === kwId) || { id: kwId })
  }

  async function confirmRemoveKeyword() {
    if (!kwToRemove) return
    setRemovingKw(true)
    try {
      await api.delete(`/marketing/projects/${projectId}/keywords/${kwToRemove.id}`)
      setKeywords(prev => prev.filter(k => k.id !== kwToRemove.id))
      if (expanded === kwToRemove.id) setExpanded(null)
    } catch (err) {
      alert(err.response?.data?.error ?? 'Error al eliminar')
    } finally {
      setRemovingKw(false)
      setKwToRemove(null)
    }
  }

  // ── Estado vacío: sin proyecto ──────────────────────────────────────────────
  if (!projectId) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
        <div className="mb-3"><Icon as={KeyRound} size={32} className="inline-block text-gray-300 dark:text-gray-600" /></div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná un proyecto arriba para rastrear keywords</p>
      </div>
    )
  }

  // ── Loading inicial ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    const noGsc = error.toLowerCase().includes('search console') || error.toLowerCase().includes('no conectado')
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-4 text-sm text-red-600 dark:text-red-400">
        {noGsc
          ? <>Conectá Google Search Console en <strong>Proyectos → Info → Integraciones Google</strong> para rastrear keywords.</>
          : error
        }
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
            Palabras clave rastreadas
            {keywords.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gray-400">({keywords.length})</span>
            )}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Período actual: {currentMonthStr()}
            {selectedProject?.name && ` · ${selectedProject.name}`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <CountrySelector
            country={country}
            integrationCountry={integrationCountry}
            onChange={handleCountryChange}
            onSaveDefault={handleSaveDefault}
            savingDefault={savingDefault}
          />
          {/* Toggle de vista */}
          <div className="flex rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden text-xs">
            {[
              { id: 'tabla',    label: 'Tabla' },
              { id: 'heatmap',  label: 'Heatmap' },
              { id: 'clusters', label: 'Clusters' },
              { id: 'serp',     label: 'SERP Live' },
            ].map(v => (
              <button key={v.id} onClick={() => setView(v.id)}
                className={`px-3 py-2 transition-colors ${
                  view === v.id
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}>
                {v.label}
              </button>
            ))}
          </div>
          {keywords.length > 0 && (
            <button
              onClick={() => exportCsv(keywords)}
              className="px-3 py-2 text-xs border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors"
              title="Exportar a CSV"
            >
              ↓ CSV
            </button>
          )}
          <button
            onClick={() => setSuggestOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors"
          >
            <span className="text-base leading-none">+</span>
            Agregar
          </button>
        </div>
      </div>

      {/* Objetivos de posicionamiento del proyecto */}
      {objectives.length > 0 && (
        <div className="mb-4">
          <ObjectiveProgressBars objectives={objectives} title="Objetivos de posicionamiento" />
        </div>
      )}

      {/* Aviso modo en vivo */}
      {liveMode && (
        <div className="mb-4 flex items-start gap-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl px-4 py-3">
          <span className="text-orange-500 mt-0.5 shrink-0">ℹ</span>
          <p className="text-xs text-orange-700 dark:text-orange-300">
            Mostrando datos en vivo de <strong>{countryLabel(country)}</strong> desde Search Console. Los rankings
            guardados mensualmente son de <strong>{countryLabel(integrationCountry)}</strong>.
            {' '}El historial y el delta solo están disponibles para el país predeterminado.
          </p>
        </div>
      )}

      {/* Lista vacía */}
      {keywords.length === 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <div className="mb-3"><Icon as={Search} size={28} className="inline-block text-gray-300 dark:text-gray-600" /></div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Todavía no rastreás ninguna keyword
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            Hacé click en <strong>+ Agregar</strong> para escribir cualquier palabra clave o elegir desde Search Console.
          </p>
          <button
            onClick={() => setSuggestOpen(true)}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors"
          >
            + Agregar keywords
          </button>
        </div>
      )}

      {/* Vistas de keywords */}
      {keywords.length > 0 && view === 'tabla' && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-left">Keyword</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">GSC ↕</th>
                <th className="px-4 py-3 text-xs font-medium text-purple-400 dark:text-purple-400 text-right">SERP</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">
                  {liveMode ? <span className="text-orange-500">Cambio</span> : 'Cambio'}
                </th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Clicks</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Impres. ↓</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {[...keywords]
                .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
                .map(kw => (
                  <KeywordRow
                    key={kw.id}
                    kw={{ ...kw, projectId }}
                    serpSnap={serpBatch[kw.id] ?? null}
                    isExpanded={expanded === kw.id}
                    onToggle={() => setExpanded(expanded === kw.id ? null : kw.id)}
                    onRemove={handleRemove}
                    onAddKeyword={async q => {
                      await api.post(`/marketing/projects/${projectId}/keywords`, { query: q }).catch(() => {})
                      loadKeywords(country)
                    }}
                  />
                ))
              }
            </tbody>
          </table>
        </div>
      )}

      {view === 'heatmap' && (
        <KeywordHeatmap projectId={projectId} />
      )}

      {keywords.length > 0 && view === 'clusters' && (
        <ClustersView
          keywords={keywords}
          projectId={projectId}
          expanded={expanded}
          onToggle={id => setExpanded(expanded === id ? null : id)}
          onRemove={handleRemove}
        />
      )}

      {view === 'serp' && (
        <SerpOverview
          projectId={projectId}
          keywords={keywords}
          onAddKeyword={async q => {
            await api.post(`/marketing/projects/${projectId}/keywords`, { query: q }).catch(() => {})
            loadKeywords(country)
          }}
        />
      )}

      <p className="text-xs text-gray-400 mt-3 text-right">
        Rankings guardados automáticamente el 1° de cada mes · {countryLabel(integrationCountry)} · Google Search Console
      </p>

      {/* Oportunidades SEO (striking distance, CTR bajo, content decay) */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-3">Oportunidades</h2>
        <OportunidadesTab projectId={projectId} projects={projects} />
      </div>

      {/* Modal sugerencias */}
      {suggestOpen && (
        <SuggestModal
          projectId={projectId}
          country={country}
          onClose={() => setSuggestOpen(false)}
          onAdded={() => loadKeywords(country)}
        />
      )}

      <ConfirmModal
        open={!!kwToRemove}
        title="Dejar de rastrear keyword"
        message={kwToRemove?.query ? `Se borrarán todos los datos históricos de "${kwToRemove.query}".` : 'Se borrarán todos sus datos históricos.'}
        confirmLabel="Dejar de rastrear"
        loading={removingKw}
        onConfirm={confirmRemoveKeyword}
        onCancel={() => setKwToRemove(null)}
      />
    </>
  )
}
