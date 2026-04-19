import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { WorkspaceProvider } from './context/WorkspaceContext'
import React from 'react'
import LoadingSpinner from './components/LoadingSpinner'

class ErrorBoundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(err) { return { error: err } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50 dark:bg-gray-900 text-center px-4">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-lg font-semibold text-gray-800 dark:text-white mb-2">Algo salió mal</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{this.state.error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Recargar página
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
import { getWorkspaceSlug } from './api/client'
import Landing from './pages/Landing'
import Login2 from './pages/Login2'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'
import Productivity from './pages/Productivity'
import RRHH from './pages/RRHH'
import RealTime from './pages/RealTime'
import Reports from './pages/Reports'
import MyReports from './pages/MyReports'
import MyProjects from './pages/MyProjects'
import ProjectDetail from './pages/ProjectDetail'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import OAuthPopup from './pages/OAuthPopup'
import AuthCallback from './pages/AuthCallback'
import MyProfile from './pages/MyProfile'
import Preferences from './pages/Preferences'
import Docs from './pages/Docs'
import SuperAdmin from './pages/SuperAdmin'
import JoinWorkspace from './pages/JoinWorkspace'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingSpinner size="lg" fullPage />
  return user ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingSpinner size="lg" fullPage />
  if (!user) return <Navigate to="/login" replace />
  if (!user.isAdmin) return <Navigate to="/" replace />
  return children
}

function SuperAdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingSpinner size="lg" fullPage />
  if (!user) return <Navigate to="/login" replace />
  if (!user.isSuperAdmin) return <Navigate to="/" replace />
  return children
}

// En el dominio raíz (sin slug de workspace) muestra la landing.
// En un subdominio de workspace, muestra la app normal.
function RootPage() {
  const slug = getWorkspaceSlug()
  if (!slug) return <Landing />
  return <PrivateRoute><Dashboard /></PrivateRoute>
}

export default function App() {
  return (
    <ErrorBoundary>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
    <ThemeProvider>
    <WorkspaceProvider>
    <AuthProvider>
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route path="/login"    element={<Login2     />} />
          <Route path="/register" element={<Register   />} />
          <Route path="/oauth"    element={<OAuthPopup    />} />
          <Route path="/auth"     element={<AuthCallback  />} />
          <Route path="/join"     element={<JoinWorkspace />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<RootPage />} />
          <Route path="/my-reports"  element={<PrivateRoute><MyReports  /></PrivateRoute>} />
          <Route path="/my-projects" element={<PrivateRoute><MyProjects /></PrivateRoute>} />
          <Route path="/my-projects/:id" element={<PrivateRoute><ProjectDetail /></PrivateRoute>} />
          <Route path="/profile"      element={<PrivateRoute><MyProfile    /></PrivateRoute>} />
          <Route path="/preferences"  element={<PrivateRoute><Preferences  /></PrivateRoute>} />
          <Route path="/docs"         element={<PrivateRoute><Docs         /></PrivateRoute>} />
          <Route path="/realtime" element={<PrivateRoute><RealTime /></PrivateRoute>} />
          <Route path="/reports"             element={<AdminRoute><Reports      /></AdminRoute>} />
          <Route path="/superadmin" element={<SuperAdminRoute><SuperAdmin /></SuperAdminRoute>} />
          <Route path="/admin"              element={<AdminRoute><Admin        /></AdminRoute>} />
          <Route path="/admin/productivity" element={<AdminRoute><Productivity /></AdminRoute>} />
          <Route path="/admin/rrhh"         element={<AdminRoute><RRHH        /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </WorkspaceProvider>
    </ThemeProvider>
    </GoogleOAuthProvider>
    </ErrorBoundary>
  )
}
