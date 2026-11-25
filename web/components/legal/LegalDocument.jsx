import Link from 'next/link'
import LegalPage from './LegalPage'

/**
 * Documento legal editable desde SuperAdmin → Legal (GET /api/legal/:docKey).
 * `doc` puede venir null si el backend no contestó: en ese caso se muestra el aviso en
 * vez de una página en blanco, igual que hacía la SPA.
 */
export default function LegalDocument({ doc, fallbackTitle, docKey }) {
  const updated = doc?.updatedAt
    ? new Date(doc.updatedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <LegalPage
      title={doc?.title || fallbackTitle}
      subtitle={updated ? `Última actualización: ${updated}` : null}
    >
      {!doc ? (
        <p className="text-gray-400">No se pudo cargar el documento.</p>
      ) : doc.content ? (
        <div className="text-gray-300 leading-relaxed whitespace-pre-wrap text-sm">
          {doc.content}
        </div>
      ) : (
        <p className="text-gray-500 italic">Este documento aún no tiene contenido.</p>
      )}

      {docKey === 'privacy_policy' && (
        <p className="text-sm text-gray-400 mt-10 pt-6 border-t border-gray-800">
          ¿Querés eliminar tus datos?{' '}
          <Link href="/eliminar-datos" className="text-orange-400 hover:text-orange-300 underline">
            Mirá cómo solicitarlo
          </Link>.
        </p>
      )}
    </LegalPage>
  )
}
