// Copia del CONTENT_DEFAULTS de la landing de la SPA, que a su vez refleja el del
// backend (backend/src/controllers/landing.controller.js). Se usa como respaldo si
// /api/landing/content no contesta durante el build o la revalidación: la landing
// nunca se publica vacía. Si cambia el copy por default, cambia en los tres lados.
export const CONTENT_DEFAULTS = {
  heroBadge:            'Hecho para agencias de marketing · Gratis hasta 3 usuarios',
  heroTitle:            'El sistema operativo',
  heroTitleAccentWords: ['agencia', 'negocio', 'equipo', 'empresa'],
  heroSubtitle:         'Tareas con foco real, visibilidad de tu equipo en vivo, e informes automáticos — más los módulos que tu agencia necesite: marketing, EOS, ventas.',
  demoVideoUrl:         null,

  problemTitle:    'Tu agencia merece dejar de hacer esto.',
  problemSubtitle: 'El equipo trabaja, pero una parte importante de su tiempo y energía se pierde en la propia gestión del trabajo.',
  problemCards: [
    { emoji: '⏳', title: 'Demasiado tiempo gestionando, poco tiempo avanzando.', desc: 'Entre reuniones, mensajes, reportes y herramientas desconectadas, tu equipo pierde horas coordinando el trabajo en lugar de hacerlo.' },
    { emoji: '🤷', title: 'Si tenés que preguntar, te falta visibilidad.', desc: '¿En qué está cada persona? ¿Qué pasó con cada proyecto? Sin una visión clara del avance, terminás persiguiendo tareas y organizando reuniones para saber qué está pasando.' },
    { emoji: '🔥', title: 'Lo urgente siempre le gana a lo importante.', desc: 'Los pedidos de los clientes y las urgencias del día desplazan las prioridades. El equipo vive apagando incendios mientras los proyectos importantes quedan para después.' },
  ],

  solutionTitle:      'No es otro gestor de tareas.',
  solutionParagraph1: 'Es una herramienta de ejecución. Diseñada para que tu equipo sepa exactamente en qué trabajar, en qué orden, y por qué.',
  solutionParagraph2: 'Sin infinitas configuraciones. Sin flujos que nadie respeta. Con un coach de IA que conoce el contexto real de cada persona en tu equipo.',

  featuresTitle: 'Todo lo que necesitás.\nNada que no necesitás.',
  featureCards: [
    { icon: '🎯', title: 'Una tarea activa a la vez', desc: 'El sistema te obliga a comprometerte con una tarea por persona. Sin multitasking disfrazado de productividad.' },
    { icon: '🤖', title: 'Coach de IA integrado', desc: 'Cada mañana, tu IA analiza tus pendientes, historial y rol para decirte exactamente en qué deberías enfocarte primero.' },
    { icon: '📊', title: 'Visibilidad real del equipo', desc: 'Ves en tiempo real qué está haciendo cada persona, en qué proyecto, y cuánto llevan. Sin reuniones de estado.' },
    { icon: '📬', title: 'Resúmenes semanales automáticos', desc: 'Cada viernes, tu equipo recibe un análisis de su semana: logros, tiempo perdido y qué mejorar la próxima.' },
    { icon: '⭐', title: 'Foco del día con tareas destacadas', desc: 'Marcá hasta 3 tareas como prioridad del día. Las que sí o sí tienen que avanzar, sin importar el resto.' },
    { icon: '📁', title: 'Proyectos y clientes separados', desc: 'Cada proyecto tiene su equipo, sus tareas y su historial. Sin mezclas entre clientes, sin confusión.' },
  ],

  stepsTitle: 'De cero a equipo enfocado en minutos',
  steps: [
    { title: 'Creás tu workspace', desc: 'Registrá tu equipo en segundos. Tu espacio propio en tuempresa.blisstracker.app, listo para usar.' },
    { title: 'Elegís tus módulos', desc: 'Marketing, EOS, ventas — activás lo que tu agencia usa. Lo cambiás cuando quieras desde Preferencias.' },
    { title: 'Invitás a tu equipo', desc: 'Mandás invitaciones por email. Cada persona acepta y empieza a trabajar. Sin onboarding eterno.' },
    { title: 'Ejecutan con foco', desc: 'El coach de IA guía las prioridades de cada uno. Vos ves el avance en tiempo real.' },
  ],

  benefitsTitle:    'El resultado no es "más productividad".',
  benefitsSubtitle: 'Son proyectos que avanzan, equipos que saben qué hacer, y tiempo del negocio bien usado.',
  benefitCards: [
    { label: 'Más foco',        desc: 'Menos tareas abiertas, más completadas' },
    { label: 'Menos caos',      desc: 'Todo el equipo en la misma página' },
    { label: 'Más control',     desc: 'Visibilidad sin reuniones de estado' },
    { label: 'Mejor resultado', desc: 'El tiempo del equipo bien usado' },
  ],

  faqGroups: [
    {
      group: 'Producto',
      items: [
        { q: '¿Cómo se compara con Asana, Notion o SEMrush?',
          a: 'Asana y Notion organizan tareas; SEMrush es SEO suelto. BlissTracker integra la ejecución del equipo (foco, coach IA, visibilidad) con los módulos que actives (marketing, EOS, ventas) y reportes con URL pública para clientes. Es un reemplazo para agencias, no un complemento.' },
        { q: '¿Cómo funciona el coach de IA?',
          a: 'Cada mañana, Claude Haiku analiza tus tareas pendientes, historial reciente y expectativas de rol para sugerirte prioridades. No es un chat genérico: aprende tus patrones semanales y los aplica al contexto del día.' },
        { q: '¿Qué pasa si no hago SEO/Ads para mis clientes?',
          a: 'Nada — ese módulo queda apagado y usás el core: tareas con foco, coach de IA, visibilidad de equipo e informes. Lo activás el día que lo necesites, sin migrar de sistema ni pagar de más.' },
        { q: '¿Qué incluye el módulo de Marketing?',
          a: 'GEO/SEO (Search Console, keyword tracking), Meta Ads + Google Ads, Instagram/TikTok/LinkedIn/Facebook, y reportes mensuales con URL pública para el cliente. Es opcional — no hace falta activarlo para aprovechar el resto del sistema.' },
        { q: '¿Qué es el módulo EOS?',
          a: 'Los 7 componentes del sistema Traction (Gino Wickman) integrados al mismo task tracker: Visión, Personas, Datos (Scorecard), Asuntos, Procesos, Tracción (Rocks + reunión L10) y Evaluación organizacional con IA.' },
        { q: '¿Para qué sirve el módulo de Ventas (CRM)?',
          a: 'Pipeline de leads y empresas, próximas acciones con recordatorio automático, investigación de empresas con IA y un generador de propuestas — para agencias que gestionan su propio proceso comercial.' },
        { q: '¿Puedo manejar múltiples clientes y proyectos?',
          a: 'Sí, ilimitados. Cada proyecto tiene su equipo, sus integraciones (GA4, Search Console, Ads) y sus informes. Las URL públicas de cliente son por proyecto.' },
      ],
    },
    {
      group: 'Pricing y trial',
      items: [
        { q: '¿Es gratis para siempre hasta 3 usuarios?',
          a: 'Sí. Hasta 3 usuarios, sin límite de tiempo y sin tarjeta de crédito. Acceso al core del producto: tareas, coach IA, resúmenes semanales.' },
        { q: '¿Qué pasa cuando termina el trial de 14 días?',
          a: 'Si tenés hasta 3 usuarios, seguís en Gratis. Si tenés más, podés activar Pro ($3/seat/mes) o quedarte en past_due hasta que actives la suscripción. Los datos se mantienen siempre.' },
        { q: '¿Hay descuento anual?',
          a: 'Sí, ~15% (los meses 11 y 12 gratis). Se selecciona al activar el plan desde Stripe Checkout.' },
      ],
    },
    {
      group: 'Setup y datos',
      items: [
        { q: '¿Cuánto tarda el setup?',
          a: 'Crear el workspace toma menos de 60 segundos. Conectar Google Analytics y Search Console son ~3 minutos. Tu primer informe a cliente está listo en ~10 minutos.' },
        { q: '¿Mis datos son míos?',
          a: 'Sí. Exportás todo en JSON desde Preferencias en cualquier momento. Si cancelás, programás eliminación con 48h de gracia (cancelable). Sin lock-in.' },
        { q: '¿Cómo manejan los tokens OAuth de mis clientes?',
          a: 'Cifrados con AES-256-GCM en la base. Cada integración (GA4, Ads, Meta, TikTok) tiene auto-refresh y status visible. Si un token expira, te avisamos para reconectar.' },
      ],
    },
    {
      group: 'Equipo y permisos',
      items: [
        { q: '¿Cómo invito a mi equipo?',
          a: 'Desde Admin → Equipo enviás invitaciones por email. Cada persona acepta y empieza a trabajar. Sin alta manual, sin gestión de contraseñas.' },
        { q: '¿Hay roles y permisos granulares?',
          a: 'Sí. Tres roles a nivel workspace (owner, admin, member) más un teamRole operativo libre (ej: DESIGNER, PM). Los miembros solo ven proyectos donde están asignados.' },
      ],
    },
  ],
}


// Respaldo de /api/public/pricing — mismos valores que el default de
// backend/src/config/platformSettings.js, igual que el FALLBACK del
// usePublicPricing de la SPA.
export const PRICING_DEFAULTS = {
  pricingTiers:  [{ upTo: 19, pricePerSeat: 3 }, { upTo: null, pricePerSeat: 2 }],
  freeSeatLimit: 3,
  trialDays:     14,
}
