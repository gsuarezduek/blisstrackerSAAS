/**
 * "Para quién es BlissTracker" — 3 cards: Agencias (primaria, expandida) + EOS + Equipos técnicos.
 * Las sub-páginas /agencias /eos /equipos no existen aún en este MVP; los cards solo presentan.
 */
import { Link } from 'react-router-dom'

const SEGMENTS = [
  {
    id: 'agencias',
    primary: true,
    label: 'Agencias de marketing',
    title: 'El sistema operativo de tu agencia',
    desc: 'GEO audits + SEO + Ads + Social + reportes para clientes con URL pública. Un dashboard reemplaza Asana + SEMrush + 6 spreadsheets.',
    bullets: [
      'GEO Audit para AI Overviews (Perplexity, ChatGPT, Claude)',
      'SEO + Search Console + keyword tracking + SERP snapshots',
      'Meta Ads + Google Ads + Instagram + TikTok',
      'Informes mensuales con URL pública para clientes',
    ],
  },
  {
    id: 'eos',
    label: 'Empresas con EOS / Traction',
    title: 'Tu sistema Traction, sin cambiar de app',
    desc: 'Los 7 módulos del libro de Wickman integrados en el mismo task tracker. Issues → Rocks → Tareas, todo conectado.',
    bullets: [
      'Visión + Personas (GWC) + Datos + Asuntos + Procesos',
      'Rocks trimestrales + L10 semanal',
      'Evaluación organizacional con análisis IA',
    ],
  },
  {
    id: 'equipos',
    label: 'Equipos técnicos y operativos',
    title: 'Foco forzado + IA coach contextual',
    desc: 'Una tarea activa a la vez. Auto-pausa por inactividad. IA que aprende tu rol y tus patrones semanales.',
    bullets: [
      'Coach IA con memoria semanal de aprendizaje',
      'Bloqueos con razón que notifican al equipo',
      'Workdays automáticos + carryover de pendientes',
    ],
  },
]

export default function SegmentCards() {
  return (
    <section id="para-quien-es" className="py-24 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">
            Para quién es
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            Hecho para agencias. Útil para más.
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            Nuestro foco son las agencias de marketing, pero el producto crece bien con otros equipos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SEGMENTS.map(s => (
            <div key={s.id}
              className={`rounded-2xl p-7 flex flex-col ${
                s.primary
                  ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-200'
                  : 'bg-gray-50 border border-gray-200 text-gray-900'
              }`}>
              <span className={`text-xs font-bold uppercase tracking-wider ${s.primary ? 'text-primary-100' : 'text-gray-500'}`}>
                {s.label}
              </span>
              <h3 className={`text-xl font-bold mt-2 ${s.primary ? '' : 'text-gray-900'}`}>{s.title}</h3>
              <p className={`text-sm mt-2 ${s.primary ? 'text-white/90' : 'text-gray-600'} leading-relaxed`}>
                {s.desc}
              </p>
              <ul className={`mt-4 space-y-1.5 text-sm flex-1 ${s.primary ? 'text-white/90' : 'text-gray-700'}`}>
                {s.bullets.map((b, i) => (
                  <li key={i}>
                    <span className={s.primary ? 'text-primary-100' : 'text-primary-500'}>✓</span> {b}
                  </li>
                ))}
              </ul>
              {s.primary && (
                <Link to="/register"
                  className="mt-6 inline-block text-center bg-white text-primary-600 hover:bg-primary-50 px-5 py-3 rounded-xl font-semibold transition-colors">
                  Probar 14 días gratis
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
