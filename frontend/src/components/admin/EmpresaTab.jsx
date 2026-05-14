import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'

const INDUSTRIES = [
  'Agencia de Marketing',
  'Tecnología / Software',
  'E-commerce / Retail',
  'Gastronomía',
  'Salud y Bienestar',
  'Educación',
  'Inmobiliaria',
  'Logística y Transporte',
  'Finanzas y Contabilidad',
  'Moda e Indumentaria',
  'Turismo y Hospitalidad',
  'Medios y Entretenimiento',
  'Construcción y Arquitectura',
  'Consultoría',
  'Recursos Humanos',
  'Otro',
]

export default function EmpresaTab() {
  const [form, setForm] = useState({
    companyName:        '',
    companyDescription: '',
    industry:           '',
    companyWebsite:     '',
  })
  const [saving, setSaving]         = useState(false)
  const [saveMsg, setSaveMsg]       = useState('')
  const [saveErr, setSaveErr]       = useState('')

  // Logo
  const [logoPreview, setLogoPreview]   = useState(null)
  const [logoFile, setLogoFile]         = useState(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoMsg, setLogoMsg]           = useState('')
  const logoInputRef = useRef()

  // Banner
  const [bannerPreview, setBannerPreview] = useState(null)
  const [bannerFile, setBannerFile]       = useState(null)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [bannerMsg, setBannerMsg]         = useState('')
  const bannerInputRef = useRef()

  // Slug del workspace (para construir URLs de imagen)
  const [slug, setSlug] = useState('')

  useEffect(() => {
    api.get('/workspaces/current').then(r => {
      const w = r.data
      setSlug(w.slug ?? '')
      setForm({
        companyName:        w.companyName        ?? '',
        companyDescription: w.companyDescription ?? '',
        industry:           w.industry           ?? '',
        companyWebsite:     w.companyWebsite     ?? '',
      })
      if (w.slug) {
        const base = import.meta.env.VITE_API_URL
        setLogoPreview(`${base}/api/public/logo/${w.slug}?t=${Date.now()}`)
        setBannerPreview(`${base}/api/public/banner/${w.slug}?t=${Date.now()}`)
      }
    }).catch(() => {})
  }, [])

  // ── Guardar texto ──────────────────────────────────────────────────────────

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    setSaveErr('')
    try {
      await api.patch('/workspaces/current', form)
      setSaveMsg('Información guardada correctamente.')
    } catch (err) {
      setSaveErr(err.response?.data?.error || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // ── Logo ──────────────────────────────────────────────────────────────────

  function onLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setLogoMsg('')
  }

  async function uploadLogo() {
    if (!logoFile) return
    setLogoUploading(true)
    setLogoMsg('')
    try {
      const fd = new FormData()
      fd.append('image', logoFile)
      await api.post('/workspaces/current/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setLogoFile(null)
      setLogoMsg('Logo actualizado.')
    } catch (err) {
      setLogoMsg(err.response?.data?.error || 'Error al subir logo')
    } finally {
      setLogoUploading(false)
    }
  }

  async function deleteLogo() {
    if (!confirm('¿Eliminar el logo?')) return
    try {
      await api.delete('/workspaces/current/logo')
      setLogoPreview(null)
      setLogoFile(null)
      setLogoMsg('Logo eliminado.')
    } catch {
      setLogoMsg('Error al eliminar logo')
    }
  }

  // ── Banner ────────────────────────────────────────────────────────────────

  function onBannerChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBannerFile(file)
    setBannerPreview(URL.createObjectURL(file))
    setBannerMsg('')
  }

  async function uploadBanner() {
    if (!bannerFile) return
    setBannerUploading(true)
    setBannerMsg('')
    try {
      const fd = new FormData()
      fd.append('image', bannerFile)
      await api.post('/workspaces/current/banner', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setBannerFile(null)
      setBannerMsg('Banner actualizado.')
    } catch (err) {
      setBannerMsg(err.response?.data?.error || 'Error al subir banner')
    } finally {
      setBannerUploading(false)
    }
  }

  async function deleteBanner() {
    if (!confirm('¿Eliminar el banner?')) return
    try {
      await api.delete('/workspaces/current/banner')
      setBannerPreview(null)
      setBannerFile(null)
      setBannerMsg('Banner eliminado.')
    } catch {
      setBannerMsg('Error al eliminar banner')
    }
  }

  return (
    <div className="space-y-8">

      {/* ── Información de la empresa ──────────────────────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Información de la empresa</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Esta información contextualiza las recomendaciones de la IA y personaliza los informes de marketing.
        </p>

        <form onSubmit={handleSave} className="space-y-5">
          {/* Nombre comercial */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nombre comercial
            </label>
            <input
              type="text"
              value={form.companyName}
              onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
              placeholder="Ej: Bliss Marketing"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Industria */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Industria / Sector
            </label>
            <select
              value={form.industry}
              onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Seleccionar...</option>
              {INDUSTRIES.map(ind => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
          </div>

          {/* Sitio web */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sitio web
            </label>
            <input
              type="url"
              value={form.companyWebsite}
              onChange={e => setForm(f => ({ ...f, companyWebsite: e.target.value }))}
              placeholder="https://tuempresa.com"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Descripción de la empresa
            </label>
            <textarea
              value={form.companyDescription}
              onChange={e => setForm(f => ({ ...f, companyDescription: e.target.value }))}
              rows={4}
              placeholder="Describí el rubro, propuesta de valor, públicos objetivos y cualquier contexto relevante para la IA..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Esta descripción se inyecta en el contexto del coach IA y en los análisis de informes.
            </p>
          </div>

          {saveErr && <p className="text-sm text-red-600">{saveErr}</p>}
          {saveMsg && <p className="text-sm text-green-600">{saveMsg}</p>}

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Guardando...' : 'Guardar información'}
          </button>
        </form>
      </section>

      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Logo</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Se usa en el encabezado de los informes mensuales. PNG, JPG, WEBP o SVG. Máx. 5 MB.
        </p>

        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {/* Preview */}
          <div className="flex-shrink-0 w-40 h-24 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Logo"
                className="max-w-full max-h-full object-contain p-2"
                onError={() => setLogoPreview(null)}
              />
            ) : (
              <span className="text-xs text-gray-400">Sin logo</span>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <input
              ref={logoInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.svg"
              className="hidden"
              onChange={onLogoChange}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Seleccionar imagen
              </button>
              {logoFile && (
                <button
                  type="button"
                  onClick={uploadLogo}
                  disabled={logoUploading}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white transition-colors"
                >
                  {logoUploading ? 'Subiendo...' : 'Subir logo'}
                </button>
              )}
              {logoPreview && !logoFile && (
                <button
                  type="button"
                  onClick={deleteLogo}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                >
                  Eliminar
                </button>
              )}
            </div>
            {logoFile && <p className="text-xs text-gray-500">Archivo seleccionado: {logoFile.name}</p>}
            {logoMsg && (
              <p className={`text-xs ${logoMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {logoMsg}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Banner ────────────────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Banner / Imagen de portada</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Imagen de fondo en el encabezado de los informes. PNG, JPG o WEBP. Recomendado 1200×300 px. Máx. 5 MB.
        </p>

        <div className="space-y-4">
          {/* Preview */}
          <div className="w-full h-32 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
            {bannerPreview ? (
              <img
                src={bannerPreview}
                alt="Banner"
                className="w-full h-full object-cover"
                onError={() => setBannerPreview(null)}
              />
            ) : (
              <span className="text-xs text-gray-400">Sin banner</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={bannerInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={onBannerChange}
            />
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Seleccionar imagen
            </button>
            {bannerFile && (
              <button
                type="button"
                onClick={uploadBanner}
                disabled={bannerUploading}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white transition-colors"
              >
                {bannerUploading ? 'Subiendo...' : 'Subir banner'}
              </button>
            )}
            {bannerPreview && !bannerFile && (
              <button
                type="button"
                onClick={deleteBanner}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
              >
                Eliminar
              </button>
            )}
          </div>
          {bannerFile && <p className="text-xs text-gray-500">Archivo seleccionado: {bannerFile.name}</p>}
          {bannerMsg && (
            <p className={`text-xs ${bannerMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {bannerMsg}
            </p>
          )}
        </div>
      </section>

    </div>
  )
}
