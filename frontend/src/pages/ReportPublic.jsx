import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import ReportViewer from '../components/marketing/ReportViewer'

const API = import.meta.env.VITE_API_URL || ''

export default function ReportPublic() {
  const { token }            = useParams()
  const [data,    setData]   = useState(null)
  const [report,  setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]  = useState(null)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    axios.get(`${API}/api/public/report/${token}`)
      .then(r => {
        setData(r.data.data)
        setReport(r.data.report)
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
      <div className="max-w-3xl mx-auto">
        {/* Logo / branding */}
        <div className="text-center mb-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Informe de Marketing</p>
        </div>

        <ReportViewer
          data={data}
          objectives={report?.objectives ?? {}}
          isPublic={true}
        />
      </div>
    </div>
  )
}
