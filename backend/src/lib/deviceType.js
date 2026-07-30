// Clasifica el header User-Agent de un login en un tipo de dispositivo, para mostrar
// un ícono (celular/tablet/compu) en el historial de ingresos de RRHH. Heurística simple
// por regex, sin dependencias: alcanza para distinguir los casos reales (navegador de
// escritorio vs. app/navegador móvil) sin necesitar una librería de UA parsing.

// Android sin "Mobile" en el UA = tablet (los Android phone sí llevan "Mobile").
function deviceTypeFromUA(userAgent) {
  if (!userAgent) return null
  if (/iPad/i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))) return 'tablet'
  if (/Mobi|Android|iPhone|iPod|Windows Phone|BlackBerry/i.test(userAgent)) return 'mobile'
  return 'desktop'
}

module.exports = { deviceTypeFromUA }
