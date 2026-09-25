import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import useNavDestinations from '../hooks/useNavDestinations'
import { useChat } from '../context/ChatContext'
import { useTheme } from '../context/ThemeContext'

// Buscador global (Cmd/Ctrl+K) — navegación estática (fuzzy-match client-side
// contra useNavDestinations), proyectos y personas del equipo (fuzzy-match client-side:
// GET /api/projects y GET /api/workspaces/current/members ya devuelven la lista
// completa sin paginar — el segundo es el mismo endpoint que ya usa ChatWidget.jsx
// para armar el autocompletado de @menciones, abierto a cualquier miembro, no solo
// admin — así que no hace falta un endpoint `?search=` nuevo para ninguno de los dos)
// y leads de Ventas (`?search=` server-side, el único endpoint de entidad que ya lo
// soporta tal cual). Canales de chat: salen de `useChat().channels` (ya en memoria,
// con no-leídos/menciones y sin canales privados para no-admins) y no navegan — abren
// el widget vía `bliss:open-chat` con el slug, igual que la campana de notificaciones.
// Además: acciones rápidas (nueva tarea, agendar reunión, abrir chat, cambiar tema — se
// listan al abrir sin escribir), empresas de Ventas (`/ventas/companies?search=`),
// servicios y roles del workspace (solo admin, fuzzy-match client-side sobre una lista
// que se trae una vez) y un bloque server-side (`GET /api/search?q=`) con tareas, piezas
// de Contenido, reuniones de Calendario y archivos de proyecto — el backend ya filtra
// por flag/acceso de módulo, así que acá solo se renderea lo que llega.
// Overlay/backdrop calcado del modal de ayuda de GlobalShortcuts.jsx.
function scoreMatch(label, q) {
  const idx = label.toLowerCase().indexOf(q)
  return idx === -1 ? null : idx
}

const truncate = (str, n = 70) => {
  const line = (str || '').split('\n')[0].trim()
  return line.length > n ? `${line.slice(0, n - 1)}…` : line
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const destinations = useNavDestinations()
  const { channels = [] } = useChat() || {}
  const { enabled: ventasEnabled } = useFeatureFlag('ventas')
  const { enabled: marketingEnabled } = useFeatureFlag('marketing')
  const { enabled: contenidoEnabled } = useFeatureFlag('contenido')
  const canSeeLeads = ventasEnabled && (user?.isAdmin || user?.isSales)
  const canJumpToMarketing = marketingEnabled && !!user?.moduleAccess?.marketing
  const canJumpToContenido = contenidoEnabled && !!user?.moduleAccess?.contenido
  const { enabled: calendarioEnabled } = useFeatureFlag('calendario')
  const canScheduleMeeting = calendarioEnabled && !!user?.moduleAccess?.calendario
  const { dark, toggle: toggleTheme } = useTheme()
  const isAdmin = user?.isAdmin === true

  const [query, setQuery] = useState('')
  const [projects, setProjects] = useState([])
  const [members, setMembers] = useState([])
  const [leadResults, setLeadResults] = useState(null) // null = sin buscar todavía
  const [companyResults, setCompanyResults] = useState([])
  const [globalResults, setGlobalResults] = useState(null) // { tasks, pieces, events, files } | null
  const [services, setServices] = useState([])
  const [roles, setRoles] = useState([])
  const [searching, setSearching] = useState(false)
  const [serverLoading, setServerLoading] = useState(false) // búsqueda server-side (tareas/contenido/…) en curso
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const projectsLoadedRef = useRef(false)
  const membersLoadedRef = useRef(false)
  const adminListsLoadedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setLeadResults(null)
    setCompanyResults([])
    setGlobalResults(null)
    setSelected(0)
    // Foco al abrir — un pequeño timeout para que el input ya esté montado.
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  // Proyectos: se traen una sola vez (la primera vez que se abre el palette) y se
  // cachean — GET /api/projects no pagina, es la misma lista completa que ya usa
  // MyProjects.jsx, así que fuzzy-matchear client-side no agrega costo real.
  useEffect(() => {
    if (!open || projectsLoadedRef.current) return
    projectsLoadedRef.current = true
    api.get('/projects').then(({ data }) => setProjects(data || [])).catch(() => setProjects([]))
  }, [open])

  // Personas del equipo: mismo criterio — un solo fetch cacheado, mismo endpoint que
  // ya usa ChatWidget.jsx para su autocompletado de @menciones.
  useEffect(() => {
    if (!open || membersLoadedRef.current) return
    membersLoadedRef.current = true
    api.get('/workspaces/current/members')
      .then(({ data }) => setMembers((data || []).filter(m => m.active)))
      .catch(() => setMembers([]))
  }, [open])

  // Servicios y roles del workspace: solo admin (son las pestañas del Panel de
  // Administración a las que llevan). Un fetch cacheado, fuzzy-match client-side.
  useEffect(() => {
    if (!open || !isAdmin || adminListsLoadedRef.current) return
    adminListsLoadedRef.current = true
    api.get('/services/all').then(({ data }) => setServices(data || [])).catch(() => setServices([]))
    api.get('/roles').then(({ data }) => setRoles(data || [])).catch(() => setRoles([]))
  }, [open, isAdmin])

  const navMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return destinations
      .map(d => ({ ...d, type: 'nav', score: scoreMatch(d.label, q) }))
      .filter(d => d.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 10)
  }, [destinations, query])

  // Proyectos: además de "ir al proyecto", los 2 mejores matches suman un atajo
  // directo a Contenido/Marketing filtrado por ese proyecto (?projectId=) — evita
  // tener que entrar primero a la ficha del proyecto para llegar a esas secciones.
  const projectMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const top = projects
      .map(p => ({ ...p, score: scoreMatch(p.name, q) }))
      .filter(p => p.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 6)
    const items = []
    top.forEach((p, i) => {
      items.push({ id: `project-${p.id}`, type: 'project', label: p.name, to: `/my-projects/${p.id}` })
      if (i < 2) {
        if (canJumpToMarketing) {
          items.push({ id: `project-${p.id}-marketing`, type: 'project-link', label: p.name, module: '🎯 Marketing', to: `/marketing?projectId=${p.id}` })
        }
        if (canJumpToContenido) {
          items.push({ id: `project-${p.id}-contenido`, type: 'project-link', label: p.name, module: '📅 Contenido', to: `/contenido?projectId=${p.id}` })
        }
      }
    })
    return items
  }, [projects, query, canJumpToMarketing, canJumpToContenido])

  const memberMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return members
      .map(m => ({ id: `member-${m.id}`, type: 'member', label: m.name, to: `/users/${m.id}`, score: scoreMatch(m.name, q) }))
      .filter(m => m.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 6)
  }, [members, query])

  const adminMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const svc = services.map(sv => ({ id: `service-${sv.id}`, type: 'service', label: sv.name, to: '/admin?tab=services', score: scoreMatch(sv.name || '', q) }))
    const rol = roles.map(r => ({ id: `role-${r.id}`, type: 'role', label: r.label || r.name, to: '/admin?tab=roles', score: scoreMatch(r.label || r.name || '', q) }))
    return [...svc, ...rol].filter(x => x.score !== null).sort((a, b) => a.score - b.score).slice(0, 4)
  }, [services, roles, query])

  // Acciones rápidas: sin `to`, ejecutan algo. `keywords` amplía el matcheo con
  // sinónimos (escribir "crear" o "agregar" también encuentra "Nueva tarea").
  const actions = useMemo(() => [
    { id: 'action-new-task', label: 'Nueva tarea', hint: 'N', keywords: 'crear agregar tarea nueva',
      run: () => window.dispatchEvent(new CustomEvent('bliss:open-add-task')) },
    ...(canScheduleMeeting ? [{ id: 'action-schedule', label: 'Agendar reunión', keywords: 'calendario evento crear nueva reunión',
      to: '/calendario?schedule=1' }] : []),
    { id: 'action-chat', label: 'Abrir chat', keywords: 'mensajes conversación canales',
      run: () => window.dispatchEvent(new CustomEvent('bliss:open-chat')) },
    { id: 'action-theme', label: dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro', keywords: 'tema oscuro claro dark light apariencia',
      run: toggleTheme },
  ].map(a => ({ ...a, type: 'action' })), [canScheduleMeeting, dark, toggleTheme])

  const actionMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions // sin query se listan todas como sugerencia
    return actions
      .map(a => ({ ...a, score: scoreMatch(`${a.label} ${a.keywords}`, q) }))
      .filter(a => a.score !== null)
      .sort((a, b) => a.score - b.score)
  }, [actions, query])

  // Canales: los que tienen menciones/no leídos suben ante empate de score.
  const channelMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return channels
      .map(c => ({
        id: `channel-${c.id}`,
        type: 'channel',
        label: c.name,
        slug: c.slug,
        detail: c.mentionCount > 0 ? `@${c.mentionCount} mención${c.mentionCount > 1 ? 'es' : ''}`
          : c.unreadCount > 0 ? `${c.unreadCount} sin leer` : null,
        urgency: c.mentionCount > 0 ? 2 : c.unreadCount > 0 ? 1 : 0,
        score: scoreMatch(c.name || '', q),
      }))
      .filter(c => c.score !== null)
      .sort((a, b) => a.score - b.score || b.urgency - a.urgency)
      .slice(0, 5)
  }, [channels, query])

  // Bloque server-side (tareas / contenido / reuniones / archivos) + empresas de
  // Ventas — mismo debounce y descarte de respuestas obsoletas que los leads.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) { setGlobalResults(null); setCompanyResults([]); setServerLoading(false); return }
    let active = true
    setServerLoading(true)
    const t = setTimeout(() => {
      api.get('/search', { params: { q } })
        .then(({ data }) => { if (active) setGlobalResults(data) })
        .catch(() => { if (active) setGlobalResults(null) })
        .finally(() => { if (active) setServerLoading(false) })
      if (canSeeLeads) {
        api.get(`/ventas/companies?search=${encodeURIComponent(q)}`)
          .then(({ data }) => { if (active) setCompanyResults((data || []).slice(0, 4)) })
          .catch(() => { if (active) setCompanyResults([]) })
      }
    }, 300)
    return () => { active = false; clearTimeout(t) }
  }, [query, open, canSeeLeads])

  // Búsqueda de leads — debounce 300ms, descarta respuestas obsoletas (mismo
  // patrón que el buscador de archivos de proyecto, ProjectFiles.jsx).
  useEffect(() => {
    if (!open || !canSeeLeads) return
    const q = query.trim()
    if (!q) { setLeadResults(null); setSearching(false); return }
    let active = true
    setSearching(true)
    const t = setTimeout(() => {
      api.get(`/ventas/leads?search=${encodeURIComponent(q)}`)
        .then(({ data }) => { if (active) setLeadResults((data.leads || []).slice(0, 5)) })
        .catch(() => { if (active) setLeadResults([]) })
        .finally(() => { if (active) setSearching(false) })
    }, 300)
    return () => { active = false; clearTimeout(t) }
  }, [query, open, canSeeLeads])

  const leadItems = (leadResults || []).map(l => ({
    type: 'lead',
    id: `lead-${l.id}`,
    label: l.title,
    detail: l.company?.name || null,
    to: user?.isAdmin ? `/admin/ventas?lead=${l.id}` : `/ventas?lead=${l.id}`,
  }))

  const ventasBase = isAdmin ? '/admin/ventas' : '/ventas'
  const companyItems = companyResults.map(c => ({
    type: 'company', id: `company-${c.id}`, label: c.name, detail: c.industry || null,
    to: `${ventasBase}?tab=empresas&company=${c.id}`,
  }))

  const g = globalResults || {}
  const taskItems = (g.tasks || []).map(t => ({
    type: 'task', id: `task-${t.id}`, label: truncate(t.description),
    detail: [t.project?.name, t.user?.name].filter(Boolean).join(' · '), task: t,
  }))
  const pieceItems = (g.pieces || []).map(p => ({
    type: 'piece', id: `piece-${p.id}`, label: p.title, detail: p.project?.name || null,
    to: `/contenido?projectId=${p.projectId}&piece=${p.id}`,
  }))
  const eventItems = (g.events || []).map(e => ({
    type: 'event', id: `event-${e.id}`, label: e.title,
    detail: [e.date, e.startTime].filter(Boolean).join(' '),
    to: `/calendario?view=semana&date=${e.date}&event=${e.id}`,
  }))
  const fileItems = (g.files || []).map(f => ({
    type: 'file', id: `file-${f.id}`, label: f.name, detail: f.project?.name || null,
    to: `/my-projects/${f.projectId}?infoTab=archivos&fileId=${f.id}`, isFolder: f.type === 'folder',
  }))

  const results = [
    ...actionMatches, ...navMatches, ...projectMatches, ...memberMatches, ...channelMatches,
    ...taskItems, ...pieceItems, ...eventItems, ...fileItems,
    ...companyItems, ...leadItems, ...adminMatches,
  ]

  function go(item) {
    if (!item) return
    onClose()
    if (item.run) { item.run(); return }
    if (item.type === 'task') {
      window.dispatchEvent(new CustomEvent('bliss:open-task', { detail: item.task }))
      return
    }
    if (item.type === 'channel') {
      window.dispatchEvent(new CustomEvent('bliss:open-chat', { detail: { slug: item.slug } }))
      return
    }
    navigate(item.to)
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); go(results[selected]); return }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-[60] p-4 pt-[10vh]" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <img src="/mascot-bee.png" alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={onKeyDown}
            placeholder={`Ir a… o buscar tareas, proyectos, personas, canales…`}
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400"
          />
          {(searching || serverLoading) && <span className="text-xs text-gray-400">Buscando…</span>}
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1.5">
          {results.length === 0 && !searching && !serverLoading ? (
            <div className="flex flex-col items-center gap-2 px-4 py-6">
              <img src="/mascot-bee.png" alt="" className="w-10 h-10 rounded-full object-cover opacity-80" />
              <p className="text-sm text-gray-400 text-center">Sin resultados para "{query}".</p>
            </div>
          ) : (
            results.map((item, i) => (
              <button
                key={item.id || item.to}
                onClick={() => go(item)}
                onMouseEnter={() => setSelected(i)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                  selected === i ? 'bg-primary-50 dark:bg-primary-900/30' : ''
                }`}
              >
                <span className="text-gray-800 dark:text-gray-100 truncate">
                  {item.type === 'lead' && <span className="text-gray-400 mr-1.5">Lead ·</span>}
                  {item.type === 'project' && <span className="text-gray-400 mr-1.5">Proyecto ·</span>}
                  {item.type === 'member' && <span className="text-gray-400 mr-1.5">Persona ·</span>}
                  {item.type === 'channel' && <span className="text-gray-400 mr-1.5">💬 Chat ·</span>}
                  {item.type === 'action' && <span className="text-gray-400 mr-1.5">⚡</span>}
                  {item.type === 'task' && <span className="text-gray-400 mr-1.5">Tarea ·</span>}
                  {item.type === 'piece' && <span className="text-gray-400 mr-1.5">📅 Contenido ·</span>}
                  {item.type === 'event' && <span className="text-gray-400 mr-1.5">🗓️ Reunión ·</span>}
                  {item.type === 'file' && <span className="text-gray-400 mr-1.5">{item.isFolder ? '📁' : '📄'} Archivo ·</span>}
                  {item.type === 'company' && <span className="text-gray-400 mr-1.5">🏢 Empresa ·</span>}
                  {item.type === 'service' && <span className="text-gray-400 mr-1.5">🛠 Servicio ·</span>}
                  {item.type === 'role' && <span className="text-gray-400 mr-1.5">🏷 Rol ·</span>}
                  {item.label}
                  {item.type === 'project-link' && <span className="text-gray-400"> → {item.module}</span>}
                </span>
                {(item.detail || item.hint) && <span className="text-xs text-gray-400 flex-shrink-0 truncate max-w-[40%]">{item.detail || item.hint}</span>}
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-3">
          <span>↑↓ navegar</span>
          <span>↵ ir</span>
          <span>Esc cerrar</span>
        </div>
      </div>
    </div>
  )
}
