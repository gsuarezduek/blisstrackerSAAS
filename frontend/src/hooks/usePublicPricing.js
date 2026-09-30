import { useState, useEffect } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || ''

// Fallback si el fetch falla — mismos valores que el default en
// backend/src/config/platformSettings.js, para que Landing/Pricing nunca
// queden sin números aunque el backend esté caído.
const FALLBACK = {
  pricingTiers:  [{ upTo: 19, pricePerSeat: 3 }, { upTo: null, pricePerSeat: 2 }],
  freeSeatLimit: 3,
  trialDays:     14,
}

// Público, sin auth — mismo criterio que Blog.jsx: axios crudo contra
// VITE_API_URL, no el client autenticado (Landing/Pricing no tienen
// workspace). Module-level cache: un solo fetch por sesión de página.
let cache = null
let cachePromise = null

export default function usePublicPricing() {
  const [pricing, setPricing] = useState(cache || FALLBACK)

  useEffect(() => {
    if (cache) return
    if (!cachePromise) {
      cachePromise = axios.get(`${API}/api/public/pricing`).then(r => {
        cache = r.data
        return r.data
      }).catch(() => { cachePromise = null; return null })
    }
    cachePromise.then(data => { if (data) setPricing(data) }).catch(() => {})
  }, [])

  return pricing
}
