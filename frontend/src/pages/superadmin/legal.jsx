import { useState, useEffect } from 'react'
import api from '../../api/client'

export const LEGAL_DOCS = [
  {
    key:         'terms_of_service',
    label:       'Condiciones de Uso',
    publicPath:  '/condiciones',
    placeholder: `Condiciones de Uso de BlissTracker\n\nÚltima actualización: ${new Date().toLocaleDateString('es-AR')}\n\n1. Aceptación de los términos\n...\n\n2. Uso del servicio\n...`,
  },
  {
    key:         'privacy_policy',
    label:       'Política de Privacidad',
    publicPath:  '/privacidad',
    placeholder: `Política de Privacidad de BlissTracker\n\nÚltima actualización: ${new Date().toLocaleDateString('es-AR')}\n\n1. Datos que recopilamos\n...\n\n2. Cómo usamos tus datos\n...`,
  },
]

export function LegalDocEditor({ docKey, publicPath, placeholder }) {
  const [content, setContent] = useState('')
  const [title,   setTitle]   = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    setLoading(true)
    api.get(`/superadmin/legal/${docKey}`)
      .then(r => {
        setContent(r.data.content || '')
        setTitle(r.data.title || '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [docKey])

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await api.put(`/superadmin/legal/${docKey}`, { title, content })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.response?.data?.error || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const rootDomain = window.location.hostname.replace(/^[^.]+\./, '')
  const publicUrl  = `${window.location.protocol}//${rootDomain}${publicPath}`

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Se publica en{' '}
        <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline">
          {publicUrl}
        </a>
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            Título del documento
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
            Contenido
          </label>
          <p className="text-xs text-gray-400 mb-2">
            Texto plano. Los saltos de línea se respetan tal como los escribís.
          </p>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={28}
            placeholder={placeholder}
            className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y leading-relaxed"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {saving ? 'Guardando…' : 'Guardar y publicar'}
          </button>
          {saved && <span className="text-sm text-emerald-500">✓ Publicado correctamente</span>}
        </div>
      </div>

      {content && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Vista previa</p>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{title}</h2>
          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
            {content}
          </div>
        </div>
      )}
    </div>
  )
}

export function SectionLegales() {
  const [activeDoc, setActiveDoc] = useState('terms_of_service')
  const doc = LEGAL_DOCS.find(d => d.key === activeDoc)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Legales</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Documentos legales publicados en la landing page.
        </p>
      </div>

      {/* Tabs de documentos */}
      <div className="flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1 w-fit">
        {LEGAL_DOCS.map(d => (
          <button
            key={d.key}
            onClick={() => setActiveDoc(d.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeDoc === d.key
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <LegalDocEditor
        key={doc.key}
        docKey={doc.key}
        publicPath={doc.publicPath}
        placeholder={doc.placeholder}
      />
    </div>
  )
}

