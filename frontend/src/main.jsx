import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import './index.css'

// Red de seguridad global: Vite emite `vite:preloadError` cuando falla precargar un
// módulo (chunk con hash viejo que ya no existe tras un deploy). Recargamos una vez
// para tomar el build nuevo. Comparte el guard `chunkReloadAt` con lazyWithReload
// (App.jsx) para no recargar dos veces.
window.addEventListener('vite:preloadError', () => {
  const KEY  = 'chunkReloadAt'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last > 10000) {
    sessionStorage.setItem(KEY, String(Date.now()))
    window.location.reload()
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>
)
