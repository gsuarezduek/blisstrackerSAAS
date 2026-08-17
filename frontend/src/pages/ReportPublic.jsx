import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import ReportViewer from '../components/marketing/ReportViewer'
import ReportFeedbackWidget from '../components/marketing/ReportFeedbackWidget'

const API = import.meta.env.VITE_API_URL || ''

// Selector de informes del mismo proyecto (navegación entre meses) — por
// defecto queda seleccionado el más reciente (currentToken); este control solo
// deja elegir otro anterior.
function ReportSwitcher({ siblings, currentToken, onSelect }) {
  if (!siblings || siblings.length < 2) return null
  return (
    <div className="max-w-4xl mx-auto mb-5 flex items-center gap-2">
      <label htmlFor="report-month-switcher" className="text-xs text-gray-400 font-medium shrink-0">Mes</label>
      <select
        id="report-month-switcher"
        value={currentToken}
        onChange={e => e.target.value !== currentToken && onSelect(e.target.value)}
        className="text-sm font-semibold text-gray-700 bg-white/80 backdrop-blur border border-gray-200/80 rounded-lg px-3 py-1.5 shadow-sm focus:outline-none"
      >
        {siblings.map(s => (
          <option key={s.token} value={s.token}>{s.label}</option>
        ))}
      </select>
    </div>
  )
}

export default function ReportPublic() {
  const { token }            = useParams()
  const navigate             = useNavigate()
  const [data,      setData]      = useState(null)
  const [report,    setReport]    = useState(null)
  const [workspace, setWorkspace] = useState(null)
  const [siblings,  setSiblings]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    window.scrollTo(0, 0)
    axios.get(`${API}/api/public/report/${token}`)
      .then(r => {
        setData(r.data.data)
        setReport(r.data.report)
        setWorkspace(r.data.workspace ?? null)
        setSiblings(r.data.siblings ?? [])
      })
      .catch(err => {
        const msg = err.response?.data?.error || 'No se pudo cargar el informe'
        setError(msg)
      })
      .finally(() => setLoading(false))
  }, [token])

  const brandPrimary = workspace?.brandColors?.[0]?.hex || '#f97316'
  const agencyName   = workspace?.companyName || workspace?.name || ''

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Cargando informe...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">📄</p>
          <p className="text-lg font-semibold text-gray-800 mb-2">Informe no disponible</p>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div
      className="min-h-screen py-8 px-4"
      style={{ background: `radial-gradient(1200px 500px at 50% -10%, ${brandPrimary}14, transparent 60%), #f6f7f9` }}
    >
      <ReportSwitcher siblings={siblings} currentToken={token} onSelect={(t) => navigate(`/report/${t}`)} />
      <div className="max-w-4xl mx-auto">
        <ReportViewer
          data={data}
          isPublic={true}
          report={report}
          workspace={workspace}
        />
      </div>

      {/* Feedback flotante del cliente */}
      <ReportFeedbackWidget token={token} brandPrimary={brandPrimary} agencyName={agencyName} />
    </div>
  )
}
