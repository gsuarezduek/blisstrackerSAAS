import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import SetupHintCard from '../SetupHintCard'
import LoadingSpinner from '../LoadingSpinner'

// ─── Crear tarea (copiado del patrón de GeoTab, prefijo "SEO -") ───────────────
function CreateTaskModal({ title, projectId, projectName, onClose }) {
  const { user } = useAuth()
  const [description, setDescription] = useState(`SEO - ${title}`)
  const [members, setMembers]         = useState([])
  const [assigneeId, setAssigneeId]   = useState('')
  const [saving, setSaving]           = useState(false)
  const [done, setDone]               = useState(false)

  useEffect(() => {
    api.get(`/projects/${projectId}/members`)
      .then(r => { setMembers(r.data); setAssigneeId(String(user?.id ?? '')) })
      .catch(() => {})
  }, [projectId, user])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!description.trim()) return
    setSaving(true)
    try {
      const body = { description: description.trim(), projectId: String(projectId) }
      if (assigneeId && assigneeId !== String(user?.id)) body.targetUserId = assigneeId
      await api.post('/tasks', body)
      setDone(true)
      setTimeout(onClose, 1200)
    } catch { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Crear tarea</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Proyecto: <span className="font-medium text-gray-600 dark:text-gray-300">{projectName}</span></p>
        {done ? (
          <div className="flex flex-col items-center py-6 gap-2">
            <span className="text-3xl">✅</span>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tarea creada</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
              <textarea autoFocus rows={3} value={description} onChange={e => setDescription(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
            </div>
            {members.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asignar a</label>
                <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  {members.map(m => (
                    <option key={m.id} value={String(m.id)}>{m.name}{String(m.id) === String(user?.id) ? ' (yo)' : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button type="submit" disabled={saving || !description.trim()}
                className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg py-2 text-sm font-medium transition-colors">{saving ? 'Guardando…' : 'Crear tarea'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Helpers de formato ────────────────────────────────────────────────────────
const pct = (n) => `${(n * 100).toFixed(1)}%`
const shortUrl = (u) => { try { const x = new URL(u); return x.pathname === '/' ? x.hostname : x.pathname } catch { return u } }

function PosBadge({ position, zone }) {
  const color = zone === 'casi_top3'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>#{position}</span>
}

function Section({ icon, title, subtitle, count, children }) {
  if (!count) return null
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
          <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5">{count}</span>
        </div>
        {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">{children}</div>
    </div>
  )
}

export default function OportunidadesTab({ projectId, projects, onSelectProject }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState(null) // { code, message }
  const [taskModal, setTaskModal] = useState(null)

  const selectedProject = projects.find(p => String(p.id) === projectId)

  const load = useCallback((pid) => {
    if (!pid) return
    setLoading(true); setErr(null); setData(null)
    api.get(`/marketing/projects/${pid}/seo/opportunities`)
      .then(r => setData(r.data))
      .catch(e => setErr({ code: e.response?.data?.code, message: e.response?.data?.error || 'Error al cargar oportunidades' }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(projectId) }, [projectId, load])

  function exportCsv() {
    if (!data) return
    const rows = [['tipo', 'query/página', 'posición', 'impresiones', 'clicks', 'ctr']]
    data.strikingDistance.forEach(r => rows.push(['striking', r.query, r.position, r.impressions, r.clicks, pct(r.ctr)]))
    data.lowCtr.forEach(r => rows.push(['ctr_bajo', r.page, r.position, r.impressions, r.clicks, pct(r.ctr)]))
    data.decay.queries.forEach(r => rows.push(['decay_query', r.query, r.position, r.impressions, r.clicks, '']))
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `oportunidades-${data.projectName}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  // ── Estados vacíos / de error ──
  if (!projectId) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
        <div className="text-4xl mb-3">🎯</div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Oportunidades SEO</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mx-auto">
          Elegí un proyecto para ver keywords a un empujón del top 3, páginas con CTR bajo y contenido que está perdiendo tráfico.
        </p>
      </div>
    )
  }

  if (loading) return <LoadingSpinner size="lg" />

  if (err) {
    if (err.code === 'NO_SITE_URL') {
      return <SetupHintCard icon="🌐" label="Este proyecto no tiene una URL configurada"
        hint="Agregá la URL del sitio para calcular las oportunidades SEO desde Search Console."
        to={selectedProject ? `/my-projects/${selectedProject.id}?infoTab=info` : undefined} ctaLabel="Agregar URL en Info →" />
    }
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <div className="text-3xl mb-3">🔌</div>
        <p className="text-sm text-gray-600 dark:text-gray-300 max-w-sm mx-auto">{err.message}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          Las oportunidades se calculan con datos de Google Search Console. Conectá o reconectá la integración desde la pestaña <span className="font-medium">🔍 SEO</span>.
        </p>
      </div>
    )
  }

  if (!data) return null

  const nothing = data.counts.strikingDistance + data.counts.lowCtr + data.counts.decayQueries + data.counts.decayPages === 0

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Datos de Search Console · últimos 28 días vs. período anterior
        </p>
        {!nothing && (
          <button onClick={exportCsv}
            className="text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            ⬇ Exportar CSV
          </button>
        )}
      </div>

      {nothing && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="text-3xl mb-2">✨</div>
          <p className="text-sm text-gray-600 dark:text-gray-300">No detectamos oportunidades claras en los últimos 28 días.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Esto suele mejorar a medida que el sitio acumula más impresiones en Search Console.</p>
        </div>
      )}

      {/* Striking distance */}
      <Section icon="🎯" title="A un empujón del top 3" count={data.strikingDistance.length}
        subtitle="Keywords en posición 4-20. Un pequeño refuerzo de contenido y enlaces internos puede subirlas a la primera plana.">
        {data.strikingDistance.map((r, i) => (
          <div key={i} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/40">
            <PosBadge position={r.position} zone={r.zone} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{r.query}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{r.impressions.toLocaleString()} impresiones · {r.clicks} clicks · CTR {pct(r.ctr)}</p>
            </div>
            <button onClick={() => setTaskModal({ title: `Subir "${r.query}" a top 3 (hoy #${r.position})` })}
              className="flex-shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ tarea</button>
          </div>
        ))}
      </Section>

      {/* CTR bajo */}
      <Section icon="👆" title="Páginas con CTR bajo" count={data.lowCtr.length}
        subtitle="Muchas impresiones pero pocos clicks. Mejorar el title y la meta description puede recuperar tráfico sin subir de posición.">
        {data.lowCtr.map((r, i) => (
          <div key={i} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/40">
            <div className="min-w-0 flex-1">
              <a href={r.page} target="_blank" rel="noreferrer" className="text-sm text-primary-600 dark:text-primary-400 hover:underline truncate block">{shortUrl(r.page)}</a>
              <p className="text-xs text-gray-400 dark:text-gray-500">{r.impressions.toLocaleString()} impresiones · CTR {pct(r.ctr)} · pos #{r.position}</p>
            </div>
            <button onClick={() => setTaskModal({ title: `Mejorar title/meta de ${shortUrl(r.page)} (CTR ${pct(r.ctr)})` })}
              className="flex-shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ tarea</button>
          </div>
        ))}
      </Section>

      {/* Content decay — queries */}
      <Section icon="📉" title="Contenido que está perdiendo tráfico" count={data.decay.queries.length}
        subtitle="Queries que cayeron en clicks o posición vs. el período anterior. Candidatas a un refresh de contenido.">
        {data.decay.queries.map((r, i) => (
          <div key={i} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/40">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{r.query}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {r.clicksDelta < 0 && <span className="text-red-500 dark:text-red-400 font-medium">{r.clicksDelta} clicks</span>}
                {r.clicksDelta < 0 && ' · '}
                pos #{r.prevPosition} → #{r.position}
                {r.positionDelta > 0 && <span className="text-red-500 dark:text-red-400"> (+{r.positionDelta})</span>}
              </p>
            </div>
            <button onClick={() => setTaskModal({ title: `Refrescar contenido para "${r.query}" (perdiendo tráfico)` })}
              className="flex-shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ tarea</button>
          </div>
        ))}
      </Section>

      {/* Content decay — páginas */}
      <Section icon="📄" title="Páginas que están perdiendo tráfico" count={data.decay.pages.length}
        subtitle="URLs que cayeron en clicks o posición vs. el período anterior.">
        {data.decay.pages.map((r, i) => (
          <div key={i} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/40">
            <div className="min-w-0 flex-1">
              <a href={r.page} target="_blank" rel="noreferrer" className="text-sm text-primary-600 dark:text-primary-400 hover:underline truncate block">{shortUrl(r.page)}</a>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {r.clicksDelta < 0 && <span className="text-red-500 dark:text-red-400 font-medium">{r.clicksDelta} clicks</span>}
                {r.clicksDelta < 0 && ' · '}pos #{r.prevPosition} → #{r.position}
              </p>
            </div>
            <button onClick={() => setTaskModal({ title: `Refrescar ${shortUrl(r.page)} (perdiendo tráfico)` })}
              className="flex-shrink-0 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">+ tarea</button>
          </div>
        ))}
      </Section>

      {taskModal && (
        <CreateTaskModal title={taskModal.title} projectId={projectId} projectName={selectedProject?.name ?? ''} onClose={() => setTaskModal(null)} />
      )}
    </div>
  )
}
