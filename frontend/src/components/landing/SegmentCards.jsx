/**
 * "Elegí los módulos de tu sistema" — la ejecución diaria (core) siempre activa,
 * más los módulos opcionales (marketing / EOS / ventas) que se activan según lo
 * que la agencia use. Mismo catálogo (íconos + copy) que usa el selector de
 * módulos del onboarding y Preferencias → Módulos adicionales — para que el
 * mensaje sea consistente antes y después de registrarse.
 *
 * Reemplaza al viejo "para quién es" (Agencias/EOS/Equipos), que repetía casi
 * el mismo pitch de marketing con otro nombre y no mencionaba Ventas ni RRHH.
 */
import { Link } from 'react-router-dom'
import { MODULE_CATALOG } from '../../lib/moduleCatalog'

const TILES = [
  {
    id: 'core',
    primary: true,
    icon: '🎯',
    label: 'Siempre activo',
    title: 'Ejecución diaria',
    desc: 'La base de todo workspace, sin activar nada: tareas con foco forzado, coach de IA, visibilidad de equipo en vivo y reportes semanales.',
    bullets: [
      'Una tarea activa a la vez por persona',
      'Coach de IA con prioridades cada mañana',
      'Reuniones con cronómetro que cuenta el tiempo',
    ],
  },
  {
    id: 'marketing',
    icon: MODULE_CATALOG.marketing.icon,
    label: 'Módulo opcional',
    title: MODULE_CATALOG.marketing.label,
    desc: 'Para agencias con servicios digitales.',
    bullets: [
      'GEO Audit para IA (ChatGPT, Perplexity, AI Overviews)',
      'SEO + Search Console + keyword tracking',
      'Meta Ads + Google Ads + Social + informes con URL pública',
    ],
    to: '/soluciones/marketing',
  },
  {
    id: 'eos',
    icon: MODULE_CATALOG.eos.icon,
    label: 'Módulo opcional',
    title: MODULE_CATALOG.eos.label,
    desc: 'Para empresas con el sistema Traction ya implementado.',
    bullets: [
      'Visión + Personas (GWC) + Datos + Asuntos + Procesos',
      'Rocks trimestrales + reunión L10 semanal',
      'Evaluación organizacional con análisis IA',
    ],
    to: '/soluciones/eos',
  },
  {
    id: 'ventas',
    icon: MODULE_CATALOG.ventas.icon,
    label: 'Módulo opcional',
    title: MODULE_CATALOG.ventas.label,
    desc: 'Para equipos con su propio proceso comercial.',
    bullets: [
      'Pipeline de leads, empresas y contactos',
      'Investigación de empresas + propuestas con IA',
      'Recordatorios automáticos de próxima acción',
    ],
    to: '/soluciones/ventas',
  },
]

export default function SegmentCards() {
  return (
    <section id="modulos" className="py-24 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">
            Cómo se arma tu sistema
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            Un sistema, los módulos que necesites
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            La ejecución diaria siempre está activa. Sumás marketing, EOS o ventas cuando tu
            agencia los use — sin cambiar de sistema, y los podés prender o apagar cuando quieras.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {TILES.map(t => (
            <div key={t.id}
              className={`rounded-2xl p-6 flex flex-col ${
                t.primary
                  ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-200'
                  : 'bg-gray-50 border border-gray-200 text-gray-900'
              }`}>
              <span className="text-2xl mb-2">{t.icon}</span>
              <span className={`text-xs font-bold uppercase tracking-wider ${t.primary ? 'text-primary-100' : 'text-gray-500'}`}>
                {t.label}
              </span>
              <h3 className={`text-lg font-bold mt-1 ${t.primary ? '' : 'text-gray-900'}`}>{t.title}</h3>
              <p className={`text-sm mt-2 ${t.primary ? 'text-white/90' : 'text-gray-600'} leading-relaxed`}>
                {t.desc}
              </p>
              <ul className={`mt-4 space-y-1.5 text-sm flex-1 ${t.primary ? 'text-white/90' : 'text-gray-700'}`}>
                {t.bullets.map((b, i) => (
                  <li key={i} className="leading-snug">
                    <span className={t.primary ? 'text-primary-100' : 'text-primary-500'}>✓</span> {b}
                  </li>
                ))}
              </ul>
              {!t.primary && t.to && (
                <Link to={t.to} className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary-600 hover:text-primary-700">
                  Conocé más <span>→</span>
                </Link>
              )}
              {t.primary && (
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
