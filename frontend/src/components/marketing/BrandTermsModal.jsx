import { useState, useEffect } from 'react'
import api from '../../api/client'
import { X, Tag, AlertTriangle, Plus, Check } from 'lucide-react'
import { Icon } from '../ui/Icon'

function fmtNum(n) {
  if (n == null) return '—'
  return n.toLocaleString('es-AR')
}

// Términos de marca del proyecto. Una búsqueda de marca no es canibalización: no se
// consolida ni se canonicaliza, solo se verifica que gane la URL esperada.
//
// La lista la confirma una persona. El sistema propone a partir de búsquedas REALES de
// Search Console (con sus impresiones) y marca como dudoso lo que podría ser genérico —
// derivar los términos del dominio sería peligroso: "car" está dentro de "mdzrentacar" y
// es la keyword más importante del negocio, y "mdz" es el código del aeropuerto de
// Mendoza, no la marca. Nada se aplica sin apretar Guardar.
export default function BrandTermsModal({ projectId, onClose, onSaved }) {
  const [terms, setTerms] = useState([])
  const [brandUrl, setBrandUrl] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [suggestionsError, setSuggestionsError] = useState(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { data } = await api.get(`/marketing/projects/${projectId}/cannibal/brand-terms?suggest=1`)
        if (cancelled) return
        setTerms(data.terms ?? [])
        setBrandUrl(data.brandUrl ?? '')
        setSuggestions(data.suggestions ?? [])
        setSuggestionsError(data.suggestionsError ?? null)
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error ?? 'No se pudieron cargar los términos')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  const normalized = terms.map(t => t.trim().toLowerCase())

  function add(value) {
    const v = String(value ?? '').trim()
    if (!v || normalized.includes(v.toLowerCase())) return
    setTerms(prev => [...prev, v])
  }

  function remove(idx) {
    setTerms(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const { data } = await api.put(`/marketing/projects/${projectId}/cannibal/brand-terms`, {
        terms,
        brandUrl: brandUrl.trim() || null,
      })
      onSaved?.(data)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error ?? 'Error al guardar')
      setSaving(false)
    }
  }

  const pending = suggestions.filter(s => !normalized.includes(s.term.toLowerCase()))

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Icon as={Tag} size={20} className="text-primary-500" />
            Términos de marca
          </h3>
          <button
            onClick={() => !saving && onClose()}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label="Cerrar"
          >
            <Icon as={X} size={18} />
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Cuando alguien busca el nombre del negocio, que aparezcan dos páginas del sitio no es
          canibalización. Estas búsquedas salen de la lista de conflictos y pasan a una sección
          aparte, donde solo se verifica que gane la URL esperada.
        </p>

        {loading ? (
          <p className="text-sm text-gray-400 py-6 text-center">Cargando…</p>
        ) : (
          <>
            {/* Confirmados */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Confirmados ({terms.length})
              </p>
              {terms.length === 0 ? (
                <p className="text-xs text-gray-400 italic mb-2">
                  Ninguno todavía: ninguna búsqueda se está tratando como de marca.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {terms.map((t, i) => (
                    <span
                      key={`${t}-${i}`}
                      className="inline-flex items-center gap-1 text-xs bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800 rounded-lg pl-2 pr-1 py-1"
                    >
                      {t}
                      <button
                        onClick={() => remove(i)}
                        className="text-primary-400 hover:text-red-500 p-0.5"
                        aria-label={`Quitar ${t}`}
                      >
                        <Icon as={X} size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(draft); setDraft('') } }}
                  placeholder="Agregar a mano, ej. mdz rent a car"
                  className="flex-1 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-700 dark:text-gray-200"
                />
                <button
                  onClick={() => { add(draft); setDraft('') }}
                  className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 inline-flex items-center gap-1"
                >
                  <Icon as={Plus} size={14} /> Agregar
                </button>
              </div>
            </div>

            {/* Sugerencias desde Search Console */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Sugerencias desde Search Console
              </p>
              {suggestionsError ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">{suggestionsError}</p>
              ) : pending.length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  Sin sugerencias nuevas. Se buscan las búsquedas de los últimos 90 días que
                  contienen el nombre del negocio.
                </p>
              ) : (
                <ul className="space-y-1">
                  {pending.map(s => (
                    <li
                      key={s.term}
                      className="flex items-center gap-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5"
                    >
                      <button
                        onClick={() => add(s.term)}
                        title="Confirmar como término de marca"
                        className="flex-shrink-0 text-gray-400 hover:text-green-600 dark:hover:text-green-400 border border-gray-200 dark:border-gray-600 hover:border-green-400 rounded-md p-0.5"
                      >
                        <Icon as={Check} size={13} />
                      </button>
                      <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">{s.term}</span>
                      {s.doubtful && (
                        <span
                          title={s.reason}
                          className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                        >
                          <Icon as={AlertTriangle} size={11} /> dudoso
                        </span>
                      )}
                      <span className="flex-shrink-0 text-[11px] text-gray-400">{fmtNum(s.impressions)} imp.</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-gray-400 mt-2">
                Las marcadas como dudosas son de una sola palabra que también se usa como búsqueda
                genérica o de ciudad: confirmalas solo si de verdad son tu marca. Nada se aplica
                hasta que guardes.
              </p>
            </div>

            {/* URL esperada */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                URL que debe ganar las búsquedas de marca
              </label>
              <input
                value={brandUrl}
                onChange={e => setBrandUrl(e.target.value)}
                placeholder="https://… (vacío = la home del sitio)"
                className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-700 dark:text-gray-200"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Si en una búsqueda de marca gana otra página, se avisa. No se recomienda redirigir
                ni canonicalizar: la acción es que la página correcta sea la que responde.
              </p>
            </div>

            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => !saving && onClose()}
                className="px-4 py-2 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
