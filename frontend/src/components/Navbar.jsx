import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  House, FolderKanban, CalendarDays, MessageSquare, Activity, ChartColumn, Trophy,
  Handshake, Megaphone, LayoutGrid, Users, Wallet, Target, Settings2, Search, Plus,
  ChevronsUpDown, ChevronDown, StickyNote, BookOpen, Moon, Sun, PanelLeftClose,
  PanelLeftOpen, Ellipsis, User, Settings, CreditCard, Eye, Lock, Building2, LogOut,
  Menu, X, Star, Check,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useChat } from '../context/ChatContext'
import { useTheme } from '../context/ThemeContext'
import useRoles from '../hooks/useRoles'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import useActiveGames from '../hooks/useActiveGames'
import useStarredProjects from '../hooks/useStarredProjects'
import FloatingDock from './FloatingDock'
import NotificationBell from './NotificationBell'
import BlissLogo from './BlissLogo'
import AnnouncementBanner from './AnnouncementBanner'
import EmailVerifiedBanner from './EmailVerifiedBanner'
import TrialBanner from './TrialBanner'
import TokenBudgetBanner from './TokenBudgetBanner'
import NotesBoard from './NotesBoard'
import { Icon } from './ui/Icon'
import api from '../api/client'
import { avatarUrl } from '../utils/avatarUrl'

// ─── Navegación de la app: barra lateral (desde lg) + barra superior con panel (mobile)
//
// Cada página monta <Navbar /> arriba de su contenido. Desde lg la barra lateral es
// `fixed` y el lugar que ocupa lo reserva `html.has-sidebar` (padding del body, ver
// index.css): así ninguna de las ~20 páginas tuvo que cambiar su layout. Lo que sigue
// en el flujo de la página son los banners, la barra superior de mobile y la pizarra.
//
// FUENTE ÚNICA: `primaryItems`, `moduleItems`, `adminItems`, `profileSections` y
// `workspaceItems` alimentan la barra lateral Y el panel de mobile.

const LS_COLLAPSED  = 'bliss_sidebar_collapsed'
const LS_ADMIN_OPEN = 'bliss_sidebar_admin_open'

function readFlag(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch { return fallback }
}
function writeFlag(key, value) {
  try { localStorage.setItem(key, value ? '1' : '0') } catch { /* modo privado */ }
}
function safeDecode(s) {
  try { return decodeURIComponent(s) } catch { return s }
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')

// Clic afuera de `ref` → `onOutside()`. Solo escucha mientras `active`.
function useClickOutside(ref, active, onOutside) {
  useEffect(() => {
    if (!active) return
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) onOutside() }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [ref, active, onOutside])
}

// ─── Piezas visuales ─────────────────────────────────────────────────────────

function Badge({ n }) {
  return (
    <span className="min-w-[18px] h-[18px] px-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
      {n > 9 ? '9+' : n}
    </span>
  )
}

// Lo que va a la derecha del ítem: contador, punto en vivo, punto rojo o un texto corto.
function Trailing({ item }) {
  if (item.badge?.n > 0) return <Badge n={item.badge.n} />
  if (item.badge?.dot) return <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-500" />
  if (item.live) return <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
  if (item.alert) return <span className="w-2 h-2 rounded-full bg-red-500" title={item.alertTitle} />
  return null
}

function hasAttention(item) {
  return item.badge?.n > 0 || item.badge?.dot || item.alert
}

function NavItem({ item, active, collapsed, onNavigate }) {
  const base = 'group relative flex items-center gap-2.5 rounded-lg text-sm transition-colors'
  const layout = collapsed ? 'justify-center h-9 w-10 mx-auto' : 'h-8 px-2 w-full'
  const tone = active
    ? 'bg-primary-50 text-primary-700 font-semibold dark:bg-primary-900/20 dark:text-primary-400'
    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700/60 dark:hover:text-white'
  const iconTone = active
    ? 'text-primary-600 dark:text-primary-400'
    : 'text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-300'

  const content = (
    <>
      {item.star
        ? <Icon as={Star} size={15} fill="currentColor" className="text-amber-400 mx-px" />
        : <Icon as={item.icon} size={17} className={iconTone} />}
      {!collapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
      {!collapsed && <Trailing item={item} />}
      {collapsed && hasAttention(item) && (
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-800" />
      )}
    </>
  )
  const title = collapsed ? item.label : undefined

  if (item.to) {
    return (
      <Link to={item.to} onClick={onNavigate} title={title} aria-current={active ? 'page' : undefined}
        className={`${base} ${layout} ${tone}`}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" title={title} onClick={() => { onNavigate?.(); item.onClick?.() }}
      className={`${base} ${layout} ${tone}`}>
      {content}
    </button>
  )
}

function SectionHeading({ children, onClick, open }) {
  const cls = 'w-full flex items-center px-2 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500'
  if (!onClick) return <p className={cls}>{children}</p>
  return (
    <button type="button" onClick={onClick} className={`${cls} hover:text-gray-600 dark:hover:text-gray-300`} aria-expanded={open}>
      {children}
      <Icon as={ChevronDown} size={13} className={`ml-auto transition-transform ${open ? '' : '-rotate-90'}`} />
    </button>
  )
}

// Filas de un menú desplegable (perfil, workspaces).
function MenuRow({ item, onClose }) {
  const base = 'w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors disabled:opacity-60'
  const tone = item.danger
    ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
    : item.highlight
      ? 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 font-medium'
      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
  const iconTone = item.danger || item.highlight ? '' : 'text-gray-400'
  const content = (
    <>
      <Icon as={item.icon} size={16} className={iconTone} />
      <span className="truncate flex-1 text-left">{item.label}</span>
      {item.dot && <span className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0" />}
      {item.current && <Icon as={Check} size={15} className="text-primary-600 dark:text-primary-400" />}
    </>
  )
  if (item.to) {
    return <Link to={item.to} onClick={onClose} className={`${base} ${tone}`}>{content}</Link>
  }
  return (
    <button type="button" onClick={() => { onClose(); item.onClick?.() }} disabled={item.disabled} className={`${base} ${tone}`}>
      {content}
    </button>
  )
}

function MenuSections({ sections, onClose }) {
  return sections.filter(s => s.items.length > 0).map((section, idx) => (
    <div key={section.id}>
      {idx > 0 && <div className="border-t border-gray-100 dark:border-gray-700 my-1" />}
      {section.heading && (
        <p className="px-3.5 pt-1.5 pb-0.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          {section.heading}
        </p>
      )}
      {section.items.map(item => <MenuRow key={item.key} item={item} onClose={onClose} />)}
    </div>
  ))
}

const toolBtn = 'relative flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors'
const popover = 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg py-1 z-50'

// ─────────────────────────────────────────────────────────────────────────────

export default function Navbar() {
  const { user, logout, switchWorkspace, realIsAdmin, viewAsMember, toggleViewAsMember } = useAuth()
  const { slug: currentSlug, workspace } = useWorkspace()
  const { unreadChannelsCount = 0, mentionChannelsCount = 0 } = useChat() || {}
  const { dark, toggle: toggleTheme } = useTheme()
  const { labelFor } = useRoles()
  const navigate = useNavigate()
  const location = useLocation()
  const games    = useActiveGames()
  const starred  = useStarredProjects()

  const [otherWorkspaces, setOtherWorkspaces] = useState([])
  const [switchLoading, setSwitchLoading]     = useState(null)
  const [collapsed, setCollapsed]   = useState(() => readFlag(LS_COLLAPSED, false))
  const [adminOpen, setAdminOpen]   = useState(() => readFlag(LS_ADMIN_OPEN, true))
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [wsMenuOpen, setWsMenuOpen]     = useState(false)
  const [mobileOpen, setMobileOpen]     = useState(false)

  const userMenuRef = useRef(null)
  const wsMenuRef   = useRef(null)
  useClickOutside(userMenuRef, userMenuOpen, () => setUserMenuOpen(false))
  useClickOutside(wsMenuRef, wsMenuOpen, () => setWsMenuOpen(false))

  // Reserva el ancho de la barra en el body (ver index.css). useLayoutEffect para que
  // al pasar de una página a otra no haya un cuadro con el contenido corrido.
  useLayoutEffect(() => {
    const el = document.documentElement
    el.classList.add('has-sidebar')
    el.classList.toggle('sidebar-collapsed', collapsed)
    return () => el.classList.remove('has-sidebar', 'sidebar-collapsed')
  }, [collapsed])

  useEffect(() => {
    if (!user) return
    function fetchMine() {
      api.get('/workspaces/mine')
        .then(r => setOtherWorkspaces((r.data || []).filter(w => w.slug !== currentSlug)))
        .catch(() => {})
    }
    fetchMine()
    const t = setInterval(fetchMine, 120000)
    return () => clearInterval(t)
  }, [user, currentSlug])

  async function handleSwitch(targetSlug) {
    setSwitchLoading(targetSlug)
    try { await switchWorkspace(targetSlug) }
    catch { setSwitchLoading(null) }
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function toggleCollapsed() {
    setCollapsed(c => { writeFlag(LS_COLLAPSED, !c); return !c })
    setUserMenuOpen(false)
    setWsMenuOpen(false)
  }
  function toggleAdmin() {
    setAdminOpen(o => { writeFlag(LS_ADMIN_OPEN, !o); return !o })
  }
  const emit = (name) => () => window.dispatchEvent(new CustomEvent(name))
  const closeMobile = () => setMobileOpen(false)

  const isAdmin   = user?.isAdmin === true
  const avatarSrc = avatarUrl(user?.avatar)
  const otherWorkspacesUnread = otherWorkspaces.some(ws => ws.hasUnread)
  const notesEnabled = user?.notesBoardEnabled !== false

  const { enabled: marketingEnabled }    = useFeatureFlag('marketing')
  const { enabled: eosEnabled }          = useFeatureFlag('eos')
  const { enabled: gamificationEnabled } = useFeatureFlag('gamification')
  const { enabled: ventasEnabled }       = useFeatureFlag('ventas')
  const { enabled: contenidoEnabled }    = useFeatureFlag('contenido')
  const { enabled: rrhhEnabled }         = useFeatureFlag('rrhh')
  const { enabled: calendarioEnabled }   = useFeatureFlag('calendario')
  const { enabled: finanzasEnabled }     = useFeatureFlag('finanzas')

  const chatBadge  = mentionChannelsCount > 0 ? { n: mentionChannelsCount } : unreadChannelsCount > 0 ? { dot: true } : null
  const gamesBadge = games.newCount > 0 ? { n: games.newCount } : null

  // ── Ítems de navegación ────────────────────────────────────────────────────

  // Lo de todos los días. Calendario vive acá (y no en Módulos) porque se usa a diario;
  // Chat y Juegos abren su panel flotante con el mismo evento que el botón flotante.
  const primaryItems = [
    { key: 'dashboard', to: '/', exact: true, label: 'Dashboard', icon: House },
    { key: 'projects',  to: '/my-projects', label: 'Proyectos', icon: FolderKanban },
    ...(calendarioEnabled && user?.moduleAccess?.calendario
      ? [{ key: 'calendar', to: '/calendario', label: 'Calendario', icon: CalendarDays }] : []),
    { key: 'chat', onClick: emit('bliss:open-chat'), label: 'Chat', icon: MessageSquare, badge: chatBadge },
    { key: 'realtime', to: '/realtime', label: 'Actividad', icon: Activity, live: true },
    // Los admins tienen el Reportes del equipo en Administración.
    ...(!isAdmin ? [{ key: 'my-reports', to: '/my-reports', label: 'Reportes', icon: ChartColumn }] : []),
    ...(games.visible
      ? [{ key: 'games', onClick: emit('bliss:open-game'), label: 'Juegos', icon: Trophy, badge: gamesBadge }] : []),
  ]

  // Proyectos destacados (ProjectStar, preferencia personal).
  const starredItems = starred.map(p => ({
    key: `star-${p.id}`,
    to: `/my-projects/${encodeURIComponent(p.name)}`,
    label: p.name,
    star: true,
    alert: p.hasBlocked,
    alertTitle: 'Tiene tareas bloqueadas',
  }))

  // Módulos con acceso configurable por rol: feature flag + user.moduleAccess (los
  // admins siempre pasan ese segundo chequeo). Orden fijo, no se reacomodan según qué
  // otros estén prendidos. Ventas mantiene su criterio histórico (admin → /admin/ventas).
  const moduleItems = [
    ...(ventasEnabled && (isAdmin || user?.isSales)
      ? [{ key: 'ventas', to: isAdmin ? '/admin/ventas' : '/ventas', label: 'Ventas', icon: Handshake }] : []),
    ...(marketingEnabled && user?.moduleAccess?.marketing ? [{ key: 'marketing', to: '/marketing', label: 'Marketing', icon: Megaphone }] : []),
    ...(contenidoEnabled && user?.moduleAccess?.contenido ? [{ key: 'contenido', to: '/contenido', label: 'Contenido', icon: LayoutGrid }] : []),
    ...(rrhhEnabled && user?.moduleAccess?.rrhh ? [{ key: 'rrhh', to: '/admin/rrhh', label: 'RRHH', icon: Users }] : []),
    ...(finanzasEnabled && user?.moduleAccess?.finanzas ? [{ key: 'finanzas', to: '/finanzas', label: 'Finanzas', icon: Wallet }] : []),
  ]

  // Estrictamente admin-only (EOS y Gamification no tienen acceso configurable por rol).
  const adminItems = isAdmin ? [
    { key: 'reports', to: '/reports', label: 'Reportes', icon: ChartColumn },
    ...(eosEnabled ? [{ key: 'eos', to: '/admin/eos', label: 'EOS', icon: Target }] : []),
    ...(gamificationEnabled ? [{ key: 'gamification', to: '/admin/gamification', label: 'Gamification', icon: Trophy }] : []),
    { key: 'panel', to: '/admin', exact: true, label: 'Panel', icon: Settings2 },
  ] : []

  const workspaceItems = [
    ...otherWorkspaces.map(ws => ({
      key:      ws.slug,
      label:    switchLoading === ws.slug ? 'Cambiando…' : ws.name,
      icon:     Building2,
      onClick:  () => handleSwitch(ws.slug),
      disabled: !!switchLoading,
      dot:      ws.hasUnread && switchLoading !== ws.slug,
    })),
    { key: 'new-workspace', to: '/register', label: 'Crear workspace', icon: Plus, highlight: true },
  ]

  // Menú de la persona. `mobileOnly` = en desktop ya está en otro lado (Docs en la
  // fila de herramientas, workspaces en el selector de arriba).
  const profileSections = [
    {
      id: 'nav',
      items: [
        { key: 'profile',     to: '/profile',     label: 'Perfil',       icon: User },
        { key: 'docs',        to: '/docs',        label: 'Docs',         icon: BookOpen, mobileOnly: true },
        { key: 'preferences', to: '/preferences', label: 'Preferencias', icon: Settings },
        ...(isAdmin ? [{ key: 'billing', to: '/billing', label: 'Facturación', icon: CreditCard }] : []),
      ],
    },
    ...(realIsAdmin ? [{
      id: 'view-as',
      items: [{
        key: 'view-as-member', icon: Eye, highlight: true, onClick: toggleViewAsMember,
        label: viewAsMember ? 'Volver a vista Admin' : 'Ver como miembro',
      }],
    }] : []),
    ...(user?.isSuperAdmin ? [{
      id: 'superadmin',
      items: [{ key: 'superadmin', to: '/superadmin', label: 'Panel Super Admin', icon: Lock, highlight: true }],
    }] : []),
    { id: 'workspaces', heading: 'Workspaces', mobileOnly: true, items: workspaceItems },
    { id: 'logout', items: [{ key: 'logout', label: 'Cerrar sesión', icon: LogOut, onClick: handleLogout, danger: true }] },
  ]
  const desktopProfileSections = profileSections
    .filter(s => !s.mobileOnly)
    .map(s => ({ ...s, items: s.items.filter(i => !i.mobileOnly) }))

  // ── Ítem activo ────────────────────────────────────────────────────────────
  const path = safeDecode(location.pathname)
  const starredActive = starredItems.some(i => safeDecode(i.to) === path)
  function isActive(item) {
    if (!item.to) return false
    const to = safeDecode(item.to)
    if (item.key === 'projects' && starredActive) return false
    if (item.exact) return path === to
    return path === to || path.startsWith(to + '/')
  }

  const roleBadge = realIsAdmin && (
    viewAsMember ? (
      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 whitespace-nowrap">
        Vista miembro
      </span>
    ) : (
      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 whitespace-nowrap">
        Admin
      </span>
    )
  )

  // Bloques de ítems, compartidos por la barra lateral y el panel de mobile.
  function renderNavBlocks({ collapsed: isCollapsed, onNavigate }) {
    const item = (it) => (
      <NavItem key={it.key} item={it} active={isActive(it)} collapsed={isCollapsed} onNavigate={onNavigate} />
    )
    const separator = <div className="my-2 mx-3 border-t border-gray-200 dark:border-gray-700" />
    return (
      <>
        <div className="space-y-0.5">{primaryItems.map(item)}</div>

        {starredItems.length > 0 && !isCollapsed && (
          <>
            <SectionHeading>Destacados</SectionHeading>
            <div className="space-y-0.5">{starredItems.map(item)}</div>
          </>
        )}

        {moduleItems.length > 0 && (
          <>
            {isCollapsed ? separator : <SectionHeading>Módulos</SectionHeading>}
            <div className="space-y-0.5">{moduleItems.map(item)}</div>
          </>
        )}

        {adminItems.length > 0 && (
          <>
            {isCollapsed ? separator : <SectionHeading onClick={toggleAdmin} open={adminOpen}>Administración</SectionHeading>}
            {(isCollapsed || adminOpen) && <div className="space-y-0.5">{adminItems.map(item)}</div>}
          </>
        )}
      </>
    )
  }

  const workspaceName = workspace?.name || currentSlug

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <FloatingDock games={games} />

      {/* ── Barra lateral (lg+) ───────────────────────────────────────────── */}
      <aside
        className={`hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-[width] duration-200 ${collapsed ? 'w-16' : 'w-64'}`}
        aria-label="Navegación principal"
      >
        {/* Workspace + selector */}
        <div ref={wsMenuRef} className="relative px-2 pt-3 pb-2">
          <button
            type="button"
            onClick={() => setWsMenuOpen(o => !o)}
            title={collapsed ? `${workspaceName} · cambiar de workspace` : undefined}
            className={`relative w-full flex items-center gap-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors ${collapsed ? 'justify-center py-1.5' : 'px-2 py-1.5'}`}
          >
            <BlissLogo variant="icon" className="w-7 h-7 flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate leading-tight">{workspaceName}</span>
                  <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate">{currentSlug}.blisstracker.app</span>
                </span>
                <Icon as={ChevronsUpDown} size={15} className="text-gray-400" />
              </>
            )}
            {otherWorkspacesUnread && (
              <span className={`absolute w-2 h-2 bg-red-500 rounded-full ring-2 ring-white dark:ring-gray-800 ${collapsed ? 'top-1 right-2.5' : 'top-1.5 right-1.5'}`} />
            )}
          </button>
          {wsMenuOpen && (
            <div className={`absolute ${collapsed ? 'left-full top-2 ml-2' : 'left-2 right-2 top-full -mt-1'} w-60 ${popover}`}>
              <p className="px-3.5 pt-1.5 pb-0.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Workspaces</p>
              <MenuRow item={{ key: 'current', label: workspaceName, icon: Building2, current: true, onClick: () => {} }} onClose={() => setWsMenuOpen(false)} />
              {workspaceItems.map(it => <MenuRow key={it.key} item={it} onClose={() => setWsMenuOpen(false)} />)}
            </div>
          )}
        </div>

        {/* Buscar + nueva tarea */}
        <div className={`flex gap-2 pb-2 ${collapsed ? 'flex-col items-center px-0' : 'px-3'}`}>
          <button
            type="button"
            onClick={emit('bliss:open-palette')}
            title={collapsed ? `Buscar (${IS_MAC ? '⌘K' : 'Ctrl+K'})` : undefined}
            className={collapsed
              ? `${toolBtn} w-10 h-9`
              : 'flex-1 min-w-0 flex items-center gap-2 h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-sm text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 transition-colors'}
          >
            <Icon as={Search} size={16} />
            {!collapsed && (
              <>
                <span className="truncate">Buscar o ir a…</span>
                <kbd className="ml-auto flex-shrink-0 whitespace-nowrap text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-px">
                  {IS_MAC ? '⌘K' : 'Ctrl+K'}
                </kbd>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={emit('bliss:open-add-task')}
            title="Nueva tarea (N)"
            className={`flex-shrink-0 flex items-center justify-center rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition-colors ${collapsed ? 'w-10 h-9' : 'w-9 h-9'}`}
          >
            <Icon as={Plus} size={18} strokeWidth={2.25} />
          </button>
        </div>

        {/* Ítems */}
        <nav className={`flex-1 overflow-y-auto overflow-x-hidden pb-3 ${collapsed ? 'px-0' : 'px-2'}`}>
          {renderNavBlocks({ collapsed })}
        </nav>

        {/* Herramientas + persona */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-2 pt-2 pb-2.5">
          <div className={`flex items-center gap-0.5 pb-2 ${collapsed ? 'flex-col' : 'px-1'}`}>
            <NotificationBell
              buttonClassName={toolBtn}
              panelClassName={`fixed bottom-3 w-80 ${collapsed ? 'left-[4.5rem]' : 'left-[16.5rem]'}`}
            />
            {notesEnabled && (
              <button type="button" onClick={emit('bliss:toggle-notes')} className={toolBtn} title="Pizarra de notas (Ctrl/Cmd+B)">
                <Icon as={StickyNote} size={18} />
              </button>
            )}
            <Link to="/docs" className={toolBtn} title="Docs y ayuda">
              <Icon as={BookOpen} size={18} />
            </Link>
            <button type="button" onClick={toggleTheme} className={toolBtn} title={dark ? 'Modo claro' : 'Modo oscuro'}>
              <Icon as={dark ? Sun : Moon} size={18} />
            </button>
            <button
              type="button"
              onClick={toggleCollapsed}
              className={`${toolBtn} ${collapsed ? '' : 'ml-auto'}`}
              title={collapsed ? 'Expandir barra' : 'Colapsar barra'}
            >
              <Icon as={collapsed ? PanelLeftOpen : PanelLeftClose} size={18} />
            </button>
          </div>

          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen(o => !o)}
              title={collapsed ? user?.name : undefined}
              className={`w-full flex items-center gap-2.5 rounded-xl transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/60 ${collapsed ? 'justify-center py-1' : 'px-2 py-1.5 border border-gray-200 dark:border-gray-700'}`}
            >
              <img src={avatarSrc} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.name}</span>
                      {roleBadge}
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{labelFor(user?.role)}</span>
                  </span>
                  <Icon as={Ellipsis} size={16} className="text-gray-400" />
                </>
              )}
            </button>
            {userMenuOpen && (
              <div className={`absolute ${collapsed ? 'left-full bottom-0 ml-3' : 'left-0 bottom-full mb-2'} w-60 ${popover}`}>
                {collapsed && (
                  <div className="px-3.5 pt-1.5 pb-2 border-b border-gray-100 dark:border-gray-700 mb-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{labelFor(user?.role)}</p>
                  </div>
                )}
                <MenuSections sections={desktopProfileSections} onClose={() => setUserMenuOpen(false)} />
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── En el flujo de la página: banners + barra superior de mobile ───── */}
      <div className="bg-white dark:bg-gray-800 lg:bg-transparent lg:dark:bg-transparent">
        {user && <AnnouncementBanner />}
        {user && <EmailVerifiedBanner />}
        {user && <TrialBanner />}
        {user && <TokenBudgetBanner />}
      </div>

      <nav className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <BlissLogo variant="lockup" className="h-8 w-auto" />
          </Link>
          <div className="flex items-center gap-1">
            <button type="button" onClick={emit('bliss:open-palette')} className="p-1.5 text-gray-500 dark:text-gray-400" title="Buscar">
              <Icon as={Search} size={20} />
            </button>
            <NotificationBell />
            <button type="button" onClick={toggleTheme} className="p-1.5 text-gray-500 dark:text-gray-400" title={dark ? 'Modo claro' : 'Modo oscuro'}>
              <Icon as={dark ? Sun : Moon} size={20} />
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen(o => !o)}
              className="relative p-1.5 text-gray-600 dark:text-gray-300"
              aria-label="Menú"
              aria-expanded={mobileOpen}
            >
              <Icon as={mobileOpen ? X : Menu} size={24} />
              {!mobileOpen && otherWorkspacesUnread && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white dark:ring-gray-800" />
              )}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <img src={avatarSrc} alt="" className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{labelFor(user?.role)} · {workspaceName}</p>
              </div>
              {roleBadge && <div className="ml-auto">{roleBadge}</div>}
            </div>
            <div className="px-3 py-2">
              {renderNavBlocks({ collapsed: false, onNavigate: closeMobile })}
            </div>
            <div className="border-t border-gray-100 dark:border-gray-700 py-1">
              <MenuSections sections={profileSections} onClose={closeMobile} />
            </div>
          </div>
        )}
      </nav>

      {/* Pizarra de notas — entre la navegación y el contenido */}
      {user && <NotesBoard />}
    </>
  )
}
