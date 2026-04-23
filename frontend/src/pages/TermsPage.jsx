import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'

/**
 * Página pública para documentos legales.
 * @param {string} docKey - key del documento ('terms_of_service' | 'privacy_policy')
 */
export default function LegalPage({ docKey }) {
  const [doc,     setDoc]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    api.get(`/legal/${docKey}`)
      .then(r => setDoc(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [docKey])

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-sm text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Volver al inicio
          </Link>
          <span className="text-sm font-semibold text-gray-300">BlissTracker</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-gray-400">No se pudo cargar el documento.</p>
          </div>
        )}

        {doc && !loading && (
          <>
            <h1 className="text-3xl font-bold text-white mb-2">{doc.title}</h1>
            {doc.updatedAt && (
              <p className="text-sm text-gray-500 mb-10">
                Última actualización:{' '}
                {new Date(doc.updatedAt).toLocaleDateString('es-AR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </p>
            )}
            {doc.content ? (
              <div className="text-gray-300 leading-relaxed whitespace-pre-wrap text-sm">
                {doc.content}
              </div>
            ) : (
              <p className="text-gray-500 italic">Este documento aún no tiene contenido.</p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
