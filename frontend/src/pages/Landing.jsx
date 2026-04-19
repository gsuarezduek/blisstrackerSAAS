import { Link } from 'react-router-dom'
import { useState } from 'react'

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
      title: 'Invitás a tu equipo',
      desc: 'Mandás invitaciones por email. Cada persona acepta y empieza a trabajar. Sin onboarding eterno.',
    },
    {
      step: '03',
      title: 'Ejecutan con foco',
      desc: 'El coach de IA guía las prioridades de cada uno. Vos ves el avance en tiempo real.',
    },
  ]

  const faqs = [
    {
      q: '¿Es gratis para siempre hasta 3 usuarios?',
      a: 'Sí. Podés usar BlissTracker sin costo con hasta 3 usuarios, sin límite de tiempo y sin tarjeta de crédito.',
    },
    {
      q: '¿Cómo funciona el coach de IA?',
      a: 'Cada mañana, el coach analiza tus tareas pendientes, tu historial de trabajo y tu rol para sugerirte en qué enfocarte primero. No es un chat genérico: conoce tu contexto real y aprende semana a semana.',
    },
    {
      q: '¿Puedo tener múltiples proyectos y clientes?',
      a: 'Sí. Podés crear todos los proyectos que necesites, asignar miembros del equipo y ver el trabajo organizado por cliente. Sin mezclas.',
    },
    {
      q: '¿Cómo se compara con Asana, Trello o Notion?',
      a: 'Esas herramientas son para organizar. BlissTracker es para ejecutar. Menos configuración, más foco en lo que importa hoy. Especialmente para agencias y equipos de servicio.',
    },
    {
      q: '¿Qué pasa cuando termina el trial de 14 días?',
      a: 'Si tenés hasta 3 usuarios, seguís gratis para siempre. Si tenés más, activás el plan Pro: USD 3 por usuario por mes. Podés cancelar cuando quieras.',
    },
  ]

  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">

      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <img src="/blisstracker_logo.svg" alt="BlissTracker" className="w-7 h-7" />
            <span className="font-bold text-lg text-gray-900">BlissTracker</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
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
            Gratis hasta 3 usuarios — sin tarjeta de crédito
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-gray-900 leading-[1.08] tracking-tight mb-6">
            Menos ruido.<br />
            <span className="text-primary-500">Más ejecución.</span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
            BlissTracker le da a tu equipo el foco que las hojas de cálculo, los chats
            y las reuniones les robaron.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <Link
              to="/register"
              className="w-full sm:w-auto bg-primary-500 hover:bg-primary-600 text-white text-base font-semibold px-8 py-4 rounded-xl transition-colors shadow-lg shadow-primary-100"
            >
              Crear cuenta gratis →
            </Link>
            <a
              href="#como-funciona"
              className="w-full sm:w-auto text-gray-700 hover:text-gray-900 text-base font-medium px-8 py-4 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
            >
              Ver cómo funciona
            </a>
          </div>
          <p className="text-xs text-gray-400">14 días de trial gratuito · Sin configuración complicada</p>
        </div>

        {/* App mockup */}
        <div className="max-w-5xl mx-auto mt-16 px-2 sm:px-0">
          <AppMockup />
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="py-24 px-4 sm:px-6 bg-gray-900">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
              Reconocés esto, ¿no?
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              El problema no es que tu equipo no trabaja. Es que trabaja en lo que no importa.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                emoji: '📋',
                title: 'Demasiadas listas, ningún avance',
                desc: 'Tenés Notion, Trello y un Excel compartido. Las tareas se crean. Las tareas... se quedan ahí.',
              },
              {
                emoji: '🤷',
                title: '¿En qué está trabajando cada uno?',
                desc: 'Para saber en qué está alguien, hay que preguntarle. Eso no escala. Y nadie lo reconoce hasta que es tarde.',
              },
              {
                emoji: '🔥',
                title: 'Todo es urgente, nada es prioritario',
                desc: 'Sin foco claro, el equipo trabaja lo que llega primero. No lo que mueve la aguja del negocio.',
              },
            ].map((item, i) => (
              <div key={i} className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
                <div className="text-3xl mb-4">{item.emoji}</div>
                <h3 className="text-white font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solution ── */}
      <section className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">
            La solución
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-6">
            BlissTracker no es otro gestor de tareas.
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
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
                <Link
                  to="/register"
                  className="block w-full text-center border border-gray-300 hover:border-gray-400 text-gray-700 hover:text-gray-900 font-semibold py-3 rounded-xl transition-colors"
                >
                  Contactar ventas
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Preguntas frecuentes
            </h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <FaqItem
                key={i}
                q={faq.q}
                a={faq.a}
                open={openFaq === i}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-24 px-4 sm:px-6 bg-gray-900 text-center">
        <div className="max-w-2xl mx-auto">
          <img src="/blisstracker_logo.svg" alt="" className="w-14 h-14 mx-auto mb-5 opacity-90" />
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 leading-tight">
            Tu equipo puede ejecutar mejor.<br />Empezá hoy.
          </h2>
          <p className="text-gray-400 text-lg mb-8">
            14 días gratis. Sin tarjeta de crédito. Sin configuración complicada.
          </p>
          <Link
            to="/register"
            className="inline-block bg-primary-500 hover:bg-primary-600 text-white text-base font-semibold px-10 py-4 rounded-xl transition-colors shadow-lg shadow-primary-900/30"
          >
            Crear cuenta gratis →
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 px-4 sm:px-6 bg-gray-950 border-t border-gray-800">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <img src="/blisstracker_logo.svg" alt="" className="w-5 h-5 opacity-60" />
            <span>BlissTracker &copy; {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/login"    className="hover:text-gray-300 transition-colors">Iniciar sesión</Link>
            <Link to="/register" className="hover:text-gray-300 transition-colors">Crear cuenta</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}
