import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import RealTime from './pages/RealTime'
import Reports from './pages/Reports'
import MyReports from './pages/MyReports'
import MyProjects from './pages/MyProjects'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">Cargando...</div>
  return user ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/my-reports"  element={<PrivateRoute><MyReports  /></PrivateRoute>} />
          <Route path="/my-projects" element={<PrivateRoute><MyProjects /></PrivateRoute>} />
          <Route path="/realtime" element={<AdminRoute><RealTime /></AdminRoute>} />
          <Route path="/reports" element={<AdminRoute><Reports /></AdminRoute>} />
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  )
}
