import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import useNavDestinations from '../hooks/useNavDestinations'

// Buscador global (Cmd/Ctrl+K) — navegación estática (fuzzy-match client-side
// contra useNavDestinations) + búsqueda de leads de Ventas (el único endpoint de
// entidad que ya soporta `?search=` tal cual). Proyectos/canales de chat quedan
// para una v2 (requieren `?search=` server-side nuevo). Overlay/backdrop calcado
// del modal de ayuda de GlobalShortcuts.jsx.
function scoreMatch(label, q) {
  const idx = label.toLowerCase().indexOf(q)
  return idx === -1 ? null : idx
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const destinations = useNavDestinations()
  const { enabled: ventasEnabled } = useFeatureFlag('ventas')
  const canSeeLeads = ventasEnabled && (user?.isAdmin || user?.isSales)

  const [query, setQuery] = useState('')
  const [leadResults, setLeadResults] = useState(null) // null = sin buscar todavía
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setLeadResults(null)
    setSelected(0)
    // Foco al abrir — un pequeño timeout para que el input ya esté montado.
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  const navMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return destinations
      .map(d => ({ ...d, type: 'nav', score: scoreMatch(d.label, q) }))
      .filter(d => d.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 8)
  }, [destinations, query])

  // Búsqueda de leads — debounce 300ms, descarta respuestas obsoletas (mismo
  // patrón que el buscador de archivos de proyecto, ProjectFiles.jsx).
  useEffect(() => {
    if (!open || !canSeeLeads) return
    const q = query.trim()
    if (!q) { setLeadResults(null); setSearching(false); return }
    let active = true
    setSearching(true)
    const t = setTimeout(() => {
      api.get(`/ventas/leads?search=${encodeURIComponent(q)}`)
        .then(({ data }) => { if (active) setLeadResults((data.leads || []).slice(0, 5)) })
        .catch(() => { if (active) setLeadResults([]) })
        .finally(() => { if (active) setSearching(false) })
    }, 300)
    return () => { active = false; clearTimeout(t) }
  }, [query, open, canSeeLeads])

  const leadItems = (leadResults || []).map(l => ({
    type: 'lead',
    id: `lead-${l.id}`,
    label: l.title,
    detail: l.company?.name || null,
    to: user?.isAdmin ? `/admin/ventas?lead=${l.id}` : `/ventas?lead=${l.id}`,
  }))

  const results = [...navMatches, ...leadItems]

  function go(item) {
    if (!item) return
    onClose()
    navigate(item.to)
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); go(results[selected]); return }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-[60] p-4 pt-[10vh]" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <span className="text-gray-400">🔎</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={onKeyDown}
            placeholder="Ir a… o buscar un lead"
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400"
          />
          {searching && <span className="text-xs text-gray-400">Buscando…</span>}
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1.5">
          {!query.trim() ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Escribí para ir a una pantalla{canSeeLeads ? ' o buscar un lead' : ''}.</p>
          ) : results.length === 0 && !searching ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Sin resultados para "{query}".</p>
          ) : (
            results.map((item, i) => (
              <button
                key={item.id || item.to}
                onClick={() => go(item)}
                onMouseEnter={() => setSelected(i)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                  selected === i ? 'bg-primary-50 dark:bg-primary-900/30' : ''
                }`}
              >
                <span className="text-gray-800 dark:text-gray-100 truncate">
                  {item.type === 'lead' && <span className="text-gray-400 mr-1.5">Lead ·</span>}
                  {item.label}
                </span>
                {item.detail && <span className="text-xs text-gray-400 flex-shrink-0 truncate max-w-[40%]">{item.detail}</span>}
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-3">
          <span>↑↓ navegar</span>
          <span>↵ ir</span>
          <span>Esc cerrar</span>
        </div>
      </div>
    </div>
  )
}
