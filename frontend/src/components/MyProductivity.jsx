import { useState, useEffect } from 'react'
import api from '../api/client'

const fmtHours = h => (h >= 1 ? `${Math.round(h * 10) / 10}h` : h > 0 ? `${Math.round(h * 60)}m` : '—')

// Sparkline de horas por semana (últimas 12).
function Sparkline({ history }) {
  const data = history || []
  if (data.length === 0) return null
  const W = 480, H = 60, padT = 6, padB = 6
  const max = Math.max(...data.map(d => d.hours), 1)
  const n = data.length
  const x = i => (n === 1 ? W / 2 : (i * W) / (n - 1))
  const y = v => padT + (H - padT - padB) - (v / max) * (H - padT - padB)
  const points = data.map((d, i) => `${x(i).toFixed(1)},${y(d.hours).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 70 }} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="#F7931A" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {data.map((d, i) => i === n - 1 && <circle key={i} cx={x(i)} cy={y(d.hours)} r="3" fill="#F7931A" />)}
    </svg>
  )
}

// Métrica con comparación opcional contra la mediana del equipo (anónima).
function Metric({ label, value, team, hint }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl px-4 py-3">
      <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums leading-none">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
      {team != null && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">equipo {team}</p>}
      {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>}
    </div>
  )
}

// Nota suave que reemplaza al semáforo crudo (no expone etiquetas "down"/"stuck").
function softNote(d) {
  if (!d.hasData) return null
  if (d.status === 'up') return { cls: 'text-green-700 dark:text-green-400', text: '💪 Vas por encima de tu ritmo del mes pasado.' }
  if (d.stats.stuckTasks > 0) return { cls: 'text-amber-700 dark:text-amber-400', text: `Tenés ${d.stats.stuckTasks} tarea${d.stats.stuckTasks !== 1 ? 's' : ''} frenada${d.stats.stuckTasks !== 1 ? 's' : ''} hace más de una semana — quizá valga la pena retomarlas o cerrarlas.` }
  if (d.status === 'inactive' || d.status === 'down') return { cls: 'text-gray-600 dark:text-gray-300', text: 'Tu ritmo bajó respecto al mes pasado. Puede ser un buen momento para reorganizar prioridades.' }
  return null
}

export default function MyProductivity() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api.get('/reports/mine/productivity')
      .then(({ data }) => { if (active) setData(data) })
      .catch(() => { if (active) setData(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  if (loading) return null
  if (!data) return null

  const s = data.stats
  const b = data.benchmark
  const util = s.utilization != null ? `${Math.round(s.utilization * 100)}%` : '—'
  const utilTeam = b?.utilizationMedian != null ? `${Math.round(b.utilizationMedian * 100)}%` : null
  const note = softNote(data)
  const ins = data.insight

  return (
    <section className="mb-8 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2 mb-3 flex-wrap">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Mi productividad</h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">Mes en curso</span>
      </div>

      {!data.hasData ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay actividad registrada este mes.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Metric
              label="Δ horas"
              value={util}
              team={utilTeam}
              hint={s.utilization == null ? 'configurá tu horario' : undefined}
            />
            <Metric label="Tareas completadas" value={s.completed} team={b ? Math.round(b.completed) : null} />
            <Metric label="Horas registradas" value={fmtHours(s.hours)} team={b ? fmtHours(b.horas) : null} />
            <Metric label="Tasa de cierre" value={`${Math.round(s.tasaCompletado * 100)}%`} team={b ? `${Math.round(b.tasaCompletado * 100)}%` : null} />
          </div>

          {s.hoursHistory?.some(w => w.hours > 0) && (
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">Horas por semana · últimas 12</p>
              <Sparkline history={s.hoursHistory} />
            </div>
          )}

          {note && <p className={`text-sm leading-snug ${note.cls} ${ins ? 'mb-4' : ''}`}>{note.text}</p>}

          {ins && (ins.tendencias || ins.fortalezas || ins.areasDeAtencion) && (
            <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Análisis IA</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
                {ins.tendencias && <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug"><span className="text-gray-400 dark:text-gray-500">Cambio:</span> {ins.tendencias}</p>}
                {ins.fortalezas && <p className="text-sm text-green-700 dark:text-green-400 leading-snug"><span className="opacity-60">Fortaleza:</span> {ins.fortalezas}</p>}
                {ins.areasDeAtencion && <p className="text-sm text-red-700 dark:text-red-400 leading-snug"><span className="opacity-60">A mejorar:</span> {ins.areasDeAtencion}</p>}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
