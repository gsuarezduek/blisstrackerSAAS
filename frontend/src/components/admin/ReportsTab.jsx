import { useState, useEffect } from 'react'
import api from '../../api/client'
import { fmtMins } from '../../utils/format'

function thisWeekRange() {
  const now = new Date()
  const day = now.getDay() || 7
  const mon = new Date(now)
  mon.setDate(now.getDate() - day + 1)
  return {
    from: mon.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  }
}

export default function ReportsTab() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState(thisWeekRange().from)
  const [to, setTo] = useState(thisWeekRange().to)
  const [expanded, setExpanded] = useState(null)

  async function loadReport() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.append('from', from)
      if (to) params.append('to', to)
      const { data: res } = await api.get(`/reports/by-project?${params}`)
      setData(res.sort((a, b) => b.totalMinutes - a.totalMinutes))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReport() }, [])

  const totalMins = data.reduce((s, d) => s + d.totalMinutes, 0)

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-4">Reporte de tiempo por proyecto</h2>

      {/* Filters */}
      <div className="flex gap-3 mb-6 items-end">
        <div>
          <label className="text-xs font-medium text-gray-600">Desde</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Hasta</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <button onClick={loadReport} disabled={loading}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
          {loading ? 'Cargando...' : 'Ver reporte'}
        </button>
      </div>

      {/* Summary */}
      {data.length > 0 && (
        <div className="bg-primary-50 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
          <span className="text-sm text-primary-700 font-medium">Tiempo total registrado</span>
          <span className="text-xl font-bold text-primary-700">{fmtMins(totalMins)}</span>
        </div>
      )}

      {/* Per project */}
      <div className="space-y-3">
        {data.map(d => (
          <div key={d.project.id} className="bg-white border rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              onClick={() => setExpanded(expanded === d.project.id ? null : d.project.id)}
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-800">{d.project.name}</span>
                <span className="text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5">{d.taskCount} tareas</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-primary-600">{fmtMins(d.totalMinutes)}</span>
                <span className="text-gray-400 text-sm">{expanded === d.project.id ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* Progress bar */}
            <div className="px-4 pb-3">
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-primary-500 h-1.5 rounded-full"
                  style={{ width: totalMins ? `${(d.totalMinutes / totalMins) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {/* Breakdown by user */}
            {expanded === d.project.id && (
              <div className="border-t px-4 py-3 space-y-2 bg-gray-50">
                {d.byUser.sort((a, b) => b.minutes - a.minutes).map(u => (
                  <div key={u.user.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-700">{u.user.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{u.tasks} tarea{u.tasks !== 1 ? 's' : ''}</span>
                    </div>
                    <span className="text-gray-600">{fmtMins(u.minutes)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {data.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">📊</p>
          <p>No hay datos para el período seleccionado</p>
        </div>
      )}
    </div>
  )
}
