import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import BlissLogo from '../components/BlissLogo'
import { trackEvent } from '../lib/analytics'
import TrustedByBar from '../components/landing/TrustedByBar'
import SegmentCards from '../components/landing/SegmentCards'
import ComparisonTable from '../components/landing/ComparisonTable'
import TestimonialsSection from '../components/landing/TestimonialsSection'
import FounderBio from '../components/landing/FounderBio'

// ─── App Mockup ───────────────────────────────────────────────────────────────

function AppMockup() {
  return (
    <div className="w-full rounded-2xl overflow-hidden shadow-2xl shadow-gray-300 border border-gray-200 text-left select-none">
      {/* Browser chrome */}
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-red-400" />
        <div className="w-3 h-3 rounded-full bg-yellow-400" />
        <div className="w-3 h-3 rounded-full bg-green-400" />
        <div className="flex-1 mx-3">
          <div className="bg-white border border-gray-200 rounded-md px-3 py-1 text-xs text-gray-400 max-w-xs">
            miagencia.blisstracker.app
          </div>
        </div>
      </div>

      {/* App shell */}
      <div className="bg-gray-50 flex" style={{ minHeight: 320 }}>
        {/* Sidebar */}
        <div className="w-44 bg-white border-r border-gray-100 p-3 flex-shrink-0">
          <div className="flex items-center gap-2 mb-5 px-1">
            <img src="/blisstracker_logo.svg" alt="" className="w-6 h-6" />
            <div className="h-2.5 w-20 bg-gray-200 rounded-full" />
          </div>
          {[true, false, false, false, false].map((active, i) => (
            <div
              key={i}
              className={`h-8 rounded-lg mb-1 flex items-center px-2 gap-2 ${active ? 'bg-primary-50' : ''}`}
            >
              <div className={`w-3 h-3 rounded-sm flex-shrink-0 ${active ? 'bg-primary-400' : 'bg-gray-200'}`} />
              <div className={`h-2 rounded-full ${active ? 'w-14 bg-primary-300' : 'w-12 bg-gray-200'}`} />
            </div>
          ))}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="h-2 w-10 bg-gray-200 rounded-full mb-2 px-2" />
            {[false, false, false].map((_, i) => (
              <div key={i} className="h-8 rounded-lg mb-1 flex items-center px-2 gap-2">
                <div className="w-3 h-3 rounded-sm flex-shrink-0 bg-gray-100" />
                <div className="h-2 rounded-full w-12 bg-gray-100" />
              </div>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 p-4 overflow-hidden">
          {/* AI Insight card */}
          <div className="bg-gradient-to-r from-primary-50 to-orange-50 border border-primary-200 rounded-xl p-3 mb-4 flex gap-3">
            <div className="text-xl flex-shrink-0">🤖</div>
            <div className="flex-1 min-w-0">
              <div className="h-2.5 w-28 bg-primary-300 rounded-full mb-2" />
              <div className="h-2 w-full bg-primary-200/70 rounded-full mb-1.5" />
              <div className="h-2 w-4/5 bg-primary-200/70 rounded-full" />
            </div>
          </div>

          {/* Tasks section */}
          <div className="h-2 w-24 bg-gray-200 rounded-full mb-3" />
          {[
            { dot: 'bg-primary-500', label: 'En progreso', w: 'w-48' },
            { dot: 'bg-green-400',   label: 'Completada',  w: 'w-40' },
            { dot: 'bg-gray-300',    label: 'Pendiente',   w: 'w-52' },
            { dot: 'bg-gray-300',    label: 'Pendiente',   w: 'w-36' },
            { dot: 'bg-red-400',     label: 'Bloqueada',   w: 'w-44' },
          ].map((task, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-white border border-gray-100 rounded-lg px-3 py-2.5 mb-1.5 shadow-sm"
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${task.dot}`} />
              <div className={`h-2 rounded-full bg-gray-200 flex-1 max-w-xs ${task.w}`} />
              <div className="text-xs text-gray-300 flex-shrink-0 hidden sm:block">{task.label}</div>
              <div className="ml-auto flex gap-1">
                <div className="w-4 h-4 rounded bg-gray-100" />
                <div className="w-4 h-4 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>

        {/* Right panel (visible on wider screens) */}
        <div className="w-52 bg-white border-l border-gray-100 p-3 hidden lg:block flex-shrink-0">
          <div className="h-2.5 w-24 bg-gray-200 rounded-full mb-4" />
          {[70, 45, 85, 55].map((pct, i) => (
            <div key={i} className="mb-3">
              <div className="flex justify-between mb-1">
                <div className="h-2 w-16 bg-gray-100 rounded-full" />
                <div className="h-2 w-6 bg-gray-100 rounded-full" />
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-400 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="h-2 w-20 bg-gray-200 rounded-full mb-3" />
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-gray-100 flex-shrink-0" />
                <div>
                  <div className="h-1.5 w-16 bg-gray-100 rounded-full mb-1" />
                  <div className="h-1.5 w-10 bg-gray-100 rounded-full" />
                </div>
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────

function FaqItem({ q, a, open, onClick }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={onClick}
        className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900 text-sm sm:text-base">{q}</span>
        <span
          className={`text-primary-500 text-2xl font-light flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-45' : ''}`}
        >
          +
        </span>
      </button>
      {open && (
        <div className="px-6 pb-5 pt-3 text-gray-500 text-sm leading-relaxed border-t border-gray-100">
          {a}
        </div>
      )}
    </div>
  )
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

export default function Landing() {
  const [openFaq, setOpenFaq] = useState(null)

  const features = [
    {
      icon: '🎯',
      title: 'Una tarea activa a la vez',
      desc: 'El sistema te obliga a comprometerte con una tarea por persona. Sin multitasking disfrazado de productividad.',
    },
    {
      icon: '🤖',
      title: 'Coach de IA integrado',
      desc: 'Cada mañana, tu IA analiza tus pendientes, historial y rol para decirte exactamente en qué deberías enfocarte primero.',
    },
    {
      icon: '📊',
      title: 'Visibilidad real del equipo',
      desc: 'Ves en tiempo real qué está haciendo cada persona, en qué proyecto, y cuánto llevan. Sin reuniones de estado.',
    },
    {
      icon: '📬',
      title: 'Resúmenes semanales automáticos',
      desc: 'Cada viernes, tu equipo recibe un análisis de su semana: logros, tiempo perdido y qué mejorar la próxima.',
    },
    {
      icon: '⭐',
      title: 'Foco del día con tareas destacadas',
      desc: 'Marcá hasta 3 tareas como prioridad del día. Las que sí o sí tienen que avanzar, sin importar el resto.',
    },
    {
      icon: '📁',
      title: 'Proyectos y clientes separados',
      desc: 'Cada proyecto tiene su equipo, sus tareas y su historial. Sin mezclas entre clientes, sin confusión.',
    },
  ]

  const steps = [
    {
      step: '01',
      title: 'Creás tu workspace',
      desc: 'Registrá tu equipo en segundos. Tu espacio propio en tuempresa.blisstracker.app, listo para usar.',
    },
    {
      step: '02',
      title: 'Elegís tus módulos',
      desc: 'Marketing, EOS, ventas — activás lo que tu agencia usa. Lo cambiás cuando quieras desde Preferencias.',
    },
    {
      step: '03',
      title: 'Invitás a tu equipo',
      desc: 'Mandás invitaciones por email. Cada persona acepta y empieza a trabajar. Sin onboarding eterno.',
    },
    {
      step: '04',
      title: 'Ejecutan con foco',
      desc: 'El coach de IA guía las prioridades de cada uno. Vos ves el avance en tiempo real.',
    },
  ]

  const faqGroups = [
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
  ]

  // Para JSON-LD y rendering, aplanar.
  const faqs = faqGroups.flatMap(g => g.items)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        '@id': 'https://blisstracker.app/#software',
        name: 'BlissTracker',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: 'Sistema operativo para agencias: gestión de tareas con foco forzado + coach de IA, más los módulos que tu agencia necesite (marketing GEO/SEO/Ads, EOS/Traction, CRM de ventas) y reportes para clientes con URL pública.',
        url: 'https://blisstracker.app/',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: 'Plan Gratis hasta 3 usuarios. Trial de 14 días para Pro y Scale.',
        },
        publisher: { '@id': 'https://blisstracker.app/#org' },
      },
      {
        '@type': 'Organization',
        '@id': 'https://blisstracker.app/#org',
        name: 'BlissTracker',
        url: 'https://blisstracker.app/',
        logo: 'https://blisstracker.app/blisstracker_logo.svg',
        founder: { '@type': 'Person', name: 'Gastón Suárez Duek' },
        email: 'gaston@blissmkt.ar',
        sameAs: ['https://blissmkt.ar'],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">

      <Helmet>
        <title>BlissTracker — El sistema operativo de tu agencia</title>
        <meta name="description" content="Tareas con foco real, EOS/Traction, CRM comercial y marketing (GEO/SEO/Ads) — los módulos que tu agencia necesite, en un solo sistema. 14 días gratis, sin tarjeta." />
        <link rel="canonical" href="https://blisstracker.app/" />
        <meta property="og:url" content="https://blisstracker.app/" />
        <meta property="og:title" content="BlissTracker — El sistema operativo de tu agencia" />
        <meta property="og:description" content="Tareas con foco real, EOS/Traction, CRM comercial y marketing (GEO/SEO/Ads) — los módulos que tu agencia necesite, en un solo sistema." />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center">
            <BlissLogo variant="lockup" dark={false} className="h-8 w-auto" />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/pricing"
              className="text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors hidden sm:block"
            >
              Pricing
            </Link>
            <Link
              to="/login"
              className="text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors hidden sm:block"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              className="text-sm bg-primary-500 hover:bg-primary-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm shadow-primary-200"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-16 pb-20 sm:pt-24 sm:pb-28 px-4 sm:px-6 bg-gradient-to-b from-white via-white to-gray-50">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-primary-50 border border-primary-100 text-primary-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-8">
            <span className="w-1.5 h-1.5 bg-primary-500 rounded-full" />
            Hecho para agencias de marketing · Gratis hasta 3 usuarios
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-gray-900 leading-[1.08] tracking-tight mb-6">
            El sistema operativo<br />
            <span className="text-primary-500">de tu agencia.</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            Tareas con foco real, visibilidad de tu equipo en vivo, e informes automáticos —
            más los módulos que tu agencia necesite: marketing, EOS, ventas.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <Link
              to="/register"
              onClick={() => trackEvent('landing_cta_click', { location: 'hero' })}
              className="w-full sm:w-auto bg-primary-500 hover:bg-primary-600 text-white text-base font-semibold px-8 py-4 rounded-xl transition-colors shadow-lg shadow-primary-100"
            >
              Probá 14 días gratis →
            </Link>
            <a
              href="#demo"
              onClick={() => trackEvent('landing_cta_click', { location: 'hero_demo' })}
              className="w-full sm:w-auto text-gray-700 hover:text-gray-900 text-base font-medium px-8 py-4 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors inline-flex items-center justify-center gap-2"
            >
              <span>▶</span> Ver demo (90s)
            </a>
          </div>
          <p className="text-xs text-gray-400">Sin tarjeta de crédito · Cancelás cuando quieras</p>
        </div>

        {/* Video demo o mockup. Cuando Gastón suba el Loom, descomentar el iframe y dejar el AppMockup como fallback. */}
        <div id="demo" className="max-w-5xl mx-auto mt-16 px-2 sm:px-0">
          {/*
            TODO: cuando esté el Loom, reemplazar AppMockup por:
            <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-gray-300 border border-gray-200">
              <iframe
                src="https://www.loom.com/embed/<LOOM_ID>?autoplay=0&hideEmbedTopBar=true"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          */}
          <AppMockup />
        </div>
      </section>

      {/* ── Trusted by ── */}
      <TrustedByBar />

      {/* ── Problem ── */}
      <section className="py-24 px-4 sm:px-6 bg-gray-900">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
              Tu agencia merece dejar de hacer esto.
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Cuando reportar a un cliente se vuelve más caro que ejecutar para él, algo está roto.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                emoji: '🪟',
                title: '7 pestañas para reportar un mes',
                desc: 'GA4, Search Console, Ads, Meta, TikTok, Excel, PowerPoint. Tu PM pierde 4 horas armando lo que el cliente lee en 4 minutos.',
              },
              {
                emoji: '🤷',
                title: '¿En qué está cada cuenta?',
                desc: 'Sin reunión de status, nadie sabe el avance. Con reunión, perdés 30 min × persona × semana. Y tampoco quedan respuestas.',
              },
              {
                emoji: '🔥',
                title: 'Lo urgente del cliente come tu roadmap',
                desc: 'Cada cliente cree que es prioritario. Sin foco explícito, el equipo apaga incendios y el trabajo planificado queda para "después".',
              },
            ].map((item, i) => (
              <div key={i} className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{item.emoji}</span>
                  <h3 className="text-white font-bold text-lg leading-tight">{item.title}</h3>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solution ── */}
      <section className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-6">
            La solución
          </p>
          <BlissLogo variant="lockup" dark={false} className="h-12 w-auto mx-auto mb-8" />
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-6">
            No es otro gestor de tareas.
          </h2>
          <p className="text-gray-500 text-lg leading-relaxed mb-4">
            Es una herramienta de ejecución. Diseñada para que tu equipo sepa exactamente en qué trabajar,
            en qué orden, y por qué.
          </p>
          <p className="text-gray-500 text-lg leading-relaxed">
            Sin infinitas configuraciones. Sin flujos que nadie respeta. Con un coach de IA que conoce
            el contexto real de cada persona en tu equipo.
          </p>
        </div>
      </section>

      {/* ── Para quién es ── */}
      <SegmentCards />

      {/* ── Features ── */}
      <section className="py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">
              Funcionalidades
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Todo lo que necesitás.<br className="hidden sm:block" /> Nada que no necesitás.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {features.map((f, i) => (
              <div
                key={i}
                className="flex gap-4 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm"
              >
                <div className="text-3xl flex-shrink-0 mt-0.5">{f.icon}</div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base sm:text-lg mb-1.5">{f.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="como-funciona" className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">
              Cómo funciona
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              De cero a equipo enfocado en minutos
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {steps.map((s, i) => (
              <div key={i} className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 text-primary-600 font-black text-xl mb-5">
                  {s.step}
                </div>
                <h3 className="font-bold text-gray-900 text-xl mb-3">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparativa ── */}
      <ComparisonTable />

      {/* ── Testimonios ── */}
      <TestimonialsSection />

      {/* ── Benefits ── */}
      <section className="py-24 px-4 sm:px-6 bg-primary-500">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            El resultado no es "más productividad".
          </h2>
          <p className="text-primary-100 text-lg mb-12 max-w-xl mx-auto">
            Son proyectos que avanzan, equipos que saben qué hacer, y tiempo del negocio bien usado.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Más foco',          desc: 'Menos tareas abiertas, más completadas' },
              { label: 'Menos caos',        desc: 'Todo el equipo en la misma página' },
              { label: 'Más control',       desc: 'Visibilidad sin reuniones de estado' },
              { label: 'Mejor resultado',   desc: 'El tiempo del equipo bien usado' },
            ].map((b, i) => (
              <div
                key={i}
                className="bg-primary-600/40 border border-primary-400/30 rounded-2xl p-5"
              >
                <p className="text-white font-extrabold text-lg mb-1.5">{b.label}</p>
                <p className="text-primary-100 text-xs leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="precios" className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">
              Precios
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
              Simple. Sin sorpresas.
            </h2>
            <p className="text-gray-500 text-lg">Empezás gratis. Pagás cuando escala.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Free */}
            <div className="rounded-2xl border border-gray-200 p-8 flex flex-col">
              <div>
                <h3 className="font-bold text-gray-900 text-xl mb-1">Gratis</h3>
                <p className="text-gray-400 text-sm mb-6">Para equipos pequeños que arrancan</p>
                <div className="mb-7">
                  <span className="text-4xl font-extrabold text-gray-900">$0</span>
                  <span className="text-gray-400 text-sm ml-1">/mes</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {['Hasta 3 usuarios', 'Proyectos ilimitados', 'Coach de IA incluido', 'Resúmenes semanales'].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                      <span className="text-primary-500 font-bold">✓</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-auto">
                <Link
                  to="/register"
                  className="block w-full text-center border border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 font-semibold py-3 rounded-xl transition-colors"
                >
                  Crear cuenta gratis
                </Link>
              </div>
            </div>

            {/* Pro — highlighted */}
            <div className="rounded-2xl border-2 border-primary-500 p-8 relative shadow-xl shadow-primary-100/60 flex flex-col">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary-500 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                MÁS POPULAR
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-xl mb-1">Pro</h3>
                <p className="text-gray-400 text-sm mb-6">Para agencias y equipos en crecimiento</p>
                <div className="mb-7">
                  <span className="text-4xl font-extrabold text-gray-900">$3</span>
                  <span className="text-gray-400 text-sm ml-1">/usuario/mes</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {[
                    'Usuarios ilimitados',
                    'Todo lo del plan Gratis',
                    'Panel de administración',
                    'Reportes de productividad',
                    'RRHH y legajos del equipo',
                    'Soporte prioritario',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                      <span className="text-primary-500 font-bold">✓</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-auto">
                <Link
                  to="/register"
                  className="block w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3 rounded-xl transition-colors shadow-md shadow-primary-200"
                >
                  Empezar — 14 días gratis
                </Link>
              </div>
            </div>

            {/* Scale */}
            <div className="rounded-2xl border border-gray-200 p-8 flex flex-col">
              <div>
                <h3 className="font-bold text-gray-900 text-xl mb-1">Scale</h3>
                <p className="text-gray-400 text-sm mb-6">Para equipos de más de 20 personas</p>
                <div className="mb-7">
                  <span className="text-4xl font-extrabold text-gray-900">$2</span>
                  <span className="text-gray-400 text-sm ml-1">/usuario/mes</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {['+20 usuarios', 'Todo lo del plan Pro', 'Precio reducido por escala', 'Onboarding personalizado'].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                      <span className="text-primary-500 font-bold">✓</span> {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-auto">
                <a
                  href="mailto:gaston@blissmkt.ar?subject=BlissTracker%20Scale"
                  className="block w-full text-center border border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 font-semibold py-3 rounded-xl transition-colors"
                >
                  Hablemos
                </a>
              </div>
            </div>
          </div>

          {/* Link a pricing page con tabla comparativa */}
          <div className="text-center mt-10">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium text-sm"
            >
              Ver tabla comparativa completa y calculadora
              <span>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Hecho por ── */}
      <FounderBio />

      {/* ── FAQ ── */}
      <section id="faq" className="py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">
              Preguntas frecuentes
            </p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Lo que más nos preguntan.
            </h2>
          </div>

          {faqGroups.map((g, gi) => {
            const itemsBefore = faqGroups.slice(0, gi).reduce((acc, gg) => acc + gg.items.length, 0)
            return (
              <div key={g.group} className="mb-8">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 px-1">{g.group}</h3>
                <div className="space-y-3">
                  {g.items.map((faq, i) => {
                    const idx = itemsBefore + i
                    return (
                      <FaqItem
                        key={idx}
                        q={faq.q}
                        a={faq.a}
                        open={openFaq === idx}
                        onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 px-4 sm:px-6 bg-gray-900 text-center">
        <div className="max-w-2xl mx-auto">
          <BlissLogo variant="honeycomb" className="w-20 h-20 mx-auto mb-5" />
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 leading-tight">
            Tu equipo puede ejecutar mejor.<br />Empezá hoy.
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            14 días gratis. Sin tarjeta de crédito. Sin configuración complicada.
          </p>
          <Link
            to="/register"
            onClick={() => trackEvent('landing_cta_click', { location: 'final' })}
            className="inline-block bg-primary-500 hover:bg-primary-600 text-white text-base font-semibold px-10 py-4 rounded-xl transition-colors shadow-lg shadow-primary-900/30"
          >
            Crear cuenta gratis →
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-950 border-t border-gray-800 text-gray-400">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            <div className="col-span-2 sm:col-span-1">
              <BlissLogo variant="lockup" dark className="h-8 w-auto mb-3" />
              <p className="text-xs text-gray-500 leading-relaxed">
                El sistema operativo de las agencias de marketing modernas.
                Hecho en Argentina 🇦🇷
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-300 mb-3">Producto</p>
              <ul className="space-y-2 text-sm">
                <li><Link to="/pricing"     className="hover:text-white transition-colors">Pricing</Link></li>
                <li><a   href="#demo"       className="hover:text-white transition-colors">Ver demo</a></li>
                <li><a   href="#testimonios" className="hover:text-white transition-colors">Testimonios</a></li>
                <li><a   href="#faq"         className="hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-300 mb-3">Empresa</p>
              <ul className="space-y-2 text-sm">
                <li><a href="#hecho-por"     className="hover:text-white transition-colors">Sobre el founder</a></li>
                <li><a href="mailto:gaston@blissmkt.ar" className="hover:text-white transition-colors">Contacto</a></li>
                <li><a href="https://blissmkt.ar" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">BlissMKT ↗</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-300 mb-3">Legal</p>
              <ul className="space-y-2 text-sm">
                <li><Link to="/condiciones" className="hover:text-white transition-colors">Condiciones de uso</Link></li>
                <li><Link to="/privacidad"  className="hover:text-white transition-colors">Política de privacidad</Link></li>
                <li><Link to="/login"       className="hover:text-white transition-colors">Iniciar sesión</Link></li>
                <li><Link to="/register"    className="hover:text-white transition-colors">Crear cuenta</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
            <span>&copy; {new Date().getFullYear()} BlissTracker — Todos los derechos reservados</span>
            <span>Hecho con foco en Buenos Aires</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
