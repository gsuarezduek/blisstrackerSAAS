import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import useRoles from '../hooks/useRoles'
import FeedbackButton from './FeedbackButton'
import NotificationBell from './NotificationBell'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { labelFor } = useRoles()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <>
    <FeedbackButton />
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="text-xl font-bold text-primary-600">Bliss Tracker</span>
        <div className="flex gap-4 text-sm">
          <Link to="/" className="text-gray-600 hover:text-primary-600 transition-colors">Dashboard</Link>
          <Link to="/my-projects" className="text-gray-600 hover:text-primary-600 transition-colors">Mis Proyectos</Link>
          {user?.role !== 'ADMIN' && (
            <Link to="/my-reports" className="text-gray-600 hover:text-primary-600 transition-colors">Mis Reportes</Link>
          )}
          {user?.role === 'ADMIN' && (
            <>
              <Link to="/realtime" className="text-gray-600 hover:text-primary-600 transition-colors flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Tiempo Real
              </Link>
              <Link to="/reports" className="text-gray-600 hover:text-primary-600 transition-colors">Reportes</Link>
              <Link to="/admin" className="text-gray-600 hover:text-primary-600 transition-colors">Administración</Link>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">{user?.name}</p>
          <p className="text-xs text-gray-500">{labelFor(user?.role)}</p>
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
