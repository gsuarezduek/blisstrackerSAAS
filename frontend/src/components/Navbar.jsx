import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import useRoles from '../hooks/useRoles'
import FeedbackButton from './FeedbackButton'
import NotificationBell from './NotificationBell'
import { useTheme } from '../context/ThemeContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { labelFor } = useRoles()
  const { dark, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  const isAdmin = user?.role === 'ADMIN'

  const links = [
    { to: '/', label: 'Dashboard' },
    { to: '/my-projects', label: 'Mis Proyectos' },
    ...(!isAdmin ? [{ to: '/my-reports', label: 'Mis Reportes' }] : []),
    ...(isAdmin ? [
      { to: '/realtime', label: 'Tiempo Real', dot: true },
      { to: '/reports', label: 'Reportes' },
      { to: '/admin', label: 'Administración' },
    ] : []),
  ]

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

  return (
    <>
      <FeedbackButton />
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3 flex items-center justify-between">

          {/* Logo */}
          <span className="text-xl font-bold text-primary-600">Bliss Tracker</span>

          {/* Desktop links */}
          <div className="hidden md:flex gap-5 text-sm">
            {links.map(l => (
              <NavLink key={l.to} {...l} />
            ))}
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

            {/* User info — desktop only */}
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium text-gray-900 dark:text-white leading-tight">{user?.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{labelFor(user?.role)}</p>
            </div>

            {/* Logout — desktop only */}
            <button
              onClick={handleLogout}
              className="hidden md:block text-sm text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              Salir
            </button>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="md:hidden p-1.5 text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
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

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 space-y-1">
            {/* User info */}
            <div className="pb-3 mb-2 border-b border-gray-100 dark:border-gray-700">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{user?.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{labelFor(user?.role)}</p>
            </div>

            {/* Nav links */}
            {links.map(l => (
              <div key={l.to} className="py-2">
                <NavLink {...l} onClick={closeMenu} />
              </div>
            ))}

            {/* Logout */}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-700 mt-2">
              <button
                onClick={() => { closeMenu(); handleLogout() }}
                className="text-sm text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </nav>
    </>
  )
}
