import { Link } from 'react-router-dom'
import { useState, useMemo, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import BlissLogo from '../components/BlissLogo'
import { trackEvent } from '../lib/analytics'

// Pricing tiers en sincronía con backend/src/controllers/superadmin.controller.js (default).
// Si más adelante se exponen vía GET /api/public/pricing-tiers, reemplazar este array por un fetch.
const TIERS = [
  { upTo: 19,   pricePerSeat: 3 },
  { upTo: null, pricePerSeat: 2 },
]

function calcMonthly(seats) {
  if (seats <= 0) return 0
  const tier = TIERS.find(t => t.upTo == null || seats <= t.upTo) ?? TIERS[TIERS.length - 1]
  return seats * tier.pricePerSeat
}

function priceForSeats(seats) {
  const tier = TIERS.find(t => t.upTo == null || seats <= t.upTo) ?? TIERS[TIERS.length - 1]
  return tier.pricePerSeat
}

// ─── Tabla comparativa: filas ────────────────────────────────────────────────
const COMPARISON = [
  { group: 'Gestión de tareas', rows: [
    { feature: 'Usuarios',                                        free: 'Hasta 3',  pro: 'Ilimitados',  scale: 'Desde 20' },
    { feature: 'Proyectos',                                       free: 'Ilimitados', pro: 'Ilimitados', scale: 'Ilimitados' },
    { feature: 'Foco forzado (1 tarea activa)',                   free: true,       pro: true,          scale: true },
    { feature: 'Tareas destacadas + Backlog',                     free: true,       pro: true,          scale: true },
    { feature: 'Comentarios + menciones',                         free: true,       pro: true,          scale: true },
    { feature: 'Notificaciones (in-app + email)',                 free: true,       pro: true,          scale: true },
  ]},
  { group: 'Inteligencia artificial', rows: [
    { feature: 'Coach IA diario (Claude Haiku)',                  free: true,       pro: true,          scale: true },
    { feature: 'Resumen semanal por email',                       free: true,       pro: true,          scale: true },
    { feature: 'Memoria semanal de aprendizaje',                  free: true,       pro: true,          scale: true },
    { feature: 'Expectativas por rol (Role IA)',                  free: false,      pro: true,          scale: true },
    { feature: 'Límite mensual de tokens IA',                     free: '500K',     pro: '2M',          scale: 'Personalizado' },
  ]},
  { group: 'Marketing toolkit', rows: [
    { feature: 'GEO Audit (AI Overviews + ChatGPT)',              free: false,      pro: true,          scale: true },
    { feature: 'SEO con Google Search Console',                   free: false,      pro: true,          scale: true },
    { feature: 'Keyword tracking + SERP snapshots',               free: false,      pro: true,          scale: true },
    { feature: 'Google Analytics 4',                              free: false,      pro: true,          scale: true },
    { feature: 'Meta Ads + Google Ads',                           free: false,      pro: true,          scale: true },
    { feature: 'Instagram + TikTok',                              free: false,      pro: true,          scale: true },
    { feature: 'PageSpeed + Health Score',                        free: false,      pro: true,          scale: true },
    { feature: 'Canibalización SEO',                              free: false,      pro: true,          scale: true },
    { feature: 'Informes mensuales con URL pública para clientes', free: false,     pro: true,          scale: true },
  ]},
  { group: 'EOS / Traction', rows: [
    { feature: 'Visión + Personas + Datos + Procesos',            free: false,      pro: true,          scale: true },
    { feature: 'Rocks trimestrales + L10 semanal',                free: false,      pro: true,          scale: true },
    { feature: 'Evaluación organizacional con IA',                free: false,      pro: true,          scale: true },
  ]},
  { group: 'RRHH y administración', rows: [
    { feature: 'Legajos del equipo',                              free: false,      pro: true,          scale: true },
    { feature: 'Solicitud de licencias + vacaciones',             free: false,      pro: true,          scale: true },
    { feature: 'Historial de logins + ingresos',                  free: false,      pro: true,          scale: true },
  ]},
  { group: 'Soporte y onboarding', rows: [
    { feature: 'Soporte por email',                               free: true,       pro: true,          scale: true },
    { feature: 'Soporte prioritario',                             free: false,      pro: true,          scale: true },
    { feature: 'Onboarding personalizado',                        free: false,      pro: false,         scale: true },
    { feature: 'Account manager dedicado',                        free: false,      pro: false,         scale: true },
  ]},
]

function Cell({ v }) {
  if (v === true)  return <span className="text-primary-600 font-bold">✓</span>
  if (v === false) return <span className="text-gray-300">—</span>
  return <span className="text-gray-700">{v}</span>
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function Pricing() {
  const [seats,    setSeats]    = useState(5)
  const [annual,   setAnnual]   = useState(false)
  const [openFaq,  setOpenFaq]  = useState(null)

  const monthly = useMemo(() => calcMonthly(seats), [seats])
  const annualPrice = useMemo(() => monthly * 12 * 0.85, [monthly]) // 15% descuento anual hipotético
  const savings = useMemo(() => Math.round(monthly * 12 - annualPrice), [monthly, annualPrice])
  const perSeat = useMemo(() => priceForSeats(seats), [seats])

  useEffect(() => {
    trackEvent('pricing_page_viewed')
  }, [])

  // Track uso de calculadora (debounce sutil — solo cuando seats deja de cambiar 1.5s)
  useEffect(() => {
    if (seats === 5) return // valor inicial — no es uso activo
    const t = setTimeout(() => trackEvent('pricing_calc_used', { seats }), 1500)
    return () => clearTimeout(t)
  }, [seats])

  const faqs = [
    { q: '¿Cómo se factura?',
      a: 'Mensual o anual con tarjeta a través de Stripe. La factura se genera automáticamente cada período y queda disponible en /billing para descarga.' },
    { q: '¿Puedo cancelar cuando quiera?',
      a: 'Sí. Desde /billing entrás al portal de Stripe y cancelás con un click. Mantenés acceso hasta el fin del período pagado y tus datos quedan accesibles después.' },
    { q: '¿Puedo cambiar de plan?',
      a: 'Sí. Sumás o restás miembros cuando quieras y el cargo se ajusta prorrateado automáticamente. Si bajás a 3 o menos miembros, podés quedarte en Gratis sin perder datos.' },
    { q: '¿Qué cuenta como "usuario"?',
      a: 'Cualquier miembro activo del workspace. Los usuarios desactivados no consumen seat. Los clientes que ven informes mensuales con URL pública NO cuentan — no necesitan cuenta.' },
    { q: '¿Hay descuento anual?',
      a: 'Sí, ~15% (los meses 11 y 12 gratis). Lo configurás al elegir plan en Stripe Checkout.' },
    { q: '¿Qué pasa si supero el límite de tokens de IA?',
      a: 'Recibís un aviso al 90% y otro al 95%. Si superás el 100%, las funciones de IA pausan hasta el mes siguiente — el resto de la app sigue normal. El límite se puede subir desde Pro a Scale o personalizado.' },
    { q: '¿Mis datos son míos?',
      a: 'Siempre. Exportás todo en JSON desde Preferencias en cualquier momento. Si cancelás, programás eliminación con 48h de gracia (cancellable) y todo se borra de manera definitiva.' },
    { q: '¿Necesito tarjeta para el trial?',
      a: 'No. Te registrás con email y arrancás. Si decidís continuar después de los 14 días, ingresás la tarjeta. Si no, automáticamente quedás en Gratis (hasta 3 usuarios).' },
  ]

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type':    'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">

      <Helmet>
        <title>Pricing — BlissTracker</title>
        <meta name="description" content="Pricing simple para agencias que crecen. Gratis hasta 3 usuarios. Plan Pro $3/seat/mes. Sin tarjeta de crédito para empezar." />
        <link rel="canonical" href="https://blisstracker.app/pricing" />
        <meta property="og:url" content="https://blisstracker.app/pricing" />
        <meta property="og:title" content="Pricing — BlissTracker" />
        <meta property="og:description" content="Pricing simple para agencias que crecen. Gratis hasta 3 usuarios." />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center">
            <BlissLogo variant="lockup" dark={false} className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 hidden sm:inline">
              Volver
            </Link>
            <Link to="/login" className="text-sm text-gray-600 hover:text-gray-900 hidden sm:inline">
              Iniciar sesión
            </Link>
            <Link to="/register" className="text-sm bg-primary-500 hover:bg-primary-600 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              Crear cuenta
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-12 text-center">
        <span className="inline-block px-3 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-full">
          Pricing
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold mt-4 leading-tight">
          Simple para agencias que crecen.
        </h1>
        <p className="text-lg text-gray-600 mt-4 max-w-2xl mx-auto">
          Empezás gratis hasta 3 usuarios. Cuando crece el equipo, pagás solo por seat activo. Sin trampas, sin contratos anuales obligatorios, sin tarjeta de crédito para arrancar.
        </p>
      </section>

      {/* ── 3 Planes ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 grid md:grid-cols-3 gap-6">
        {/* Gratis */}
        <div className="border border-gray-200 rounded-2xl p-6 bg-white flex flex-col">
          <h2 className="text-2xl font-bold">Gratis</h2>
          <p className="text-gray-500 text-sm mt-1">Para equipos pequeños que arrancan.</p>
          <div className="mt-6">
            <span className="text-5xl font-bold">$0</span>
            <span className="text-gray-500 ml-1">/mes</span>
          </div>
          <ul className="mt-6 space-y-3 text-sm text-gray-700 flex-1">
            <li>✓ Hasta 3 usuarios</li>
            <li>✓ Proyectos ilimitados</li>
            <li>✓ Coach de IA diario</li>
            <li>✓ Resúmenes semanales</li>
            <li>✓ Soporte por email</li>
          </ul>
          <Link to="/register"
            className="mt-6 block w-full text-center border border-gray-300 hover:border-gray-400 text-gray-800 px-5 py-3 rounded-xl font-medium transition-colors">
            Crear cuenta gratis
          </Link>
        </div>

        {/* Pro — destacado */}
        <div className="relative border-2 border-primary-500 rounded-2xl p-6 bg-white flex flex-col shadow-xl">
          <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary-500 text-white text-xs font-bold px-3 py-1 rounded-full">
            MÁS POPULAR
          </span>
          <h2 className="text-2xl font-bold">Pro</h2>
          <p className="text-gray-500 text-sm mt-1">Para agencias y equipos en crecimiento.</p>
          <div className="mt-6">
            <span className="text-5xl font-bold">$3</span>
            <span className="text-gray-500 ml-1">/usuario/mes</span>
          </div>
          <ul className="mt-6 space-y-3 text-sm text-gray-700 flex-1">
            <li>✓ Usuarios ilimitados</li>
            <li>✓ Todo lo del plan Gratis</li>
            <li>✓ <strong>Marketing toolkit completo</strong> (GEO, SEO, Ads, Social)</li>
            <li>✓ <strong>Reportes públicos para clientes</strong> (URL token)</li>
            <li>✓ Sistema EOS (Traction)</li>
            <li>✓ Panel RRHH + Productividad</li>
            <li>✓ Soporte prioritario</li>
          </ul>
          <Link to="/register"
            className="mt-6 block w-full text-center bg-primary-500 hover:bg-primary-600 text-white px-5 py-3 rounded-xl font-medium transition-colors">
            Empezar — 14 días gratis
          </Link>
        </div>

        {/* Scale */}
        <div className="border border-gray-200 rounded-2xl p-6 bg-white flex flex-col">
          <h2 className="text-2xl font-bold">Scale</h2>
          <p className="text-gray-500 text-sm mt-1">Para equipos de más de 20 personas.</p>
          <div className="mt-6">
            <span className="text-5xl font-bold">$2</span>
            <span className="text-gray-500 ml-1">/usuario/mes</span>
          </div>
          <ul className="mt-6 space-y-3 text-sm text-gray-700 flex-1">
            <li>✓ Desde 20 usuarios</li>
            <li>✓ Todo lo del plan Pro</li>
            <li>✓ Precio reducido por escala</li>
            <li>✓ Onboarding personalizado</li>
            <li>✓ Account manager dedicado</li>
            <li>✓ Límite de tokens IA negociable</li>
          </ul>
          <a href="mailto:gaston@blissmkt.ar?subject=BlissTracker%20Scale"
            className="mt-6 block w-full text-center border border-gray-300 hover:border-gray-400 text-gray-800 px-5 py-3 rounded-xl font-medium transition-colors">
            Hablemos
          </a>
        </div>
      </section>

      {/* ── Calculadora ── */}
      <section className="bg-gray-50 border-y border-gray-100 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-bold">Calculadora de costo</h2>
          <p className="text-gray-600 mt-2">Movés el deslizador y ves tu costo final. Sin sorpresas.</p>

          <div className="mt-10 bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1 text-left">
                <label className="text-sm text-gray-500">Cantidad de miembros</label>
                <div className="flex items-center gap-4 mt-2">
                  <input type="range" min="1" max="100" value={seats}
                    onChange={e => setSeats(parseInt(e.target.value, 10) || 1)}
                    className="flex-1 accent-primary-500"
                  />
                  <input type="number" min="1" max="500" value={seats}
                    onChange={e => setSeats(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-20 text-center border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-400"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 text-left">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500">Plan recomendado</p>
                <p className="text-xl font-bold mt-1">{seats <= 3 ? 'Gratis' : seats >= 20 ? 'Scale' : 'Pro'}</p>
                <p className="text-xs text-gray-500 mt-1">{seats <= 3 ? 'Sin costo' : `$${perSeat}/seat/mes`}</p>
              </div>
              <div className="bg-primary-50 rounded-xl p-4 border border-primary-100">
                <p className="text-xs text-primary-700">Costo mensual</p>
                <p className="text-3xl font-bold text-primary-700 mt-1">${monthly}</p>
                <p className="text-xs text-primary-600 mt-1">{seats <= 3 ? 'Para siempre' : 'USD / mes'}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500">Pagando anual</p>
                <p className="text-xl font-bold mt-1">${Math.round(annualPrice)}</p>
                <p className="text-xs text-green-600 mt-1">{seats > 3 ? `Ahorrás $${savings}/año` : '—'}</p>
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-6">Los precios son en USD. Stripe convierte automáticamente a tu moneda al momento del cobro.</p>
          </div>
        </div>
      </section>

      {/* ── Tabla comparativa ── */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">Compará los tres planes</h2>
          <p className="text-gray-600 mt-2">Todo lo que incluye cada uno, de un vistazo.</p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-4 font-semibold text-gray-700">Funcionalidad</th>
                <th className="text-center px-5 py-4 font-semibold text-gray-700">Gratis</th>
                <th className="text-center px-5 py-4 font-semibold text-primary-700 bg-primary-50">Pro</th>
                <th className="text-center px-5 py-4 font-semibold text-gray-700">Scale</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map(group => (
                <>
                  <tr key={group.group} className="bg-gray-50/50 border-b border-gray-100">
                    <td colSpan={4} className="px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {group.group}
                    </td>
                  </tr>
                  {group.rows.map((row, i) => (
                    <tr key={`${group.group}-${i}`} className="border-b border-gray-100">
                      <td className="px-5 py-3 text-gray-800">{row.feature}</td>
                      <td className="px-5 py-3 text-center"><Cell v={row.free} /></td>
                      <td className="px-5 py-3 text-center bg-primary-50/30"><Cell v={row.pro} /></td>
                      <td className="px-5 py-3 text-center"><Cell v={row.scale} /></td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Garantías ── */}
      <section className="bg-gray-50 border-y border-gray-100 py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { icon: '💳', title: 'Sin tarjeta', desc: 'Te registrás sin tarjeta de crédito y arrancás.' },
            { icon: '🛑', title: 'Cancelás cuando quieras', desc: 'Un click en /billing y listo. Sin permanencia.' },
            { icon: '📦', title: 'Datos exportables', desc: 'Todo tu workspace en JSON, cuando quieras.' },
            { icon: '🇦🇷', title: 'Soporte en español', desc: 'Atendemos rápido y en tu idioma.' },
          ].map(g => (
            <div key={g.title} className="text-center">
              <div className="text-3xl">{g.icon}</div>
              <p className="font-semibold text-gray-900 mt-2">{g.title}</p>
              <p className="text-xs text-gray-500 mt-1 leading-snug">{g.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
        <h2 className="text-3xl font-bold text-center">Preguntas sobre el pricing</h2>
        <div className="mt-10 space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="border border-gray-200 rounded-xl bg-white">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full px-5 py-4 flex items-center justify-between text-left">
                <span className="font-medium text-gray-900">{f.q}</span>
                <span className={`text-primary-500 text-xl transition-transform duration-200 ${openFaq === i ? 'rotate-45' : ''}`}>+</span>
              </button>
              {openFaq === i && (
                <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">{f.a}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="bg-gray-900 text-white py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold">¿Listo para empezar?</h2>
          <p className="text-gray-300 mt-3">Crear tu workspace toma menos de 60 segundos.</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register"
              className="inline-block bg-primary-500 hover:bg-primary-600 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors shadow-lg">
              Probá 14 días gratis →
            </Link>
            <a href="mailto:gaston@blissmkt.ar?subject=Quiero%20saber%20m%C3%A1s%20de%20BlissTracker"
              className="inline-block border border-gray-700 hover:border-gray-500 text-gray-200 px-8 py-4 rounded-xl font-semibold text-lg transition-colors">
              Hablar con Gastón
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-gray-950 text-gray-500 border-t border-gray-800 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <BlissLogo variant="lockup" dark className="h-5 w-auto" />
            <span>© {new Date().getFullYear()} BlissTracker</span>
          </div>
          <div className="flex gap-5">
            <Link to="/condiciones" className="hover:text-gray-300">Condiciones</Link>
            <Link to="/privacidad"  className="hover:text-gray-300">Privacidad</Link>
            <Link to="/"            className="hover:text-gray-300">Inicio</Link>
            <Link to="/login"       className="hover:text-gray-300">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
