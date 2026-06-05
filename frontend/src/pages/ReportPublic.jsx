import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import ReportViewer from '../components/marketing/ReportViewer'

const API = import.meta.env.VITE_API_URL || ''

// Selector de informes del mismo proyecto (navegación entre meses)
function ReportSwitcher({ siblings, currentToken, onSelect }) {
  if (!siblings || siblings.length < 2) return null
  return (
    <div className="max-w-3xl mx-auto mb-4">
      <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 flex items-center gap-2 overflow-x-auto">
        <span className="text-xs text-gray-400 shrink-0 pr-1">Informes:</span>
        {siblings.map(s => {
          const active = s.token === currentToken
          return (
            <button
              key={s.token}
              onClick={() => !active && onSelect(s.token)}
              className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${
                active
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
            >
              {s.label}
            </button>
          )
        })}
      </div>
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
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <ReportSwitcher siblings={siblings} currentToken={token} onSelect={(t) => navigate(`/report/${t}`)} />
      <div className="max-w-3xl mx-auto">
        <ReportViewer
          data={data}
          isPublic={true}
          report={report}
          workspace={workspace}
        />
      </div>
    </div>
  )
}
