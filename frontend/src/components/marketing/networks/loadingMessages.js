// Frases para FunLoader en pantallas de Marketing que suelen demorar.

// Pool genérico reusado por Instagram y el resto de redes/Ads — las frases con
// {{NETWORK}} se adaptan al nombre de cada integración (ver forNetwork), el
// resto queda igual para todas.
const BASE_LOADING_MESSAGES = [
  '{{NETWORK}} tiene los datos. Compartirlos ya es otro tema.',
  '{{NETWORK}} tiene muchos datos. Estamos buscando los interesantes.',
  'Negociando con el algoritmo… deséanos suerte.',
  'El algoritmo no nos lo pone fácil, pero estamos en ello.',
  'Estamos convenciendo a {{NETWORK}} de que nos cuente sus secretos…',
  'Mientras cargan los datos, podés fingir que estás trabajando.',
  'Paciencia, joven Padawan del marketing.',
  'Esto está tardando más que la aprobación de un diseño por parte del cliente.',
  'No te vayas, lo bueno está por llegar.',
  'Si mirás fijamente la pantalla, carga más rápido.',
  'El universo tiene 13.800 millones de años y vos no podés esperar unos segundos más.',
  'Conexión establecida: nadie sabe cómo, pero lo logramos.',
  'Descifrando el algoritmo… o al menos intentándolo.',
  'Contando tus likes. Uno por uno… mentira, tenemos una API.',
  'Analizando tus números. No te preocupes, no juzgamos.',
  'Un café tarda más. Bueno, depende del café.',
  'Buscando una explicación lógica para el algoritmo. Volvemos en unos años.',
  'Hay dos certezas en la vida: los impuestos y que {{NETWORK}} cambie el algoritmo.',
  'Un gráfico ascendente siempre queda bien en una presentación.',
  'Si elegís bien las métricas, cualquier mes puede ser un éxito.',
  'Más seguidores no significa más clientes. Pero queda lindo en el informe.',
  'El engagement está bajo. La autoestima del community manager, también.',
  'Estamos buscando ese KPI que haga que todo parezca una buena idea.',
  'El informe está casi listo. Solo falta que los resultados acompañen.',
  'El presupuesto era limitado. Las expectativas, infinitas.',
  'Necesitamos algo viral. El presupuesto es de 5 dólares.',
  'Publicar es fácil. Explicar por qué no funcionó es otra habilidad.',
  'La publicación quedó espectacular. La audiencia no se enteró.',
  'El calendario de contenidos está listo. Ahora falta que el mundo coopere.',
  'Si el gráfico sube, fue la estrategia. Si baja, fue el algoritmo.',
]

function forNetwork(name) {
  return BASE_LOADING_MESSAGES.map(m => m.replaceAll('{{NETWORK}}', name))
}

export const INSTAGRAM_LOADING_MESSAGES  = forNetwork('Instagram')
export const FACEBOOK_LOADING_MESSAGES   = forNetwork('Facebook')
export const LINKEDIN_LOADING_MESSAGES   = forNetwork('LinkedIn')
export const TIKTOK_LOADING_MESSAGES     = forNetwork('TikTok')
export const YOUTUBE_LOADING_MESSAGES    = forNetwork('YouTube')
export const META_ADS_LOADING_MESSAGES   = forNetwork('Meta')
export const GOOGLE_ADS_LOADING_MESSAGES = forNetwork('Google Ads')

// Frases por sección de Análisis con IA (Marketing → GEO/SEO/Web) — cada lista
// está adaptada al contexto puntual de esa pantalla, no son intercambiables.

export const CANNIBALIZATION_LOADING_MESSAGES = [
  'Buscando páginas de tu sitio peleándose por la misma keyword.',
  'A veces el peor competidor de una página... es otra página tuya.',
  'Cruzando datos de Search Console. Son muchos clics para contar.',
  'Viendo quién le gana a quién dentro de tu propio sitio.',
  'Detectando canibalización. No, no tiene nada que ver con Survivor.',
  'El algoritmo de Google también se confunde con URLs parecidas.',
  'Ordenando qué página debería rankear… y cuál se está robando el lugar.',
  'Esto tarda porque las keywords no se ordenan solas.',
]

export const PAGESPEED_LOADING_MESSAGES = [
  'Lighthouse está corriendo. Literal, es una luz que corre.',
  'Midiendo cuánto tarda tu sitio… mientras esto también tarda. Irónico.',
  'Analizando mobile y desktop. El doble de paciencia, por favor.',
  'Google está juzgando tu sitio. Con cariño, pero juzgando.',
  'Esperando el puntaje de performance. Ojalá no sea rojo.',
  'Calculando Core Web Vitals. Suena a superhéroe, no lo es.',
  'Esto es más lento de lo que debería ser tu sitio. Las ironías de la vida.',
]

export const WEB_AI_LOADING_MESSAGES = [
  'Leyendo tus números de Analytics. No todos son buenas noticias.',
  'La IA está armando el análisis. Le gusta pensarlo bien.',
  'Buscando una tendencia positiva en tus sesiones. Esperamos encontrarla.',
  'Explicando por qué bajó el tráfico. Spoiler: casi nunca es culpa nuestra.',
  'Convirtiendo números de Analytics en una historia con sentido.',
  'Armando el resumen ejecutivo que nadie va a leer completo.',
  'Cruzando sesiones, conversiones y algo de esperanza.',
]

export const GEO_GENERATE_LOADING_MESSAGES = [
  'Redactando el archivo para que las IAs lo entiendan.',
  'Esto lo escribe una IA. Ojalá tenga buena ortografía.',
  'Armando el código. Suena más complicado de lo que es.',
  'Traduciendo tu sitio a un idioma que entienden las máquinas.',
  'Ya casi. Las IAs son lentas para leer, rápidas para opinar.',
]
