/**
 * Datos de las tres sub-landings de módulo (/soluciones/marketing, /eos, /ventas).
 *
 * En la SPA eran tres archivos de ~142 líneas con el mismo markup repetido y sólo los
 * datos distintos. Acá el markup vive una sola vez en components/landing/SolutionPage
 * y lo que cambia es esto. El `dark` es el párrafo de la sección oscura "No es una
 * herramienta más", que lleva una parte en negrita: va como array de tramos para no
 * tener que inyectar HTML.
 */
export const SOLUTIONS = {
  marketing: {
    slug: 'marketing',
    badge: '📊 Módulo Marketing',
    h1: 'GEO, SEO y Ads para agencias — dentro de tu sistema de ejecución',
    subtitle: 'Auditá visibilidad en IA, trackeá keywords, seguí tus campañas de Ads y mandale al cliente un informe con URL pública — todo conectado a las tareas reales de tu equipo, no en una herramienta aparte.',
    ctaLocation: 'solution_marketing',
    ctaTitle: 'Activá Marketing cuando lo necesites.',
    features: [
      { icon: '🤖', title: 'GEO Audit para IA', desc: 'Visibilidad en ChatGPT, Perplexity, Claude y AI Overviews: score 0-100, crawlers de IA, llms.txt, JSON-LD sugerido.' },
      { icon: '🔍', title: 'SEO + Search Console', desc: 'Keyword tracking con historial, SERP snapshots, Domain Rating, canibalización, oportunidades de contenido y content briefs con IA.' },
      { icon: '📢', title: 'Meta Ads + Google Ads', desc: 'Spend, impresiones, clicks y conversiones de ambas plataformas en un solo lugar, por proyecto y por mes.' },
      { icon: '📱', title: 'Instagram, TikTok, LinkedIn, Facebook, YouTube', desc: 'Métricas oficiales o por scraping, seguimiento de competidores, y el mejor post/video del mes en cada red.' },
      { icon: '⚡', title: 'Performance + Health Score', desc: 'PageSpeed Insights (mobile + desktop) y un score compuesto que junta GEO, SEO, GA4 y velocidad en un número.' },
      { icon: '📄', title: 'Informes con URL pública', desc: 'Un link que el cliente abre sin loguearse, con feedback 1-5 estrellas y objetivos de marketing por período.' },
    ],
    dark: [
      'Cada hallazgo de una auditoría GEO, cada oportunidad SEO, cada tarea de una campaña se convierte en una ',
      { strong: 'tarea real' },
      ' asignada a quien corresponda — con foco forzado, coach de IA y visibilidad de equipo, igual que cualquier otra tarea de tu agencia.',
    ],
    faq: [
      { q: '¿Necesito el resto de BlissTracker para usar este módulo?',
        a: 'No hace falta configurar nada más — el módulo Marketing viene con cualquier plan pago y se activa en un click. Pero sí queda conectado al resto: cada hallazgo de una auditoría se convierte en una tarea asignada a quien corresponda, sin salir del sistema.' },
      { q: '¿Qué necesito conectar para empezar?',
        a: 'Nada es obligatorio de entrada. El GEO Audit solo pide la URL del sitio. Para GA4, Search Console, Ads o redes sociales, conectás cada integración por proyecto cuando la necesites (~3 minutos cada una).' },
      { q: '¿El informe funciona para varios clientes/proyectos?',
        a: 'Sí, es por proyecto e ilimitado. Cada proyecto tiene su propia URL pública, sus propias integraciones y su propio historial de informes mensuales.' },
      { q: '¿Y si mi agencia no hace SEO/Ads para todos los clientes?',
        a: 'El módulo se activa por workspace, no por proyecto — así que convive con proyectos que no lo usan. No estás obligado a conectar integraciones en los que no aplique.' },
    ],
  },

  eos: {
    slug: 'eos',
    badge: '🏢 Módulo EOS / Traction',
    h1: 'Tu sistema Traction, sin cambiar de app',
    subtitle: 'Visión, Personas, Datos, Asuntos, Procesos y Tracción — los componentes del libro de Gino Wickman, corriendo sobre el mismo task tracker donde tu equipo ya ejecuta.',
    ctaLocation: 'solution_eos',
    ctaTitle: 'Activá EOS cuando lo necesites.',
    features: [
      { icon: '🧭', title: 'Visión (VTO)', desc: 'Valores centrales, propósito, BHAG, estrategia de marketing y metas a 1/3/10 años en un mismo documento vivo.' },
      { icon: '👤', title: 'Personas', desc: 'People Analyzer (GWC) por persona, Accountability Chart jerárquico y registro de Strikes.' },
      { icon: '📈', title: 'Datos (Scorecard)', desc: 'Métricas semanales y mensuales con responsable y meta. Incluye automáticas: tardanzas, ocupación del equipo, tareas completadas — calculadas solas, sin cargar nada a mano.' },
      { icon: '🧩', title: 'Asuntos (IDS)', desc: 'Identify-Discuss-Solve semanal y trimestral, con prioridad y estado, para que nada se discuta dos veces.' },
      { icon: '🗂️', title: 'Procesos', desc: 'Documentación de tus procesos clave con pasos ordenados y responsable por rol.' },
      { icon: '🎯', title: 'Tracción', desc: 'Rocks trimestrales + reunión L10 semanal con cronómetro que cuenta el tiempo a los participantes, y To-Dos que se envían al dashboard como tareas reales.' },
    ],
    dark: [
      'Un Rock o un To-Do de la L10 se vuelve una ',
      { strong: 'tarea real' },
      ', asignada a quien corresponda, con foco forzado y coach de IA — la misma ejecución diaria que usa el resto de tu equipo, no un tablero aparte que nadie mira entre reunión y reunión.',
    ],
    faq: [
      { q: '¿Hace falta conocer el libro Traction para usarlo?',
        a: 'Ayuda, pero no es requisito — cada sección del sistema (Visión, Personas, Datos, Asuntos, Procesos, Tracción, Evaluación) viene con su propia guía dentro de la app.' },
      { q: '¿Reemplaza a un software de EOS dedicado?',
        a: 'Cubre los 6 componentes del sistema Traction, con la diferencia de que las tareas de tus reuniones L10 y tus Rocks son las mismas tareas reales que ejecuta tu equipo — no hay que duplicar nada en dos sistemas.' },
      { q: '¿Los To-Dos de la reunión L10 se convierten en tareas de verdad?',
        a: 'Sí. Un To-Do con responsable se puede enviar al dashboard con un click — crea una tarea real en el proyecto que elijas, y si esa tarea se completa, el To-Do se tilda solo.' },
      { q: '¿Cuánto cuesta activar EOS?',
        a: 'Viene incluido en cualquier plan pago, sin costo adicional — lo activás o desactivás cuando quieras desde Preferencias.' },
    ],
  },

  ventas: {
    slug: 'ventas',
    badge: '💰 Módulo Ventas (CRM)',
    h1: 'El CRM de tu agencia, no uno genérico',
    subtitle: 'Pipeline de leads, próximas acciones que no se pierden, investigación de empresas y propuestas con IA — y cuando ganás un cliente, se convierte en un proyecto real con un click.',
    ctaLocation: 'solution_ventas',
    ctaTitle: 'Activá Ventas cuando lo necesites.',
    features: [
      { icon: '🗂️', title: 'Pipeline de leads', desc: 'Empresas, contactos y oportunidades separados. Kanban por estado: prospecto → contactado → reunión → propuesta → ganado/perdido.' },
      { icon: '⏰', title: 'Próxima acción + recordatorios', desc: 'Cada lead tiene una única próxima acción pendiente, con recordatorio automático por email al responsable si queda vencida.' },
      { icon: '🔎', title: 'Investigación de empresas con IA', desc: 'Un click analiza el sitio del prospecto y arma un resumen: servicios, mercado, redes, SEO, oportunidades y necesidades detectadas.' },
      { icon: '📝', title: 'Generador de propuestas con IA', desc: 'A partir de tus servicios y los objetivos del cliente, genera una propuesta editable en HTML — exportable a PDF con tu marca.' },
      { icon: '📊', title: 'Métricas y forecast', desc: 'Forecast ponderado por probabilidad de cada etapa, win rate, ciclo de venta promedio, y ranking por responsable.' },
      { icon: '🔁', title: 'Conversión directa a proyecto', desc: 'Un lead ganado se convierte en un proyecto real de tu agencia con un click — sin recargar datos a mano.' },
    ],
    dark: [
      'Ganaste el lead: con un click se crea un ',
      { strong: 'proyecto real' },
      ', con su equipo y sus tareas — nada de recargar el cliente a mano en un segundo sistema después de cerrarlo.',
    ],
    faq: [
      { q: '¿Reemplaza a un CRM como HubSpot o Pipedrive?',
        a: 'Para una agencia que gestiona su propio proceso comercial, sí — con la diferencia de que un lead ganado se convierte directamente en un proyecto real de BlissTracker, sin exportar/importar nada entre sistemas.' },
      { q: '¿Quién puede ver el módulo de Ventas?',
        a: 'Los admins/owners del workspace y el equipo comercial que vos definas (por rol interno) desde Admin → Equipo. El resto del equipo no lo ve.' },
      { q: '¿La IA necesita que yo escriba la propuesta desde cero?',
        a: 'No — elegís los servicios y los objetivos del cliente, la IA genera un HTML editable con la estructura y el tono que vos configures, y lo ajustás antes de exportarlo a PDF.' },
      { q: '¿Cuánto cuesta activar Ventas?',
        a: 'Viene incluido en cualquier plan pago, sin costo adicional — lo activás o desactivás cuando quieras desde Preferencias.' },
    ],
  },
}
