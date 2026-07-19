import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isWorkspaceSubdomain } from './utils/domain'
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
import GlobalShortcuts from './components/GlobalShortcuts'

// Eager: micro-páginas del flujo OAuth/auth (chicas y sensibles a la confiabilidad
// en popups; no queremos un fetch de chunk en medio del handshake).
import OAuthPopup from './pages/OAuthPopup'
import AuthCallback from './pages/AuthCallback'
import OAuthResult from './pages/OAuthResult'

// Lazy: el resto de las páginas se parte en chunks propios (code splitting). Antes
// TODO viajaba en un único bundle (SuperAdmin 4k líneas, Marketing con sus tabs, EOS…);
// ahora cada visitante baja sólo la ruta que abre. Suspense muestra el spinner mientras
// el chunk carga.
const { lazy } = React
const Landing          = lazy(() => import('./pages/Landing'))
const Pricing          = lazy(() => import('./pages/Pricing'))
const Login2           = lazy(() => import('./pages/Login2'))
const Register         = lazy(() => import('./pages/Register'))
const Dashboard        = lazy(() => import('./pages/Dashboard'))
const Admin            = lazy(() => import('./pages/Admin'))
const Productivity     = lazy(() => import('./pages/Productivity'))
const RRHH             = lazy(() => import('./pages/RRHH'))
const RealTime         = lazy(() => import('./pages/RealTime'))
const Reports          = lazy(() => import('./pages/Reports'))
const MyReports        = lazy(() => import('./pages/MyReports'))
const MyProjects       = lazy(() => import('./pages/MyProjects'))
const ProjectDetail    = lazy(() => import('./pages/ProjectDetail'))
const ForgotPassword   = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword    = lazy(() => import('./pages/ResetPassword'))
const VerifyEmailChange = lazy(() => import('./pages/VerifyEmailChange'))
const MyProfile        = lazy(() => import('./pages/MyProfile'))
const UserProfile      = lazy(() => import('./pages/UserProfile'))
const Preferences      = lazy(() => import('./pages/Preferences'))
const Docs             = lazy(() => import('./pages/Docs'))
const SuperAdmin       = lazy(() => import('./pages/SuperAdmin'))
const JoinWorkspace    = lazy(() => import('./pages/JoinWorkspace'))
const Marketing        = lazy(() => import('./pages/Marketing'))
const Billing          = lazy(() => import('./pages/Billing'))
const EOS              = lazy(() => import('./pages/EOS'))
const Gamification     = lazy(() => import('./pages/Gamification'))
const Ventas           = lazy(() => import('./pages/Ventas'))
const LegalPage        = lazy(() => import('./pages/TermsPage'))
const ReportPublic     = lazy(() => import('./pages/ReportPublic'))

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

// Módulo Ventas: acceden admins/owners y el equipo comercial (user.isSales).
function SalesRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingSpinner size="lg" fullPage />
  if (!user) return <Navigate to="/login" replace />
  if (!user.isAdmin && !user.isSales) return <Navigate to="/" replace />
  return children
}

function RootPage() {
  if (!isWorkspaceSubdomain()) return <Landing />
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
        <React.Suspense fallback={<LoadingSpinner size="lg" fullPage />}>
        <Routes>
          <Route path="/login"    element={<Login2     />} />
          <Route path="/register" element={<Register   />} />
          <Route path="/pricing"  element={<Pricing    />} />
          <Route path="/oauth"        element={<OAuthPopup    />} />
          <Route path="/auth"         element={<AuthCallback  />} />
          <Route path="/oauth-result" element={<OAuthResult   />} />
          <Route path="/report/:token" element={<ReportPublic />} />
          <Route path="/condiciones"  element={<LegalPage docKey="terms_of_service" />} />
          <Route path="/privacidad"   element={<LegalPage docKey="privacy_policy"   />} />
          <Route path="/join"     element={<JoinWorkspace />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email-change" element={<VerifyEmailChange />} />
          <Route path="/" element={<RootPage />} />
          <Route path="/my-reports"  element={<PrivateRoute><MyReports  /></PrivateRoute>} />
          <Route path="/my-projects" element={<PrivateRoute><MyProjects /></PrivateRoute>} />
          <Route path="/my-projects/:id" element={<PrivateRoute><ProjectDetail /></PrivateRoute>} />
          <Route path="/profile"      element={<PrivateRoute><MyProfile    /></PrivateRoute>} />
          <Route path="/users/:id"    element={<PrivateRoute><UserProfile  /></PrivateRoute>} />
          <Route path="/preferences"  element={<PrivateRoute><Preferences  /></PrivateRoute>} />
          <Route path="/docs"         element={<PrivateRoute><Docs         /></PrivateRoute>} />
          <Route path="/realtime"   element={<PrivateRoute><RealTime  /></PrivateRoute>} />
          <Route path="/marketing"  element={<PrivateRoute><Marketing /></PrivateRoute>} />
          <Route path="/billing"    element={<PrivateRoute><Billing  /></PrivateRoute>} />
          <Route path="/reports"             element={<AdminRoute><Reports      /></AdminRoute>} />
          <Route path="/superadmin" element={<SuperAdminRoute><SuperAdmin /></SuperAdminRoute>} />
          <Route path="/admin"              element={<AdminRoute><Admin        /></AdminRoute>} />
          <Route path="/admin/productivity" element={<AdminRoute><Productivity /></AdminRoute>} />
          <Route path="/admin/rrhh"         element={<AdminRoute><RRHH        /></AdminRoute>} />
          <Route path="/admin/eos"          element={<AdminRoute><EOS         /></AdminRoute>} />
          <Route path="/admin/gamification" element={<AdminRoute><Gamification /></AdminRoute>} />
          <Route path="/ventas"       element={<SalesRoute><Ventas /></SalesRoute>} />
          <Route path="/admin/ventas" element={<AdminRoute><Ventas /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </React.Suspense>
        <GlobalShortcuts />
      </BrowserRouter>
    </AuthProvider>
    </WorkspaceProvider>
    </ThemeProvider>
    </GoogleOAuthProvider>
    </ErrorBoundary>
  )
}
