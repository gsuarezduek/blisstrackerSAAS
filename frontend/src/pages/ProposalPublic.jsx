import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import DOMPurify from 'dompurify'
import { exportProposalPdf } from '../components/ventas/proposalPdf'
import '../components/situation-editor.css'

const API = import.meta.env.VITE_API_URL || ''

// Vista pública de solo lectura de una propuesta confirmada — link generado
// desde ProposalModal ("🔗 Link"). Sin auth, sin JWT: todo lo que necesita
// (branding, firma resuelta) viaja en la respuesta de /api/public/proposal/:token,
// no se pega a ningún endpoint autenticado.
export default function ProposalPublic() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    window.scrollTo(0, 0)
    axios.get(`${API}/api/public/proposal/${token}`)
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || 'No se pudo cargar la propuesta'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Cargando propuesta...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">📄</p>
          <p className="text-lg font-semibold text-gray-800 mb-2">Propuesta no disponible</p>
          <p className="text-sm text-gray-500">{error || 'No se encontró la propuesta.'}</p>
        </div>
      </div>
    )
  }

  const ws = data.workspace || {}
  const accent = ws.brandColors?.[0]?.hex || '#F7931A'
  const logoUrl = ws.hasLogo ? `${API}/api/public/logo/${ws.slug}` : null
  const date = new Date(data.createdAt || Date.now()).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
  const sig = data.signature
  const sigHasData = !!(sig && (sig.name || sig.email || sig.phone || sig.note || sig.closing || (sig.showLogo && logoUrl)))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between gap-4 border-b-[3px] pb-5 mb-7" style={{ borderColor: accent }}>
          {logoUrl
            ? <img src={logoUrl} alt={ws.name} className="max-h-14 max-w-[200px] object-contain" />
            : <div className="text-lg font-bold text-gray-900">{ws.name}</div>}
          <div className="text-right text-xs text-gray-400">
            {data.companyName && <div>Para: {data.companyName}</div>}
            <div>{date}</div>
          </div>
        </div>

        <h1 className="text-2xl font-extrabold text-gray-900 mb-6">{data.title || `Propuesta v${data.version}`}</h1>

        <div
          className="situation-content bg-white border border-gray-100 rounded-2xl p-6 sm:p-8 shadow-sm"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.content || '<p>(Sin contenido)</p>') }}
        />

        {sigHasData && (
          <div className="mt-8 pt-6 border-t-2" style={{ borderColor: accent }}>
            <h2 className="text-sm font-bold text-gray-900 mb-2 pl-3" style={{ borderLeft: `4px solid ${accent}` }}>Contacto</h2>
            {sig.note && <p className="text-sm text-gray-600 mb-2">{sig.note}</p>}
            <p className="text-sm text-gray-700 mb-2">{sig.closing || 'Atte,'}</p>
            <div className="flex items-center gap-4">
              {sig.showLogo && logoUrl && <img src={logoUrl} alt="" className="max-h-12 max-w-[140px] object-contain" />}
              <div className="text-sm leading-relaxed">
                {sig.name && <div className="font-bold text-gray-900">{sig.name}</div>}
                {sig.role && <div className="text-xs text-gray-500">{sig.role}</div>}
                {sig.email && <div className="text-gray-600">{sig.email}</div>}
                {sig.phone && <div className="text-gray-600">{sig.phone}</div>}
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <button
            onClick={() => exportProposalPdf(
              { createdAt: data.createdAt, title: data.title, content: data.content, version: data.version, signatureId: data.signatureId },
              { companyName: data.companyName, workspace: ws },
            )}
            className="px-4 py-2 text-sm font-medium rounded-xl text-white"
            style={{ backgroundColor: accent }}
          >
            🖨️ Descargar PDF
          </button>
        </div>

        <p className="mt-10 text-center text-[11px] text-gray-400">{ws.name}{ws.name ? ' · ' : ''}Documento generado el {date}</p>
      </div>
    </div>
  )
}
