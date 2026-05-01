/**
 * ReportViewer — componente compartido para el informe mensual.
 * Se usa tanto en la URL pública (/report/:token) como en el tab interno (InformesTab).
 *
 * Props:
 *   data       — objeto { project, month, sections, analysis, connectedTypes }
 *   objectives — objeto con targets (puede ser {})
 *   isPublic   — boolean: true en la URL del cliente (sin edición)
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n, decimals = 0) {
  if (n == null) return '—'
  return Number(n).toLocaleString('es-AR', { maximumFractionDigits: decimals })
}

function fmtDuration(secs) {
  if (!secs) return '0s'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

function monthLabel(month) {
  if (!month) return ''
  const [y, m] = month.split('-').map(Number)
  const date = new Date(y, m - 1, 1)
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

function geoBandColor(band) {
  if (band === 'Excelente') return { stroke: '#3b82f6', text: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20'   }
  if (band === 'Bueno')     return { stroke: '#22c55e', text: 'text-green-600',  bg: 'bg-green-50 dark:bg-green-900/20' }
  if (band === 'Base')      return { stroke: '#eab308', text: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20'}
  return                           { stroke: '#ef4444', text: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20'     }
}

function DeltaChip({ delta, invert = false }) {
  if (delta == null) return null
  const good  = invert ? delta < 0 : delta > 0
  const color = good ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
  return (
    <span className={`text-xs font-semibold ${color}`}>
      {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}%
    </span>
  )
}

// Score ring SVG
function ScoreRing({ score, band }) {
  if (score == null) return null
  const r      = 52
  const circ   = 2 * Math.PI * r
  const filled = (score / 100) * circ
  const colors = geoBandColor(band)

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="65" cy="65" r={r} fill="none"
          stroke={colors.stroke} strokeWidth="10"
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 65 65)"
        />
        <text x="65" y="60" textAnchor="middle" fontSize="26" fontWeight="700" fill="currentColor" className="fill-gray-900 dark:fill-white">{score}</text>
        <text x="65" y="78" textAnchor="middle" fontSize="12" fill="#94a3b8">/100</text>
      </svg>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>{band}</span>
    </div>
  )
}

// Barra horizontal simple (SVG)
function BarChart({ items, maxVal, color = '#f97316' }) {
  if (!items || items.length === 0) return null
  const max = maxVal || Math.max(...items.map(i => i.value), 1)
  return (
    <div className="space-y-1.5">
      {items.slice(0, 5).map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-28 truncate text-right">{item.label}</span>
          <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max((item.value / max) * 100, 2)}%`, backgroundColor: color }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-12 text-right">{fmt(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

// Línea SVG de evolución (mini line chart)
function LineChart({ points, color = '#f97316', height = 60, showLabels = true }) {
  if (!points || points.length < 2) return null
  const values = points.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 300
  const h = height
  const pad = 12

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2)
    const y = h - pad - ((p.value - min) / range) * (h - pad * 2)
    return { x, y, ...p }
  })

  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')
  const areaD = `${pathD} L ${coords[coords.length - 1].x} ${h - pad} L ${coords[0].x} ${h - pad} Z`

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#chartGrad)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="3" fill={color} />
        ))}
      </svg>
      {showLabels && (
        <div className="flex justify-between mt-1">
          {coords.map((c, i) => (
            <span key={i} className="text-xs text-gray-400 dark:text-gray-500">{c.label}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Secciones ────────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children, className = '' }) {
  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 ${className}`}>
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h3>
      {children}
    </div>
  )
}

function KpiGrid({ items }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item, i) => (
        <div key={i} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-gray-900 dark:text-white">{item.value ?? '—'}</p>
          {item.delta !== undefined && <DeltaChip delta={item.delta} invert={item.invertDelta} />}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.label}</p>
        </div>
      ))}
    </div>
  )
}

// Tabla de objetivos vs real
function ObjectivesTable({ objectives, sections }) {
  const rows = []

  if (objectives.sessions != null && sections.analytics) {
    const real = sections.analytics.sessions ?? 0
    const pct  = Math.round((real / objectives.sessions) * 100)
    rows.push({ label: 'Sesiones web', target: fmt(objectives.sessions), real: fmt(real), pct })
  }
  if (objectives.newUsers != null && sections.analytics) {
    const real = sections.analytics.newUsers ?? 0
    const pct  = Math.round((real / objectives.newUsers) * 100)
    rows.push({ label: 'Usuarios nuevos', target: fmt(objectives.newUsers), real: fmt(real), pct })
  }
  if (objectives.followersIg != null && sections.instagram) {
    const real = sections.instagram.followersCount ?? 0
    const pct  = Math.round((real / objectives.followersIg) * 100)
    rows.push({ label: 'Seguidores Instagram', target: fmt(objectives.followersIg), real: fmt(real), pct })
  }
  if (objectives.followersTk != null && sections.tiktok) {
    const real = sections.tiktok.followersCount ?? 0
    const pct  = Math.round((real / objectives.followersTk) * 100)
    rows.push({ label: 'Seguidores TikTok', target: fmt(objectives.followersTk), real: fmt(real), pct })
  }
  if (objectives.engagementIg != null && sections.instagram) {
    const real = sections.instagram.engagementRate ?? 0
    const pct  = Math.round((real / objectives.engagementIg) * 100)
    rows.push({ label: 'Engagement Instagram', target: `${objectives.engagementIg}%`, real: `${real?.toFixed(2) ?? '—'}%`, pct })
  }
  if (objectives.conversions != null && sections.analytics) {
    const real = sections.analytics.conversions ?? 0
    const pct  = Math.round((real / objectives.conversions) * 100)
    rows.push({ label: 'Conversiones', target: fmt(objectives.conversions), real: fmt(real), pct })
  }

  if (rows.length === 0) return null

  return (
    <SectionCard title="Objetivos del mes" icon="🎯">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Métrica</th>
              <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Objetivo</th>
              <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Real</th>
              <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Cumplimiento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                <td className="py-2.5 text-gray-700 dark:text-gray-300">{row.label}</td>
                <td className="py-2.5 text-right text-gray-500 dark:text-gray-400">{row.target}</td>
                <td className="py-2.5 text-right font-semibold text-gray-900 dark:text-white">{row.real}</td>
                <td className="py-2.5 text-right">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                    row.pct >= 90 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : row.pct >= 70 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>{row.pct}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ReportViewer({ data, objectives = {}, isPublic = false }) {
  if (!data) return null

  const { project, month, sections, analysis } = data
  const s = sections

  // Canales de tráfico para el chart
  const channels = (() => {
    try {
      const ch = s.analytics?.topChannels || []
      return ch.map(c => ({ label: c.channel || c.channelGroup || c.sessionDefaultChannelGroup || '', value: c.sessions || 0 }))
        .filter(c => c.value > 0)
    } catch { return [] }
  })()

  // Evolución trimestral
  const evolutionPoints = (() => {
    if (!s.evolution || s.evolution.length < 2) return null
    return s.evolution.map(snap => ({
      label: snap.month?.slice(5) || '', // "MM"
      value: snap.sessions ?? 0,
    }))
  })()

  return (
    <div className={`space-y-5 ${isPublic ? 'max-w-3xl mx-auto' : ''}`}>

      {/* ── Header ── */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{project.name}</h1>
            <p className="text-gray-500 dark:text-gray-400 capitalize mt-0.5">
              Informe mensual — {monthLabel(month)}
            </p>
            {project.websiteUrl && (
              <a href={project.websiteUrl} target="_blank" rel="noreferrer"
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline mt-1 block">
                {project.websiteUrl}
              </a>
            )}
          </div>
          {s.geo && <ScoreRing score={s.geo.score} band={s.geo.band} />}
        </div>
      </div>

      {/* ── Resumen ejecutivo ── */}
      {analysis?.resumen && (
        <SectionCard title="Resumen del mes" icon="📝">
          <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line">{analysis.resumen}</p>

          {analysis.highlights?.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Logros del mes</p>
              {analysis.highlights.map((hl, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{hl}</span>
                </div>
              ))}
            </div>
          )}

          {analysis.alertas?.length > 0 && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl space-y-1">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Oportunidades de mejora</p>
              {analysis.alertas.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5 shrink-0">→</span>
                  <span className="text-sm text-amber-800 dark:text-amber-300">{a}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Objetivos ── */}
      {Object.keys(objectives).length > 0 && (
        <ObjectivesTable objectives={objectives} sections={s} />
      )}

      {/* ── Analytics GA4 ── */}
      {s.analytics && (
        <SectionCard title="Analytics web" icon="📊">
          <KpiGrid items={[
            { label: 'Sesiones',       value: fmt(s.analytics.sessions),    delta: s.analytics.delta?.sessions },
            { label: 'Usuarios nuevos', value: fmt(s.analytics.newUsers),   delta: s.analytics.delta?.newUsers },
            { label: 'Tasa de rebote', value: `${s.analytics.bounceRate?.toFixed(1) ?? '—'}%`, invertDelta: true, delta: s.analytics.delta?.sessions ? null : null },
            { label: 'Duración media', value: fmtDuration(s.analytics.avgDuration) },
          ]} />

          {channels.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Canales de tráfico</p>
              <BarChart items={channels} color="#f97316" />
            </div>
          )}
        </SectionCard>
      )}

      {/* ── RRSS: Instagram + TikTok en grid ── */}
      {(s.instagram || s.tiktok) && (
        <div className={`grid gap-5 ${s.instagram && s.tiktok ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
          {s.instagram && (
            <SectionCard title="Instagram" icon="📸">
              <KpiGrid items={[
                { label: 'Seguidores',   value: fmt(s.instagram.followersCount), delta: s.instagram.deltaFollowers },
                { label: 'Engagement',  value: s.instagram.engagementRate != null ? `${s.instagram.engagementRate.toFixed(2)}%` : '—', delta: s.instagram.deltaEngagement },
                { label: 'Avg. likes',  value: fmt(s.instagram.avgLikes, 0) },
                { label: 'Posts / mes', value: fmt(s.instagram.postsCount) },
              ]} />
            </SectionCard>
          )}

          {s.tiktok && (
            <SectionCard title="TikTok" icon="🎵">
              <KpiGrid items={[
                { label: 'Seguidores',   value: fmt(s.tiktok.followersCount), delta: s.tiktok.deltaFollowers },
                { label: 'Engagement',  value: s.tiktok.engagementRate != null ? `${s.tiktok.engagementRate.toFixed(2)}%` : '—', delta: s.tiktok.deltaEngagement },
                { label: 'Avg. views',  value: fmt(s.tiktok.avgViews, 0) },
                { label: 'Posts / mes', value: fmt(s.tiktok.postsThisMonth) },
              ]} />
            </SectionCard>
          )}
        </div>
      )}

      {/* ── Keywords ── */}
      {s.keywords && (
        <SectionCard title="Posicionamiento SEO" icon="🔑">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{s.keywords.avgPosition}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Posición promedio</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{s.keywords.count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Keywords rastreadas</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-green-600 dark:text-green-400">+{s.keywords.improved?.length ?? 0}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Mejoraron</p>
            </div>
          </div>

          {/* Tabla de keywords */}
          {s.keywords.table?.length > 0 && (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Keyword</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Posición</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Cambio</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Clics</th>
                  </tr>
                </thead>
                <tbody>
                  {s.keywords.table.slice(0, 15).map((kw, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                      <td className="py-1.5 text-gray-700 dark:text-gray-300">{kw.query}</td>
                      <td className="py-1.5 text-right font-semibold text-gray-900 dark:text-white">{kw.position?.toFixed(1)}</td>
                      <td className="py-1.5 text-right">
                        {kw.delta != null
                          ? <span className={kw.delta > 0 ? 'text-green-600' : kw.delta < 0 ? 'text-red-500' : 'text-gray-400'}>
                              {kw.delta > 0 ? `↑${kw.delta}` : kw.delta < 0 ? `↓${Math.abs(kw.delta)}` : '—'}
                            </span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(kw.clicks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Performance ── */}
      {s.performance && (
        <SectionCard title="Performance web" icon="⚡">
          <div className="grid grid-cols-2 gap-4">
            {s.performance.mobile && (
              <div className="text-center">
                <p className={`text-3xl font-bold ${
                  s.performance.mobile.score >= 90 ? 'text-green-600' :
                  s.performance.mobile.score >= 50 ? 'text-yellow-600' : 'text-red-600'
                }`}>{s.performance.mobile.score}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">📱 Móvil</p>
              </div>
            )}
            {s.performance.desktop && (
              <div className="text-center">
                <p className={`text-3xl font-bold ${
                  s.performance.desktop.score >= 90 ? 'text-green-600' :
                  s.performance.desktop.score >= 50 ? 'text-yellow-600' : 'text-red-600'
                }`}>{s.performance.desktop.score}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">🖥️ Desktop</p>
              </div>
            )}
          </div>

          {/* Core Web Vitals */}
          {(s.performance.mobile?.metrics || s.performance.desktop?.metrics) && (() => {
            const m = s.performance.mobile?.metrics || {}
            return (
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-center">
                {[
                  { label: 'LCP',  value: m.lcp  != null ? `${(m.lcp/1000).toFixed(1)}s`  : null },
                  { label: 'CLS',  value: m.cls  != null ? m.cls.toFixed(3) : null },
                  { label: 'FCP',  value: m.fcp  != null ? `${(m.fcp/1000).toFixed(1)}s`  : null },
                ].filter(v => v.value).map((v, i) => (
                  <div key={i} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                    <p className="font-semibold text-gray-900 dark:text-white">{v.value}</p>
                    <p className="text-gray-500 dark:text-gray-400">{v.label}</p>
                  </div>
                ))}
              </div>
            )
          })()}
        </SectionCard>
      )}

      {/* ── Evolución trimestral ── */}
      {evolutionPoints && (
        <SectionCard title="Evolución trimestral" icon="📈">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Sesiones — últimos 3 meses</p>
          <LineChart points={evolutionPoints} color="#f97316" height={70} />
        </SectionCard>
      )}

      {/* ── Trabajo del mes ── */}
      {s.tasks && s.tasks.length > 0 && (
        <SectionCard title="Trabajo realizado en el mes" icon="🔧">
          <ul className="space-y-2">
            {s.tasks.map((task) => (
              <li key={task.id} className="flex items-start gap-2 text-sm">
                <span className="text-green-500 mt-0.5 shrink-0">✓</span>
                <span className="text-gray-700 dark:text-gray-300">{task.name}</span>
                {task.user?.name && (
                  <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 shrink-0">{task.user.name}</span>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* ── Próximos pasos ── */}
      {analysis?.nextSteps?.length > 0 && (
        <SectionCard title="Próximos pasos" icon="🚀">
          <ul className="space-y-2">
            {analysis.nextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-primary-500 font-bold shrink-0">{i + 1}.</span>
                <span className="text-gray-700 dark:text-gray-300">{step}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* ── Footer público ── */}
      {isPublic && (
        <div className="text-center py-4">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Generado por <strong className="text-gray-600 dark:text-gray-400">BlissTracker</strong> · {monthLabel(month)}
          </p>
        </div>
      )}
    </div>
  )
}
