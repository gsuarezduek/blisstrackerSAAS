import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import ReportViewer from '../components/marketing/ReportViewer'
import ClientBriefsView from '../components/ClientBriefsView'
import PortalLoginGate from '../components/portal/PortalLoginGate'
import ClientContentTab from '../components/portal/ClientContentTab'

const API = import.meta.env.VITE_API_URL || ''
const LIVE_REFRESH_COOLDOWN_MS = 15 * 60 * 1000

function TabButton({ active, onClick, children, brandPrimary }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
        active ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
      style={active ? { backgroundColor: brandPrimary } : undefined}
    >
      {children}
    </button>
  )
}

// Contenido del tab "Datos en vivo" una vez autenticado — recibe el token del
// cliente y `requireReauth` de PortalLoginGate (se llama si algún fetch propio
// devuelve 401, ej. el contacto quedó desactivado mientras el token seguía vigente).
function LiveDataPanel({ slug, token, requireReauth, workspace }) {
  const [liveData,     setLiveData]     = useState(null)
  const [liveCachedAt, setLiveCachedAt] = useState(null)
  const [liveLoading,  setLiveLoading]  = useState(true)
  const [liveError,    setLiveError]    = useState(null)
  const [refreshing,   setRefreshing]   = useState(false)

  useEffect(() => {
    setLiveLoading(true)
    setLiveError(null)
    axios.get(`${API}/api/public/client-portal/${slug}/live`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { setLiveData(r.data.data); setLiveCachedAt(r.data.cachedAt) })
      .catch(err => {
        if (err.response?.status === 401) requireReauth()
        else setLiveError(err.response?.data?.error || 'No se pudieron cargar los datos en vivo')
      })
      .finally(() => setLiveLoading(false))
  }, [slug, token, requireReauth])

  async function handleRefreshLive() {
    setRefreshing(true); setLiveError(null)
    try {
      const r = await axios.post(`${API}/api/public/client-portal/${slug}/live/refresh`, {}, { headers: { Authorization: `Bearer ${token}` } })
      setLiveData(r.data.data); setLiveCachedAt(r.data.cachedAt)
    } catch (err) {
      if (err.response?.status === 401) {
        requireReauth()
      } else if (err.response?.status === 429) {
        setLiveError(`Esperá ${err.response.data.waitMins} min antes de actualizar de nuevo.`)
      } else {
        setLiveError(err.response?.data?.error || 'No se pudo actualizar')
      }
    } finally { setRefreshing(false) }
  }

  const cooldownRemainingMs = liveCachedAt ? LIVE_REFRESH_COOLDOWN_MS - (Date.now() - new Date(liveCachedAt).getTime()) : 0
  const canRefresh = cooldownRemainingMs <= 0

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-400">
          {liveCachedAt ? `Actualizado el ${new Date(liveCachedAt).toLocaleString('es-AR')}` : 'Sin datos aún'}
        </p>
        <button
          onClick={handleRefreshLive}
          disabled={refreshing || !canRefresh}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          {refreshing ? 'Actualizando…' : canRefresh ? 'Actualizar' : `Actualizar (${Math.ceil(cooldownRemainingMs / 60000)} min)`}
        </button>
      </div>
      {liveError && <p className="text-sm text-red-600 mb-3">{liveError}</p>}
      {liveLoading && <p className="text-sm text-gray-500">Cargando datos en vivo...</p>}
      {!liveLoading && liveData && <ReportViewer data={liveData} isPublic={true} report={null} workspace={workspace} />}
    </div>
  )
}

export default function ClientPortal() {
  const { token: slug } = useParams()
  const [meta,    setMeta]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [tab,     setTab]     = useState('informes')

  // Informes
  const [selectedToken, setSelectedToken] = useState(null)
  const [reportData,    setReportData]    = useState(null)
  const [reportLoading, setReportLoading] = useState(false)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    axios.get(`${API}/api/public/client-portal/${slug}`)
      .then(r => {
        setMeta(r.data)
        const reports = r.data.reports || []
        if (reports.length) setSelectedToken(reports[0].token)
        else if (!(r.data.briefs || []).length) setTab('vivo')
        else if (!reports.length) setTab('briefs')
      })
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar el portal'))
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    if (!selectedToken || tab !== 'informes') return
    setReportLoading(true)
    axios.get(`${API}/api/public/report/${selectedToken}`)
      .then(r => setReportData(r.data))
      .catch(() => setReportData(null))
      .finally(() => setReportLoading(false))
  }, [selectedToken, tab])

  const workspace = meta?.workspace || null
  const brandPrimary = workspace?.brandColors?.[0]?.hex || '#f97316'
  const reports = meta?.reports || []
  const briefs  = meta?.briefs  || []

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !meta) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">🔒</p>
          <p className="text-lg font-semibold text-gray-800 mb-2">Portal no disponible</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ background: `radial-gradient(1200px 500px at 50% -10%, ${brandPrimary}14, transparent 60%), #f6f7f9` }}
    >
      <div className="max-w-4xl mx-auto mb-5">
        <h1 className="text-xl font-bold text-gray-800 mb-1">{meta.project?.name}</h1>
        <p className="text-sm text-gray-500">{workspace?.companyName || workspace?.name}</p>
      </div>

      <div className="max-w-4xl mx-auto mb-5">
        <div className="bg-white/80 backdrop-blur rounded-xl border border-gray-200/80 shadow-sm px-3 py-2 flex items-center gap-2">
          {reports.length > 0 && <TabButton active={tab === 'informes'} onClick={() => setTab('informes')} brandPrimary={brandPrimary}>Informes</TabButton>}
          {briefs.length > 0  && <TabButton active={tab === 'briefs'}   onClick={() => setTab('briefs')}   brandPrimary={brandPrimary}>Briefs</TabButton>}
          {meta.hasContent && (
            <TabButton active={tab === 'contenido'} onClick={() => setTab('contenido')} brandPrimary={brandPrimary}>
              Contenido{meta.pendingApprovalCount > 0 ? ` (${meta.pendingApprovalCount})` : ''}
            </TabButton>
          )}
          <TabButton active={tab === 'vivo'} onClick={() => setTab('vivo')} brandPrimary={brandPrimary}>Datos en vivo</TabButton>
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        {tab === 'informes' && (
          <>
            {reports.length > 1 && (
              <div className="bg-white/80 backdrop-blur rounded-xl border border-gray-200/80 shadow-sm px-3 py-2 flex items-center gap-2 overflow-x-auto mb-5">
                <span className="text-xs text-gray-400 shrink-0 pr-1 font-medium">Mes</span>
                {reports.map(r => (
                  <button
                    key={r.token}
                    onClick={() => setSelectedToken(r.token)}
                    className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      r.token === selectedToken ? 'text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                    style={r.token === selectedToken ? { backgroundColor: brandPrimary } : undefined}
                  >
                    {r.month}
                  </button>
                ))}
              </div>
            )}
            {reportLoading && <p className="text-sm text-gray-500">Cargando informe...</p>}
            {!reportLoading && reportData && (
              <ReportViewer data={reportData.data} isPublic={true} report={reportData.report} workspace={reportData.workspace} />
            )}
          </>
        )}

        {tab === 'briefs' && <ClientBriefsView briefs={briefs} />}

        {tab === 'contenido' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <PortalLoginGate slug={slug} brandPrimary={brandPrimary}>
              {(token, { requireReauth }) => (
                <ClientContentTab slug={slug} token={token} requireReauth={requireReauth} brandPrimary={brandPrimary} />
              )}
            </PortalLoginGate>
          </div>
        )}

        {tab === 'vivo' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <PortalLoginGate slug={slug} brandPrimary={brandPrimary}>
              {(token, { requireReauth }) => (
                <LiveDataPanel slug={slug} token={token} requireReauth={requireReauth} workspace={workspace} />
              )}
            </PortalLoginGate>
          </div>
        )}
      </div>
    </div>
  )
}
