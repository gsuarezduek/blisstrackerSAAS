import { useState, useEffect } from 'react'
import api from '../../../api/client'
import { fmtNum, countryLabel } from './keywordsHelpers'

// ─── Modal "Agregar keywords" ─────────────────────────────────────────────────

export default function SuggestModal({ projectId, country, onClose, onAdded }) {
  const [manualInput,  setManualInput]  = useState('')
  const [manualError,  setManualError]  = useState('')
  const [addingManual, setAddingManual] = useState(false)

  const [suggestions,  setSuggestions]  = useState([])
  const [suggestLoad,  setSuggestLoad]  = useState(true)
  const [suggestError, setSuggestError] = useState('')
  const [selected,     setSelected]     = useState(new Set())
  const [saving,       setSaving]       = useState(false)

  useEffect(() => {
    const params = country && country !== 'arg' ? `?country=${country}` : ''
    api.get(`/marketing/projects/${projectId}/keywords/suggest${params}`)
      .then(r => setSuggestions(r.data.queries ?? []))
      .catch(err => {
        // Si GSC no está conectado o no hay datos, no es error crítico — la entrada manual sigue disponible
        const msg = err.response?.data?.error ?? ''
        if (!msg.toLowerCase().includes('no conectado') && !msg.toLowerCase().includes('no integration')) {
          setSuggestError(msg || 'No se pudieron cargar sugerencias de Search Console.')
        }
      })
      .finally(() => setSuggestLoad(false))
  }, [projectId, country])

  async function handleAddManual(e) {
    e.preventDefault()
    const query = manualInput.trim().toLowerCase()
    if (!query) return
    setManualError('')
    setAddingManual(true)
    try {
      await api.post(`/marketing/projects/${projectId}/keywords`, { query })
      onAdded()
      setManualInput('')
      // Marcar como ya rastreada en las sugerencias si aparece
      setSuggestions(prev => prev.map(s =>
        s.query.toLowerCase() === query ? { ...s, alreadyTracked: true } : s
      ))
    } catch (err) {
      setManualError(err.response?.data?.error ?? 'Error al agregar la keyword')
    } finally {
      setAddingManual(false)
    }
  }

  function toggleSelect(query) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(query) ? next.delete(query) : next.add(query)
      return next
    })
  }

  async function handleAddSelected() {
    if (!selected.size) return
    setSaving(true)
    try {
      await Promise.all(
        [...selected].map(query => api.post(`/marketing/projects/${projectId}/keywords`, { query }))
      )
      onAdded()
      setSelected(new Set())
      setSuggestions(prev => prev.map(s =>
        selected.has(s.query) ? { ...s, alreadyTracked: true } : s
      ))
    } catch (err) {
      setSuggestError(err.response?.data?.error ?? 'Error al agregar keywords')
    } finally {
      setSaving(false)
    }
  }

  const availableSuggestions = suggestions.filter(s => !s.alreadyTracked)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Agregar keywords</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── Entrada manual ────────────────────────────────────────────── */}
          <div className="px-5 pt-4 pb-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Agregar manualmente
            </p>
            <form onSubmit={handleAddManual} className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={manualInput}
                onChange={e => { setManualInput(e.target.value); setManualError('') }}
                placeholder="ej: agencia de marketing digital"
                className="flex-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                type="submit"
                disabled={!manualInput.trim() || addingManual}
                className="px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                {addingManual ? '…' : '+ Agregar'}
              </button>
            </form>
            {manualError && (
              <p className="text-xs text-red-500 mt-1.5">{manualError}</p>
            )}
          </div>

          {/* ── Sugerencias desde GSC ─────────────────────────────────────── */}
          <div className="px-5 pb-3">
            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
              <p className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                O elegí desde Search Console
                {country && <span className="ml-1">· {countryLabel(country)}</span>}
              </p>
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
            </div>

            {suggestLoad && (
              <div className="flex items-center justify-center py-6">
                <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!suggestLoad && suggestError && (
              <p className="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">{suggestError}</p>
            )}

            {!suggestLoad && !suggestError && suggestions.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 py-2 text-center">
                No hay datos disponibles en Search Console para este mes.
              </p>
            )}

            {!suggestLoad && suggestions.length > 0 && (() => {
              const maxOpp = Math.max(...availableSuggestions.map(s => s.impressions / Math.max(s.position, 1)), 1)
              const withOpp = suggestions
                .map(s => ({ ...s, opp: s.impressions / Math.max(s.position, 1) }))
                .sort((a, b) => b.opp - a.opp)

              return withOpp.map(s => {
                const score    = (s.opp / maxOpp)
                const oppBadge = !s.alreadyTracked
                  ? score > 0.6 ? { label: 'Alta oportunidad', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' }
                  : score > 0.3 ? { label: 'Media',            cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' }
                  : null
                  : null

                return (
                  <label
                    key={s.query}
                    className={`flex items-center gap-3 py-2.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${s.alreadyTracked ? 'opacity-40 cursor-default' : ''}`}
                  >
                    <input
                      type="checkbox"
                      disabled={s.alreadyTracked}
                      checked={s.alreadyTracked || selected.has(s.query)}
                      onChange={() => !s.alreadyTracked && toggleSelect(s.query)}
                      className="accent-primary-600 w-3.5 h-3.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{s.query}</p>
                      <p className="text-xs text-gray-400">{fmtNum(s.impressions)} impres. · pos. {s.position.toFixed(1)}</p>
                    </div>
                    {oppBadge && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${oppBadge.cls}`}>
                        {oppBadge.label}
                      </span>
                    )}
                    {s.alreadyTracked && (
                      <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full shrink-0">
                        Rastreada
                      </span>
                    )}
                  </label>
                )
              })
            })()}
          </div>
        </div>

        {/* Footer — solo si hay selección de GSC */}
        {selected.size > 0 && (
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400">{selected.size} seleccionada{selected.size !== 1 ? 's' : ''} de GSC</p>
            <button
              onClick={handleAddSelected}
              disabled={saving}
              className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
            >
              {saving ? 'Agregando…' : `Agregar (${selected.size})`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
