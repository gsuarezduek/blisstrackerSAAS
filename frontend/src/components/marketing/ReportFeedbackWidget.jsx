import { useState, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

// Contraste: elige texto blanco o negro según la luminancia del color de marca.
function readableOn(hex) {
  try {
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return lum > 0.6 ? '#111827' : '#ffffff'
  } catch { return '#ffffff' }
}

function Star({ filled, onClick, onEnter, onLeave }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="p-1 transition-transform hover:scale-110 focus:outline-none"
      aria-label="Calificar"
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill={filled ? '#f59e0b' : 'none'} stroke={filled ? '#f59e0b' : '#cbd5e1'} strokeWidth="1.6" strokeLinejoin="round">
        <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.1 6.47L12 17.9l-5.8 3.06 1.1-6.47L2.6 9.35l6.5-.95L12 2.5z" />
      </svg>
    </button>
  )
}

/**
 * Botón flotante de feedback para el informe público del cliente.
 * Al hacer click: nombre + calificación 1–5 estrellas + comentario.
 */
export default function ReportFeedbackWidget({ token, brandPrimary = '#f97316', agencyName }) {
  const [open, setOpen]       = useState(false)
  const [sent, setSent]       = useState(false)
  const [name, setName]       = useState('')
  const [rating, setRating]   = useState(0)
  const [hover, setHover]     = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  const storeKey = `bliss_report_feedback_${token}`

  useEffect(() => {
    try { if (localStorage.getItem(storeKey)) setSent(true) } catch { /* ignore */ }
  }, [storeKey])

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const fg = readableOn(brandPrimary)

  async function submit() {
    if (rating < 1) { setError('Elegí de 1 a 5 estrellas.'); return }
    setSaving(true)
    setError(null)
    try {
      await axios.post(`${API}/api/public/report/${token}/feedback`, {
        name: name.trim() || undefined,
        rating,
        comment: comment.trim() || undefined,
      })
      try { localStorage.setItem(storeKey, '1') } catch { /* ignore */ }
      setSent(true)
      setTimeout(() => setOpen(false), 1600)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar. Reintentá en un momento.')
    } finally {
      setSaving(false)
    }
  }

  const active = hover || rating
  const RATING_LABELS = ['', 'Muy malo', 'Malo', 'Correcto', 'Muy bueno', 'Excelente']

  return (
    <>
      {/* ── Botón flotante ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="no-print fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full pl-3.5 pr-4 py-3 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 active:translate-y-0"
          style={{ backgroundColor: brandPrimary, color: fg }}
          aria-label="Dejar tu opinión sobre el informe"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          <span className="text-sm font-semibold">{sent ? '¡Gracias!' : 'Tu opinión'}</span>
        </button>
      )}

      {/* ── Modal ── */}
      {open && (
        <div
          className="no-print fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-[fadeInUp_0.2s_ease-out]">
            <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>

            {/* barra de marca */}
            <div className="h-1.5" style={{ backgroundColor: brandPrimary }} />

            {sent ? (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto mb-3 w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: `${brandPrimary}22` }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={brandPrimary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </div>
                <p className="text-lg font-semibold text-gray-900">¡Gracias por tu opinión!</p>
                <p className="text-sm text-gray-500 mt-1">Nos ayuda a mejorar cada informe.</p>
              </div>
            ) : (
              <div className="px-6 pt-5 pb-6">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="text-lg font-bold text-gray-900">¿Qué te pareció el informe?</h3>
                  <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none -mt-1">×</button>
                </div>
                <p className="text-sm text-gray-500 mb-4">Tu devolución llega directo{agencyName ? ` a ${agencyName}` : ''}.</p>

                {/* Estrellas */}
                <div className="flex flex-col items-center mb-4">
                  <div className="flex" onMouseLeave={() => setHover(0)}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star
                        key={n}
                        filled={n <= active}
                        onClick={() => setRating(n)}
                        onEnter={() => setHover(n)}
                        onLeave={() => {}}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium h-4 mt-0.5" style={{ color: active ? brandPrimary : '#9ca3af' }}>
                    {RATING_LABELS[active] || 'Tocá una estrella'}
                  </span>
                </div>

                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Tu nombre (opcional)"
                  className="w-full mb-2.5 px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:border-gray-400 focus:ring-0 outline-none text-gray-800 placeholder-gray-400"
                />
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="¿Algo para destacar o mejorar? (opcional)"
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 focus:border-gray-400 focus:ring-0 outline-none text-gray-800 placeholder-gray-400 resize-none"
                />

                {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

                <button
                  onClick={submit}
                  disabled={saving}
                  className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60"
                  style={{ backgroundColor: brandPrimary, color: fg }}
                >
                  {saving ? 'Enviando…' : 'Enviar opinión'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
