import { Fragment } from 'react'

/**
 * Tabla comparativa de la landing: BlissTracker vs Asana vs Notion vs SEMrush.
 * Filas agrupadas por categoría (Ejecución / Marketing / EOS / Ventas / RRHH / Precio),
 * con sub-headers, para que alguien que no hace SEO/Ads pueda saltear las filas de
 * Marketing y seguir viendo 6+ filas que sí le aplican (no todo el diferencial es SEO).
 */

const GROUPS = [
  {
    group: 'Ejecución (siempre activo)',
    rows: [
      { feature: 'Gestión de tareas y proyectos',                bt: true, asana: true,             notion: true,      semrush: false },
      { feature: 'Foco forzado (una tarea activa por persona)',   bt: true, asana: false,            notion: false,     semrush: false },
      { feature: 'Coach IA contextual con memoria semanal',       bt: true, asana: 'Básico',          notion: 'Básico',  semrush: false },
    ],
  },
  {
    group: 'Marketing (módulo opcional)',
    rows: [
      { feature: 'GEO Audit (AI Overviews, ChatGPT, Perplexity)', bt: true, asana: false,            notion: false,     semrush: false },
      { feature: 'SEO + Search Console + keyword tracking',       bt: true, asana: false,            notion: false,     semrush: true },
      { feature: 'Meta Ads + Google Ads + Instagram + TikTok',    bt: true, asana: false,            notion: false,     semrush: 'Parcial' },
      { feature: 'Informes mensuales con URL pública (cliente)',  bt: true, asana: false,            notion: false,     semrush: 'Limitado' },
    ],
  },
  {
    group: 'EOS / Traction (módulo opcional)',
    rows: [
      { feature: 'Sistema EOS / Traction nativo',                 bt: true, asana: false,            notion: false,     semrush: false },
    ],
  },
  {
    group: 'Ventas (módulo opcional)',
    rows: [
      { feature: 'CRM comercial (pipeline + propuestas con IA)',  bt: true, asana: false,            notion: false,     semrush: false },
    ],
  },
  {
    group: 'RRHH',
    rows: [
      { feature: 'RRHH (vacaciones + legajos + logins)',          bt: true, asana: false,            notion: false,     semrush: false },
    ],
  },
  {
    group: 'Precio',
    rows: [
      { feature: 'Precio inicial mensual', bt: '$0 hasta 3 users', asana: '$10.99/u', notion: '$10/u', semrush: '$139.95' },
    ],
  },
]

function Cell({ v }) {
  if (v === true)  return <span className="inline-block text-primary-600 font-bold text-lg">✓</span>
  if (v === false) return <span className="inline-block text-gray-300">—</span>
  return <span className="text-gray-700 text-sm">{v}</span>
}

export default function ComparisonTable() {
  return (
    <section className="py-24 px-4 sm:px-6 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-primary-500 font-semibold text-xs uppercase tracking-widest mb-4">
            Comparativa
          </p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            BlissTracker vs el stack típico de una agencia
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            Agrupado por categoría — si no usás alguno de los módulos opcionales, saltealo y mirá el resto.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-4 font-semibold text-gray-700">Funcionalidad</th>
                <th className="text-center px-5 py-4 font-bold text-primary-700 bg-primary-50">BlissTracker</th>
                <th className="text-center px-5 py-4 font-semibold text-gray-700">Asana</th>
                <th className="text-center px-5 py-4 font-semibold text-gray-700">Notion</th>
                <th className="text-center px-5 py-4 font-semibold text-gray-700">SEMrush</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((g) => (
                <Fragment key={g.group}>
                  <tr className="bg-gray-100/70 border-b border-gray-200">
                    <td colSpan={5} className="px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      {g.group}
                    </td>
                  </tr>
                  {g.rows.map((row, i) => (
                    <tr key={`${g.group}-${i}`} className="border-b border-gray-100 last:border-0">
                      <td className="px-5 py-3.5 text-gray-800">{row.feature}</td>
                      <td className="px-5 py-3.5 text-center bg-primary-50/40"><Cell v={row.bt} /></td>
                      <td className="px-5 py-3.5 text-center"><Cell v={row.asana} /></td>
                      <td className="px-5 py-3.5 text-center"><Cell v={row.notion} /></td>
                      <td className="px-5 py-3.5 text-center"><Cell v={row.semrush} /></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Precios consultados a mayo 2026 · Comparación hecha por funcionalidades, no por ticket equivalente.
        </p>
      </div>
    </section>
  )
}
