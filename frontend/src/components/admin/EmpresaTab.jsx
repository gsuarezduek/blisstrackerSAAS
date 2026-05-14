import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'

// ─── Constantes ───────────────────────────────────────────────────────────────

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

// Fuentes populares agrupadas por categoría
const FONT_SUGGESTIONS = [
  { group: 'Sans-serif',  fonts: ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'Nunito', 'DM Sans', 'Outfit', 'Plus Jakarta Sans'] },
  { group: 'Serif',       fonts: ['Playfair Display', 'Merriweather', 'Lora', 'EB Garamond', 'Cormorant Garamond', 'Libre Baskerville'] },
  { group: 'Display',     fonts: ['Syne', 'Space Grotesk', 'Bebas Neue', 'Raleway', 'Josefin Sans', 'Oswald', 'Abril Fatface'] },
  { group: 'Monospace',   fonts: ['JetBrains Mono', 'Fira Code', 'Space Mono', 'IBM Plex Mono'] },
]

const FONT_ROLES = [
  { value: 'heading', label: 'Títulos' },
  { value: 'body',    label: 'Cuerpo' },
  { value: 'accent',  label: 'Acento' },
]

const ROLE_COLORS = {
  heading: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  body:    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  accent:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
}

// Inyectar fuente de Google Fonts dinámicamente para la preview
const loadedFonts = new Set()
function loadGoogleFont(name) {
  if (!name || loadedFonts.has(name)) return
  loadedFonts.add(name)
  const link = document.createElement('link')
  link.rel  = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;700&display=swap`
  document.head.appendChild(link)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidHex(str) {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(str)
}

function normalizeHex(str) {
  const s = str.startsWith('#') ? str : `#${str}`
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    const [, a, b, c] = s
    return `#${a}${a}${b}${b}${c}${c}`.toUpperCase()
  }
  return s.toUpperCase()
}

// Contraste: devuelve 'black' o 'white' para texto encima de un color
function textOnBg(hex) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#000000' : '#FFFFFF'
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function EmpresaTab() {
  // ── Info general ──────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    companyName:        '',
    companyDescription: '',
    industry:           '',
    companyWebsite:     '',
  })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveErr, setSaveErr] = useState('')

  // ── Logo ──────────────────────────────────────────────────────────────────
  const [logoPreview, setLogoPreview]       = useState(null)
  const [logoFile, setLogoFile]             = useState(null)
  const [logoUploading, setLogoUploading]   = useState(false)
  const [logoMsg, setLogoMsg]               = useState('')
  const logoInputRef = useRef()

  // ── Banner ────────────────────────────────────────────────────────────────
  const [bannerPreview, setBannerPreview]       = useState(null)
  const [bannerFile, setBannerFile]             = useState(null)
  const [bannerUploading, setBannerUploading]   = useState(false)
  const [bannerMsg, setBannerMsg]               = useState('')
  const bannerInputRef = useRef()

  // ── Colores ───────────────────────────────────────────────────────────────
  const [colors, setColors]               = useState([])        // [{ hex, name }]
  const [newColorHex, setNewColorHex]     = useState('#000000') // input type="color"
  const [newColorName, setNewColorName]   = useState('')        // etiqueta opcional
  const [colorSaving, setColorSaving]     = useState(false)
  const [colorMsg, setColorMsg]           = useState('')

  // ── Fuentes ───────────────────────────────────────────────────────────────
  const [fonts, setFonts]               = useState([])          // [{ name, role }]
  const [newFontName, setNewFontName]   = useState('')
  const [newFontRole, setNewFontRole]   = useState('heading')
  const [showFontSugg, setShowFontSugg] = useState(false)
  const [fontSaving, setFontSaving]     = useState(false)
  const [fontMsg, setFontMsg]           = useState('')
  const fontInputRef = useRef()

  // Slug para URLs de imagen
  const [slug, setSlug] = useState('')

  // ── Carga inicial ─────────────────────────────────────────────────────────
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

      const savedColors = Array.isArray(w.brandColors) ? w.brandColors : []
      const savedFonts  = Array.isArray(w.brandFonts)  ? w.brandFonts  : []
      setColors(savedColors)
      setFonts(savedFonts)
      savedFonts.forEach(f => loadGoogleFont(f.name))
    }).catch(() => {})
  }, [])

  // ── Cerrar sugerencias al hacer click fuera ───────────────────────────────
  useEffect(() => {
    if (!showFontSugg) return
    function handleClick(e) {
      if (!fontInputRef.current?.parentElement?.contains(e.target)) {
        setShowFontSugg(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showFontSugg])

  // ── Info general ──────────────────────────────────────────────────────────

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

  // ── Colores ───────────────────────────────────────────────────────────────

  async function saveColors(next) {
    setColorSaving(true)
    setColorMsg('')
    try {
      await api.patch('/workspaces/current', { brandColors: next })
      setColors(next)
    } catch {
      setColorMsg('Error al guardar colores')
    } finally {
      setColorSaving(false)
    }
  }

  async function handleAddColor() {
    const hex = normalizeHex(newColorHex)
    if (!isValidHex(hex)) { setColorMsg('Código de color inválido'); return }
    if (colors.some(c => c.hex.toUpperCase() === hex)) { setColorMsg('Ese color ya está en la paleta'); return }
    await saveColors([...colors, { hex, name: newColorName.trim() || '' }])
    setNewColorName('')
  }

  async function handleRemoveColor(idx) {
    await saveColors(colors.filter((_, i) => i !== idx))
  }

  async function handleUpdateColorName(idx, name) {
    const next = colors.map((c, i) => i === idx ? { ...c, name } : c)
    await saveColors(next)
  }

  // ── Fuentes ───────────────────────────────────────────────────────────────

  async function saveFonts(next) {
    setFontSaving(true)
    setFontMsg('')
    try {
      await api.patch('/workspaces/current', { brandFonts: next })
      setFonts(next)
    } catch {
      setFontMsg('Error al guardar tipografías')
    } finally {
      setFontSaving(false)
    }
  }

  async function handleAddFont() {
    const name = newFontName.trim()
    if (!name) { setFontMsg('Escribí el nombre de una fuente'); return }
    if (fonts.some(f => f.name.toLowerCase() === name.toLowerCase() && f.role === newFontRole)) {
      setFontMsg('Esa combinación de fuente y rol ya existe')
      return
    }
    loadGoogleFont(name)
    await saveFonts([...fonts, { name, role: newFontRole }])
    setNewFontName('')
    setShowFontSugg(false)
  }

  async function handleRemoveFont(idx) {
    await saveFonts(fonts.filter((_, i) => i !== idx))
  }

  // Filtrar sugerencias según lo que escribe el usuario
  const fontQuery = newFontName.toLowerCase()
  const filteredSuggs = fontQuery.length < 1
    ? FONT_SUGGESTIONS
    : FONT_SUGGESTIONS.map(g => ({
        ...g,
        fonts: g.fonts.filter(f => f.toLowerCase().includes(fontQuery)),
      })).filter(g => g.fonts.length > 0)

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Información de la empresa ──────────────────────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Información de la empresa</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Esta información contextualiza las recomendaciones de la IA y personaliza los informes de marketing.
        </p>

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre comercial</label>
            <input
              type="text"
              value={form.companyName}
              onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
              placeholder="Ej: Bliss Marketing"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Industria / Sector</label>
            <select
              value={form.industry}
              onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Seleccionar...</option>
              {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sitio web</label>
            <input
              type="url"
              value={form.companyWebsite}
              onChange={e => setForm(f => ({ ...f, companyWebsite: e.target.value }))}
              placeholder="https://tuempresa.com"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción de la empresa</label>
            <textarea
              value={form.companyDescription}
              onChange={e => setForm(f => ({ ...f, companyDescription: e.target.value }))}
              rows={4}
              placeholder="Describí el rubro, propuesta de valor, públicos objetivos y cualquier contexto relevante para la IA..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">Esta descripción se inyecta en el contexto del coach IA y en los análisis de informes.</p>
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

      {/* ── Paleta de colores ─────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Paleta de colores</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Colores de marca. Se usan en informes y en el contexto de IA para describir la identidad visual.
        </p>

        {/* Colores existentes */}
        {colors.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-6">
            {colors.map((c, idx) => (
              <ColorSwatch
                key={idx}
                color={c}
                onRemove={() => handleRemoveColor(idx)}
                onRename={name => handleUpdateColorName(idx, name)}
              />
            ))}
          </div>
        )}

        {/* Agregar nuevo color */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Color picker */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newColorHex}
                onChange={e => setNewColorHex(e.target.value)}
                className="w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer p-0.5 bg-white dark:bg-gray-700"
                title="Elegir color"
              />
              <input
                type="text"
                value={newColorHex}
                onChange={e => setNewColorHex(e.target.value)}
                placeholder="#000000"
                maxLength={7}
                className="w-24 px-2 py-2 text-xs font-mono rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Nombre opcional */}
          <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre <span className="text-gray-400 font-normal">(opcional)</span></label>
            <input
              type="text"
              value={newColorName}
              onChange={e => setNewColorName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddColor()}
              placeholder="Ej: Primario, Acento..."
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <button
            type="button"
            onClick={handleAddColor}
            disabled={colorSaving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white transition-colors self-end"
          >
            <span className="text-base leading-none">+</span> Agregar color
          </button>
        </div>

        {colorMsg && (
          <p className={`mt-3 text-xs ${colorMsg.startsWith('Error') ? 'text-red-600' : 'text-amber-600'}`}>
            {colorMsg}
          </p>
        )}
      </section>

      {/* ── Tipografía ────────────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Tipografía</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Fuentes de marca por rol. La vista previa carga de Google Fonts si está disponible.
        </p>

        {/* Fuentes existentes */}
        {fonts.length > 0 && (
          <div className="space-y-3 mb-6">
            {fonts.map((f, idx) => (
              <FontRow key={idx} font={f} onRemove={() => handleRemoveFont(idx)} />
            ))}
          </div>
        )}

        {/* Agregar nueva fuente */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Input con autocompletado */}
          <div className="flex flex-col gap-1 flex-1 min-w-[200px] relative" ref={fontInputRef}>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Nombre de la fuente</label>
            <input
              type="text"
              value={newFontName}
              onChange={e => { setNewFontName(e.target.value); setShowFontSugg(true) }}
              onFocus={() => setShowFontSugg(true)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleAddFont() }
                if (e.key === 'Escape') setShowFontSugg(false)
              }}
              placeholder="Ej: Inter, Playfair Display..."
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {showFontSugg && filteredSuggs.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-64 overflow-y-auto">
                {filteredSuggs.map(group => (
                  <div key={group.group}>
                    <p className="px-3 pt-2.5 pb-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                      {group.group}
                    </p>
                    {group.fonts.map(font => (
                      <button
                        key={font}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { setNewFontName(font); setShowFontSugg(false) }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        style={{ fontFamily: `'${font}', sans-serif` }}
                      >
                        {font}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Rol */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Uso</label>
            <select
              value={newFontRole}
              onChange={e => setNewFontRole(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {FONT_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <button
            type="button"
            onClick={handleAddFont}
            disabled={fontSaving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white transition-colors self-end"
          >
            <span className="text-base leading-none">+</span> Agregar fuente
          </button>
        </div>

        {fontMsg && (
          <p className={`mt-3 text-xs ${fontMsg.startsWith('Error') ? 'text-red-600' : 'text-amber-600'}`}>
            {fontMsg}
          </p>
        )}
      </section>

      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Logo</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Se usa en el encabezado de los informes mensuales. PNG, JPG, WEBP o SVG. Máx. 5 MB.
        </p>

        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="flex-shrink-0 w-40 h-24 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain p-2" onError={() => setLogoPreview(null)} />
            ) : (
              <span className="text-xs text-gray-400">Sin logo</span>
            )}
          </div>
          <div className="flex-1 space-y-3">
            <input ref={logoInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.svg" className="hidden" onChange={onLogoChange} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => logoInputRef.current?.click()} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Seleccionar imagen
              </button>
              {logoFile && (
                <button type="button" onClick={uploadLogo} disabled={logoUploading} className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white transition-colors">
                  {logoUploading ? 'Subiendo...' : 'Subir logo'}
                </button>
              )}
              {logoPreview && !logoFile && (
                <button type="button" onClick={deleteLogo} className="px-4 py-2 text-sm font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                  Eliminar
                </button>
              )}
            </div>
            {logoFile && <p className="text-xs text-gray-500">Archivo seleccionado: {logoFile.name}</p>}
            {logoMsg && <p className={`text-xs ${logoMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{logoMsg}</p>}
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
          <div className="w-full h-32 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
            {bannerPreview ? (
              <img src={bannerPreview} alt="Banner" className="w-full h-full object-cover" onError={() => setBannerPreview(null)} />
            ) : (
              <span className="text-xs text-gray-400">Sin banner</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={bannerInputRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden" onChange={onBannerChange} />
            <button type="button" onClick={() => bannerInputRef.current?.click()} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Seleccionar imagen
            </button>
            {bannerFile && (
              <button type="button" onClick={uploadBanner} disabled={bannerUploading} className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white transition-colors">
                {bannerUploading ? 'Subiendo...' : 'Subir banner'}
              </button>
            )}
            {bannerPreview && !bannerFile && (
              <button type="button" onClick={deleteBanner} className="px-4 py-2 text-sm font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
                Eliminar
              </button>
            )}
          </div>
          {bannerFile && <p className="text-xs text-gray-500">Archivo seleccionado: {bannerFile.name}</p>}
          {bannerMsg && <p className={`text-xs ${bannerMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{bannerMsg}</p>}
        </div>
      </section>

    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function ColorSwatch({ color, onRemove, onRename }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(color.name)
  const fg = textOnBg(color.hex)

  function commitRename() {
    setEditing(false)
    if (draft !== color.name) onRename(draft)
  }

  return (
    <div className="flex flex-col items-center gap-1.5 group">
      {/* Swatch */}
      <div
        className="relative w-16 h-16 rounded-xl shadow-sm border border-black/10 flex items-end justify-center pb-1 cursor-default"
        style={{ backgroundColor: color.hex }}
      >
        {/* Botón eliminar */}
        <button
          type="button"
          onClick={onRemove}
          title="Eliminar color"
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-500 hover:text-red-500 dark:hover:text-red-400 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs leading-none"
        >
          ×
        </button>
        {/* Hex label dentro del swatch */}
        <span className="text-[9px] font-mono font-semibold" style={{ color: fg }}>
          {color.hex}
        </span>
      </div>

      {/* Nombre editable */}
      {editing ? (
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(color.name); setEditing(false) } }}
          className="w-16 text-center text-[11px] px-1 py-0.5 rounded border border-primary-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Editar nombre"
          className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 truncate w-16 text-center"
        >
          {color.name || <span className="italic opacity-50">sin nombre</span>}
        </button>
      )}
    </div>
  )
}

function FontRow({ font, onRemove }) {
  const roleLabel = FONT_ROLES.find(r => r.value === font.role)?.label ?? font.role
  const roleClass = ROLE_COLORS[font.role] ?? 'bg-gray-100 text-gray-600'

  // Cargar la fuente al montar
  useEffect(() => { loadGoogleFont(font.name) }, [font.name])

  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40 group">
      {/* Preview */}
      <div className="flex-1 min-w-0">
        <p
          className="text-2xl text-gray-900 dark:text-white leading-tight truncate"
          style={{ fontFamily: `'${font.name}', sans-serif` }}
        >
          Aa — {font.name}
        </p>
        <p
          className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate"
          style={{ fontFamily: `'${font.name}', sans-serif` }}
        >
          ABCDEFGHIJKLMNOPQRSTUVWXYZ · abcdefghijklmnopqrstuvwxyz · 0123456789
        </p>
      </div>

      {/* Rol */}
      <span className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${roleClass}`}>
        {roleLabel}
      </span>

      {/* Eliminar */}
      <button
        type="button"
        onClick={onRemove}
        title="Eliminar fuente"
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  )
}
