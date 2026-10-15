/**
 * Carrusel genérico "ventana deslizante": siempre muestra `perView` items,
 * y correr a la derecha/izquierda trae el siguiente/anterior de a uno.
 * `perView` es responsive ({ base, sm, md, lg, xl }, mismos breakpoints que
 * Tailwind) — si hay menos items que el `perView` resuelto, se comporta como
 * una grilla estática (sin flechas ni puntos).
 *
 * Usado por TestimonialsSection (testimonios) y SegmentCards (módulos).
 */
import { useState, useEffect, useMemo } from 'react'

const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 }

function computePerView(width, map) {
  let result = map.base ?? 1
  for (const key of ['sm', 'md', 'lg', 'xl']) {
    if (map[key] != null && width >= BREAKPOINTS[key]) result = map[key]
  }
  return result
}

function useResponsivePerView(map) {
  const [perView, setPerView] = useState(() =>
    computePerView(typeof window !== 'undefined' ? window.innerWidth : BREAKPOINTS.lg, map)
  )
  useEffect(() => {
    const onResize = () => setPerView(computePerView(window.innerWidth, map))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(map)])
  return perView
}

export default function Carousel({ items, perView, keyFn = (item, i) => item.id ?? i, renderItem }) {
  const perViewMap = useMemo(() => perView, [JSON.stringify(perView)])
  const perViewResolved = useResponsivePerView(perViewMap)
  const [index, setIndex] = useState(0)

  const maxIndex = Math.max(0, items.length - perViewResolved)

  useEffect(() => {
    setIndex(i => Math.min(i, maxIndex))
  }, [maxIndex])

  if (items.length === 0) return null
  const showControls = items.length > perViewResolved

  return (
    <div className="relative">
      <div className="overflow-hidden -mx-3">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * (100 / perViewResolved)}%)` }}
        >
          {items.map((item, i) => (
            <div
              key={keyFn(item, i)}
              className="shrink-0 box-border px-3 flex"
              style={{ width: `${100 / perViewResolved}%` }}
            >
              {renderItem(item, i)}
            </div>
          ))}
        </div>
      </div>

      {showControls && (
        <>
          <button
            type="button"
            onClick={() => setIndex(i => Math.max(0, i - 1))}
            disabled={index === 0}
            aria-label="Ver anteriores"
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 sm:-translate-x-4 w-9 h-9 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-500 hover:text-gray-900 hover:border-gray-300 disabled:opacity-0 disabled:pointer-events-none transition-all z-10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setIndex(i => Math.min(maxIndex, i + 1))}
            disabled={index >= maxIndex}
            aria-label="Ver siguientes"
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 sm:translate-x-4 w-9 h-9 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-500 hover:text-gray-900 hover:border-gray-300 disabled:opacity-0 disabled:pointer-events-none transition-all z-10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          <div className="flex justify-center gap-1.5 mt-6">
            {Array.from({ length: maxIndex + 1 }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ir a la página ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-primary-500' : 'w-1.5 bg-gray-300 hover:bg-gray-400'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
