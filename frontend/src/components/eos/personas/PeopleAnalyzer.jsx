import { computePeopleScore, scoreBand } from '../../../utils/peopleScore'
import RoleBadge from '../../RoleBadge'
import { Avatar } from './personasUI'

// ═══════════════════════════════════════════════════════════════════════════════
// Analizador de Personas
// ═══════════════════════════════════════════════════════════════════════════════

const RATING_CYCLE = [null, '+', '+/-', '-']
const RATING_LABEL = { '+': '+', '+/-': '+/-', '-': '−' }
const RATING_COLOR = {
  '+':   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-green-200 dark:border-green-800',
  '+/-': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  '-':   'bg-red-100   text-red-700   dark:bg-red-900/40   dark:text-red-400   border-red-200   dark:border-red-800',
  null:  'bg-gray-100  text-gray-400  dark:bg-gray-700     dark:text-gray-500  border-gray-200  dark:border-gray-600',
}

const GWC_COLUMNS = [
  { key: 'gwc_get',      label: 'G',  title: '¿Lo entiende?' },
  { key: 'gwc_want',     label: 'W',  title: '¿Lo quiere?' },
  { key: 'gwc_capacity', label: 'C',  title: '¿Tiene capacidad?' },
]

function PeopleScoreSummary({ score, rightPeople, total }) {
  const band = scoreBand(score)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
      {/* People Score */}
      <div className={`rounded-xl border p-4 ${band.ring}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">People Score del equipo</p>
        <div className="flex items-baseline gap-2 mt-1">
          <span className={`text-3xl font-bold ${band.text}`}>{score != null ? `${score}%` : '—'}</span>
          <span className={`text-xs font-medium ${band.text}`}>{band.label}</span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${band.bar}`} style={{ width: `${score ?? 0}%` }} />
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 leading-snug">
          Promedio de las calificaciones: <span className="font-medium">+</span> = 100% · <span className="font-medium">+/−</span> = 50% · <span className="font-medium">−</span> = 0%
        </p>
      </div>

      {/* Personas correctas */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Personas correctas en el asiento</p>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-3xl font-bold text-gray-900 dark:text-white">{rightPeople}<span className="text-xl text-gray-400 dark:text-gray-500">/{total}</span></span>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 leading-snug">
          Con <span className="font-medium text-green-600 dark:text-green-400">+</span> en <strong>todos</strong> sus valores medulares y en G, W y C.
        </p>
      </div>
    </div>
  )
}

export default function PeopleAnalyzer({ members, coreValues, ratingsMap, onRatingChange, readOnly = false }) {
  if (coreValues.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Primero definí los <strong className="text-gray-700 dark:text-gray-300">Valores Medulares</strong> en la sección Visión para poder evaluar a las personas.
        </p>
      </div>
    )
  }

  const allColumns = [
    ...coreValues.map(v => {
      const name = typeof v === 'string' ? v : v?.name ?? ''
      const desc = typeof v === 'object' && v?.description ? ` — ${v.description}` : ''
      return {
        key:   name,
        label: name.length > 12 ? name.slice(0, 11) + '…' : name,
        title: name + desc,
        isGwc: false,
      }
    }),
    ...GWC_COLUMNS.map(g => ({ ...g, isGwc: true })),
  ]

  function nextRating(current) {
    const idx = RATING_CYCLE.indexOf(current ?? null)
    return RATING_CYCLE[(idx + 1) % RATING_CYCLE.length]
  }

  const { score, rightPeople, total } = computePeopleScore(members, allColumns.map(c => c.key), ratingsMap)

  return (
    <>
    <PeopleScoreSummary score={score} rightPeople={rightPeople} total={total} />
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400 min-w-[140px]">Persona</th>
            {allColumns.map((col, i) => (
              <th key={col.key} className={`sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-2 px-1 text-center text-xs font-medium min-w-[44px] ${
                col.isGwc && i === coreValues.length ? 'pl-4 border-l border-gray-200 dark:border-gray-700' : ''
              }`}>
                <span title={col.title}
                  className={`block truncate ${col.isGwc ? 'text-primary-600 dark:text-primary-400' : 'text-gray-500 dark:text-gray-400'}`}>
                  {col.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {members.map(member => {
            const userRatings = ratingsMap[member.id] || {}
            return (
              <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <Avatar src={member.avatar} name={member.name} />
                    <div className="min-w-0">
                      <span className="block text-sm text-gray-800 dark:text-gray-200 truncate max-w-[120px]">{member.name}</span>
                      <RoleBadge role={member.teamRole} userId={member.id} className="inline-block mt-0.5" />
                    </div>
                  </div>
                </td>
                {allColumns.map((col, i) => {
                  const rating = userRatings[col.key] ?? null
                  return (
                    <td key={col.key} className={`py-2 px-1 text-center ${
                      col.isGwc && i === coreValues.length ? 'pl-4 border-l border-gray-200 dark:border-gray-700' : ''
                    }`}>
                      <button
                        onClick={() => !readOnly && onRatingChange(member.id, col.key, nextRating(rating))}
                        disabled={readOnly}
                        title={readOnly ? col.title : `${col.title} — clic para cambiar`}
                        className={`w-10 h-7 rounded-lg text-xs font-semibold border transition-colors ${RATING_COLOR[rating]} ${readOnly ? 'cursor-default' : ''}`}>
                        {rating ? RATING_LABEL[rating] : '·'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
        {[
          { r: '+',   label: 'Por encima de las expectativas' },
          { r: '+/-', label: 'Cumple las expectativas' },
          { r: '-',   label: 'Por debajo de las expectativas' },
        ].map(({ r, label }) => (
          <div key={r} className="flex items-center gap-1.5">
            <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-semibold border ${RATING_COLOR[r]}`}>{RATING_LABEL[r]}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-4 pl-4 border-l border-gray-200 dark:border-gray-700">
          <span className="text-xs font-bold text-primary-600 dark:text-primary-400">GWC</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">Get it · Want it · Capacity to do it</span>
        </div>
      </div>
    </div>
    </>
  )
}
