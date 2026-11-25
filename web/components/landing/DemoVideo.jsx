'use client'

import { useState } from 'react'
import { trackEvent } from '@/lib/analytics'

// El marco es el mismo para la miniatura y para el iframe, así el play no mueve nada.
const DEMO_FRAME = 'relative aspect-video w-full rounded-2xl overflow-hidden shadow-2xl shadow-gray-300 border border-gray-200'

// Acepta la URL de embed que pide el panel y también la de compartir: un link de
// YouTube mal pegado desde SuperAdmin se muestra igual en vez de quedar en blanco.
const YOUTUBE_ID = /(?:youtube(?:-nocookie)?\.com\/(?:embed|shorts|live|v)\/|youtu\.be\/|[?&]v=)([A-Za-z0-9_-]{11})/

// { id, src } si es un video de YouTube; null para cualquier otro proveedor.
export function parseYoutube(url) {
  const id = typeof url === 'string' ? url.match(YOUTUBE_ID)?.[1] : null
  if (!id) return null
  // Una URL que ya era de embed se respeta tal cual —su host (youtube-nocookie es una
  // decisión de privacidad, no un detalle) y sus parámetros (`start`, `cc_lang_pref`…)—;
  // de una de /watch sólo sirve el id.
  const base = url.includes('/embed/') ? url.split('#')[0] : `https://www.youtube.com/embed/${id}`
  return { id, src: `${base}${base.includes('?') ? '&' : '?'}autoplay=1` }
}

/**
 * Miniatura + botón de play, y el iframe recién al click (patrón "facade"): el
 * reproductor de YouTube descarga ~1 MB de JS en CADA visita aunque nadie le dé play,
 * y eso lo paga el LCP. Sólo aplica a YouTube: de Loom —el otro proveedor que acepta el
 * panel— no se puede derivar la miniatura sin otra llamada de red.
 */
export default function DemoVideo({ url }) {
  const yt = parseYoutube(url)
  const [playing, setPlaying] = useState(false)
  // maxres no existe en videos viejos o de baja resolución (404) → hq, que siempre está.
  const [thumb, setThumb] = useState('maxresdefault')

  if (!yt || playing) {
    return (
      <div className={DEMO_FRAME}>
        <iframe
          src={playing ? yt.src : url}
          title="Demo de BlissTracker"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setPlaying(true)
        // `landing_cta_click` y no un nombre nuevo: la allowlist de
        // events.controller.js descarta en silencio lo que no conoce, y así el play
        // queda en la misma serie que el "Ver demo" que scrollea hasta acá.
        trackEvent('landing_cta_click', { location: 'hero_demo_play' })
      }}
      aria-label="Reproducir el video de demo"
      className={`${DEMO_FRAME} block group cursor-pointer`}
    >
      <img
        src={`https://i.ytimg.com/vi/${yt.id}/${thumb}.jpg`}
        alt=""
        width={1280}
        height={720}
        onError={() => setThumb(t => (t === 'maxresdefault' ? 'hqdefault' : t))}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <span className="absolute inset-0 bg-gray-900/20 group-hover:bg-gray-900/10 transition-colors" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary-500 text-white shadow-xl group-hover:scale-105 transition-transform">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 sm:w-8 sm:h-8 ml-1">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
    </button>
  )
}
