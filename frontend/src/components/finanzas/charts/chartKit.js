import { useEffect, useRef, useState } from 'react'

// Piezas compartidas por los gráficos de Finanzas (facturado vs. cobrado,
// antigüedad de saldos, evolución del disponible). Sin librería de gráficos:
// divs y SVG a mano, como el resto del módulo.
//
// Colores: validados con el validador de la guía de visualización contra las
// superficies reales de las tarjetas (blanco en claro, gray-800 #1f2937 en
// oscuro) — modo oscuro con sus propios pasos, no una inversión automática.
// Las clases tienen que quedar escritas enteras para que Tailwind las genere.

// Dos series categóricas (slot 1 azul, slot 2 naranja): CVD ΔE ≥ 24, contraste ≥ 3:1 en los dos modos.
export const SERIES_FILL = {
  blue:   'bg-[#2a78d6] dark:bg-[#3987e5]',
  orange: 'bg-[#eb6834] dark:bg-[#d95926]',
}

// Rampa ordinal de un solo tono (azul) para tramos ordenados, de menos a más
// grave. En claro se oscurece con la gravedad; en oscuro se aclara (más
// contraste = más peso). Pasa monotonía, saltos ≥ 0.06 y el extremo ≥ 2:1.
export const ORDINAL_FILL = [
  'bg-[#86b6ef] dark:bg-[#256abf]',
  'bg-[#5598e7] dark:bg-[#3987e5]',
  'bg-[#2a78d6] dark:bg-[#6da7ec]',
  'bg-[#1c5cab] dark:bg-[#9ec5f4]',
  'bg-[#104281] dark:bg-[#cde2fb]',
]

// Línea (SVG): trazo y lavado del área en el color de la serie.
export const LINE_STROKE = 'stroke-[#2a78d6] dark:stroke-[#3987e5]'
export const LINE_FILL = 'fill-[#2a78d6] dark:fill-[#3987e5]'

const CURRENCY_PREFIX = { ARS: '$ ', USD: 'US$ ', BTC: '₿ ' }

// Monto compacto para ejes y etiquetas chicas: "$ 1,2 M", "US$ 15 mil".
export function fmtCompactMoney(amount, currency = 'ARS') {
  const n = Number(amount) || 0
  const prefix = CURRENCY_PREFIX[currency] ?? `${currency} `
  if (currency === 'BTC') return `${prefix}${n.toLocaleString('es-AR', { maximumFractionDigits: 4 })}`
  return `${prefix}${new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
// "2026-11" → "Nov 26"
export function shortMonth(key) {
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`
}

// Escala "linda" para el eje Y: límites redondos que contienen [min, max] y
// sus marcas (≈ `count` intervalos). Incluye siempre el 0.
export function niceScale(min, max, count = 4) {
  let lo = Math.min(0, min)
  let hi = Math.max(0, max)
  if (lo === hi) hi = lo + 1
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw)
  lo = Math.floor(lo / step) * step
  hi = Math.ceil(hi / step) * step
  const ticks = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step)
  return { min: lo, max: hi, ticks }
}

// Ancho real del contenedor (para dibujar el SVG en píxeles y no estirarlo).
export function useElementWidth(fallback = 600) {
  const ref = useRef(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width)
      if (w > 0) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}
