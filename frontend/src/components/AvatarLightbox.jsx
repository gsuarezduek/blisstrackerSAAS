import { useEffect } from 'react'
import { avatarUrl } from '../utils/avatarUrl'

/**
 * Dos modos:
 * - Simple (UserTasksModal): src + alt + onClose
 * - Navegable (MyProfile): avatars[{file,label}] + index + onNavigate + onClose
 */
export default function AvatarLightbox({ src, alt, onClose, avatars, index, onNavigate }) {
  const hasNav = Array.isArray(avatars) && avatars.length > 0 && onNavigate

  const current = hasNav ? avatars[index] : null
  const imgSrc  = hasNav ? avatarUrl(current.file) : src
  const imgAlt  = hasNav ? current.label : alt

  function prev() { onNavigate((index - 1 + avatars.length) % avatars.length) }
  function next() { onNavigate((index + 1) % avatars.length) }

  useEffect(() => {
    if (!hasNav) return
    function onKey(e) {
      if (e.key === 'ArrowLeft')  prev()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'Escape')     onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Nombre de la abeja */}
      {hasNav && (
        <p className="text-white text-lg font-semibold mb-5 tracking-wide select-none" onClick={e => e.stopPropagation()}>
          {current.label}
        </p>
      )}

      <div className="flex items-center gap-6" onClick={e => e.stopPropagation()}>
        {/* Botón anterior */}
        {hasNav && (
          <button
            onClick={prev}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
            </svg>
          </button>
        )}

        {/* Imagen */}
        <img
          src={imgSrc}
          alt={imgAlt}
          className="w-56 h-56 rounded-full object-cover shadow-2xl ring-4 ring-white/20"
        />

        {/* Botón siguiente */}
        {hasNav && (
          <button
            onClick={next}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      {/* Dots de posición */}
      {hasNav && (
        <div className="flex gap-1.5 mt-6" onClick={e => e.stopPropagation()}>
          {avatars.map((_, i) => (
            <button
              key={i}
              onClick={() => onNavigate(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === index ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      )}

      {/* Cerrar */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  )
}
