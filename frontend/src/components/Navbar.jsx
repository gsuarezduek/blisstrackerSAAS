import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import useRoles from '../hooks/useRoles'
import FeedbackButton from './FeedbackButton'
import NotificationBell from './NotificationBell'
import { useTheme } from '../context/ThemeContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { labelFor } = useRoles()
  const { dark, toggle } = useTheme()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <>
    <FeedbackButton />
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="text-xl font-bold text-primary-600">Bliss Tracker</span>
        <div className="flex gap-4 text-sm">
          <Link to="/" className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">Dashboard</Link>
          <Link to="/my-projects" className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">Mis Proyectos</Link>
          {user?.role !== 'ADMIN' && (
            <Link to="/my-reports" className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">Mis Reportes</Link>
          )}
          {user?.role === 'ADMIN' && (
            <>
              <Link to="/realtime" className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Tiempo Real
              </Link>
              <Link to="/reports" className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">Reportes</Link>
              <Link to="/admin" className="text-gray-600 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">Administración</Link>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <button
          onClick={toggle}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors p-1"
          title={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {dark ? (
            // Sun icon
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.166 17.834a.75.75 0 00-1.06 1.06l1.59 1.591a.75.75 0 001.061-1.06l-1.59-1.591zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.166 6.166a.75.75 0 001.06 1.06l1.59-1.59a.75.75 0 00-1.06-1.061l-1.59 1.59z" />
            </svg>
          ) : (
            // Moon icon
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
            </svg>
          )}
        </button>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{labelFor(user?.role)}</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-red-600 transition-colors"
        >
          Salir
        </button>
      </div>
    </nav>
    </>
  )
}
