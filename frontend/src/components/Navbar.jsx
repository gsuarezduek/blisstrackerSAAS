import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useLocation, useMatch } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import useRoles from '../hooks/useRoles'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import FeedbackButton from './FeedbackButton'
import NotificationBell from './NotificationBell'
import { useTheme } from '../context/ThemeContext'
import BlissLogo from './BlissLogo'
import AnnouncementBanner from './AnnouncementBanner'
import TrialBanner from './TrialBanner'
import api from '../api/client'
import { avatarUrl } from '../utils/avatarUrl'

// ─── Iconos reutilizables ─────────────────────────────────────────────────────

function IcoUser() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
      <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
    </svg>
  )
}
function IcoBook() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
      <path d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z" />
    </svg>
  )
}
function IcoCog() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
      <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
    </svg>
  )
}
function IcoLock() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 flex-shrink-0">
      <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
    </svg>
  )
}
function IcoWorkspace() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
      <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z" clipRule="evenodd" />
    </svg>
  )
}
function IcoCreditCard() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
      <path d="M4.5 3.75a3 3 0 00-3 3v.75h21v-.75a3 3 0 00-3-3h-15zM22.5 9.75h-21v7.5a3 3 0 003 3h15a3 3 0 003-3v-7.5zm-18 3.75a.75.75 0 01.75-.75h6a.75.75 0 010 1.5h-6a.75.75 0 01-.75-.75zm.75 2.25a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z" />
    </svg>
  )
}
function IcoLogout() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 flex-shrink-0">
      <path fillRule="evenodd" d="M7.5 3.75A1.5 1.5 0 006 5.25v13.5a1.5 1.5 0 001.5 1.5h6a1.5 1.5 0 001.5-1.5V15a.75.75 0 011.5 0v3.75a3 3 0 01-3 3h-6a3 3 0 01-3-3V5.25a3 3 0 013-3h6a3 3 0 013 3V9A.75.75 0 0115 9V5.25a1.5 1.5 0 00-1.5-1.5h-6zm10.72 4.72a.75.75 0 011.06 0l3 3a.75.75 0 010 1.06l-3 3a.75.75 0 11-1.06-1.06l1.72-1.72H9a.75.75 0 010-1.5h10.94l-1.72-1.72a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Navbar() {
  const { user, logout, switchWorkspace } = useAuth()
  const { slug: currentSlug } = useWorkspace()
  const [otherWorkspaces, setOtherWorkspaces] = useState([])
  const [switchLoading, setSwitchLoading]     = useState(null)
  const navigate  = useNavigate()
  const location  = useLocation()
  const { labelFor } = useRoles()
  const { dark, toggle } = useTheme()
  const [menuOpen,       setMenuOpen]       = useState(false)
  const [profileOpen,    setProfileOpen]    = useState(false)
  const [adminOpen,      setAdminOpen]      = useState(false)
  const [adminMobileOpen, setAdminMobileOpen] = useState(false)
  const profileRef = useRef(null)
  const adminRef   = useRef(null)

  const isAdminRoute = !!useMatch('/admin') || !!useMatch('/admin/productivity') || !!useMatch('/admin/rrhh')

  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
      if (adminRef.current   && !adminRef.current.contains(e.target))   setAdminOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!user) return
    api.get('/workspaces/mine')
      .then(r => setOtherWorkspaces((r.data || []).filter(w => w.slug !== currentSlug)))
      .catch(() => {})
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

  function closeMenu() { setMenuOpen(false) }

  const isAdmin   = user?.isAdmin === true
  const avatarSrc = avatarUrl(user?.avatar)
  const { enabled: marketingEnabled } = useFeatureFlag('marketing')

  // ── Links de navegación principal ────────────────────────────────────────
  // FUENTE ÚNICA: cualquier cambio aquí aplica en desktop Y mobile automáticamente.
  const links = [
    { to: '/', label: 'Dashboard' },
    { to: '/my-projects', label: 'Mis Proyectos' },
    ...(!isAdmin ? [{ to: '/my-reports', label: 'Mis Reportes' }] : []),
    { to: '/realtime', label: 'Actividad', dot: true },
    ...(isAdmin ? [{ to: '/reports', label: 'Reportes' }] : []),
    ...(marketingEnabled ? [{ to: '/marketing', label: 'Marketing' }] : []),
  ]

  // ── Sublinks de Administración ────────────────────────────────────────────
  // FUENTE ÚNICA: cualquier cambio aquí aplica en desktop Y mobile automáticamente.
  const adminSublinks = [
    { to: '/admin/productivity', label: '📊 Productividad' },
    { to: '/admin/rrhh',         label: '👥 RRHH' },
    { to: '/admin',              label: '⚙️ Panel' },
  ]

  // ── Secciones del menú de perfil ──────────────────────────────────────────
  // FUENTE ÚNICA: cualquier cambio aquí aplica en desktop Y mobile automáticamente.
  // Cada sección tiene: { id, heading?, items[] }
  // Cada item tiene: { key, label, icon, to? } | { key, label, icon, onClick, disabled?, danger?, highlight? }
  const profileSections = [
    {
      id: 'nav',
      items: [
        { key: 'profile',     to: '/profile',     label: 'Perfil',        icon: <IcoUser /> },
        { key: 'docs',        to: '/docs',         label: 'Docs',          icon: <IcoBook /> },
        { key: 'preferences', to: '/preferences',  label: 'Preferencias',  icon: <IcoCog /> },
        ...(isAdmin ? [{ key: 'billing', to: '/billing', label: 'Facturación', icon: <IcoCreditCard /> }] : []),
      ],
    },
    ...(user?.isSuperAdmin ? [{
      id: 'superadmin',
      items: [{
        key: 'superadmin',
        to: '/superadmin',
        label: 'Panel Super Admin',
        icon: <IcoLock />,
        highlight: true,
      }],
    }] : []),
    ...(otherWorkspaces.length > 0 ? [{
      id: 'workspaces',
      heading: 'Cambiar workspace',
      items: otherWorkspaces.map(ws => ({
        key:      ws.slug,
        label:    switchLoading === ws.slug ? 'Cambiando…' : ws.name,
        icon:     <IcoWorkspace />,
        onClick:  () => handleSwitch(ws.slug),
        disabled: !!switchLoading,
      })),
    }] : []),
    {
      id: 'logout',
      items: [{
        key:     'logout',
        label:   'Cerrar sesión',
        icon:    <IcoLogout />,
        onClick: handleLogout,
        danger:  true,
      }],
    },
  ]

  // ── Renderizador compartido de secciones de perfil ────────────────────────
  // Recibe onClose para cerrar el dropdown/panel al navegar o accionar.
  function renderProfileSections(onClose) {
    return profileSections.map((section, idx) => (
      <div key={section.id}>
        {idx > 0 && <div className="border-t border-gray-100 dark:border-gray-700 my-1" />}
        {section.heading && (
          <p className="px-4 pt-1.5 pb-0.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            {section.heading}
          </p>
        )}
        {section.items.map(item => {
          const base = 'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors'
          if (item.to) {
            return (
              <Link
                key={item.key}
                to={item.to}
                onClick={onClose}
                className={`${base} ${item.highlight
                  ? 'text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          }
          return (
            <button
              key={item.key}
              onClick={() => { onClose(); item.onClick?.() }}
              disabled={item.disabled}
              className={`${base} disabled:opacity-60 ${item.danger
                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          )
        })}
      </div>
    ))
  }

  // ── NavLink ───────────────────────────────────────────────────────────────
  function NavLink({ to, label, dot, onClick }) {
    const active = location.pathname === to
    return (
      <Link
        to={to}
        onClick={onClick}
        className={`flex items-center gap-1.5 transition-colors ${
          active
            ? 'text-primary-600 dark:text-primary-400 font-semibold'
            : 'text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400'
        }`}
      >
        {dot && <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse flex-shrink-0" />}
        {label}
      </Link>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <FeedbackButton />
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {user && <AnnouncementBanner />}
        {user && <TrialBanner />}
        <div className="px-4 py-3 flex items-center justify-between">

          {/* Logo */}
          <Link to="/" className="flex items-center">
            <BlissLogo variant="lockup" className="h-8 w-auto" />
          </Link>

          {/* Desktop links */}
          <div className="hidden lg:flex gap-5 text-sm items-center">
            {links.map(l => <NavLink key={l.to} {...l} />)}

            {isAdmin && (
              <div ref={adminRef} className="relative">
                <button
                  onClick={() => setAdminOpen(o => !o)}
                  className={`flex items-center gap-1 transition-colors ${
                    isAdminRoute
                      ? 'text-primary-600 dark:text-primary-400 font-semibold'
                      : 'text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400'
                  }`}
                >
                  Administración
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                    className={`w-3.5 h-3.5 transition-transform ${adminOpen ? 'rotate-180' : ''}`}>
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
                {adminOpen && (
                  <div className="absolute left-0 mt-2 w-44 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg py-1 z-50">
                    {adminSublinks.map(s => (
                      <Link
                        key={s.to}
                        to={s.to}
                        onClick={() => setAdminOpen(false)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                          location.pathname === s.to
                            ? 'text-primary-600 dark:text-primary-400 font-semibold bg-primary-50 dark:bg-primary-900/20'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                      >
                        {s.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <NotificationBell />

            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors p-1.5"
              title={dark ? 'Modo claro' : 'Modo oscuro'}
            >
              {dark ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.166 17.834a.75.75 0 00-1.06 1.06l1.59 1.591a.75.75 0 001.061-1.06l-1.59-1.591zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.166 6.166a.75.75 0 001.06 1.06l1.59-1.59a.75.75 0 00-1.06-1.061l-1.59 1.59z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* User menu — desktop only */}
            <div ref={profileRef} className="relative hidden lg:block">
              <button
                onClick={() => setProfileOpen(o => !o)}
                className="flex items-center gap-2.5 hover:opacity-80 transition-opacity rounded-lg px-2 py-1"
              >
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900 dark:text-white leading-tight">{user?.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{labelFor(user?.role)}</p>
                </div>
                <img
                  src={avatarSrc}
                  alt="avatar"
                  className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0"
                />
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                  className={`w-4 h-4 text-gray-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`}>
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {/* Desktop dropdown — usa renderProfileSections */}
              {profileOpen && (
                <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg py-1 z-50">
                  {renderProfileSections(() => setProfileOpen(false))}
                </div>
              )}
            </div>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="lg:hidden p-1.5 text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              aria-label="Menú"
            >
              {menuOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                  <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                  <path fillRule="evenodd" d="M3 6.75A.75.75 0 013.75 6h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 6.75zM3 12a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 12zm0 5.25a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ── Mobile menu ──────────────────────────────────────────────────── */}
        {menuOpen && (
          <div className="lg:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">

            {/* User info */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <img
                src={avatarSrc}
                alt="avatar"
                className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-600 flex-shrink-0"
              />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{user?.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{labelFor(user?.role)}</p>
              </div>
            </div>

            {/* Nav links — usa el mismo array `links` que desktop */}
            <div className="px-4 py-2 space-y-0.5">
              {links.map(l => (
                <div key={l.to} className="py-2">
                  <NavLink {...l} onClick={closeMenu} />
                </div>
              ))}

              {/* Administración — usa el mismo array `adminSublinks` que desktop */}
              {isAdmin && (
                <div className="py-2">
                  <button
                    onClick={() => setAdminMobileOpen(o => !o)}
                    className={`flex items-center gap-1 text-sm transition-colors w-full ${
                      isAdminRoute
                        ? 'text-primary-600 dark:text-primary-400 font-semibold'
                        : 'text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    Administración
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                      className={`w-3.5 h-3.5 ml-auto transition-transform ${adminMobileOpen ? 'rotate-180' : ''}`}>
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {adminMobileOpen && (
                    <div className="ml-3 mt-1 space-y-1 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                      {adminSublinks.map(s => (
                        <Link
                          key={s.to}
                          to={s.to}
                          onClick={closeMenu}
                          className={`block py-1.5 text-sm transition-colors ${
                            location.pathname === s.to
                              ? 'text-primary-600 dark:text-primary-400 font-semibold'
                              : 'text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400'
                          }`}
                        >
                          {s.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Menú de perfil — usa renderProfileSections, igual que el dropdown de desktop */}
            <div className="border-t border-gray-100 dark:border-gray-700 pb-2">
              {renderProfileSections(closeMenu)}
            </div>

          </div>
        )}
      </nav>
    </>
  )
}
