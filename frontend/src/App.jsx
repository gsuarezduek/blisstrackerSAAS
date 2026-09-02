import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { isWorkspaceSubdomain } from './utils/domain'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { ChatProvider } from './context/ChatContext'
import React from 'react'
import LoadingSpinner from './components/LoadingSpinner'
import WorkspaceSuspendedScreen from './components/WorkspaceSuspendedScreen'

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

// Envuelve un import dinámico de ruta: si falla bajar el chunk (típicamente porque
// hubo un deploy nuevo mientras la pestaña estaba abierta con el bundle viejo → el
// archivo con el hash anterior ya no existe → "Failed to fetch dynamically imported
// module"), recarga la página UNA vez para tomar el index.html/chunks nuevos. El guard
// por timestamp en sessionStorage evita un loop si el chunk faltara de verdad.
function lazyWithReload(importer) {
  return lazy(() =>
    importer().catch((err) => {
      const KEY  = 'chunkReloadAt'
      const last = Number(sessionStorage.getItem(KEY) || 0)
      const now  = Date.now()
      if (now - last > 10000) {
        sessionStorage.setItem(KEY, String(now))
        window.location.reload()
        return new Promise(() => {})   // no resolver: la página se está recargando
      }
      throw err   // ya recargamos recién y sigue fallando → error real, que lo tome el ErrorBoundary
    })
  )
}

const Landing          = lazyWithReload(() => import('./pages/Landing'))
const Pricing          = lazyWithReload(() => import('./pages/Pricing'))
const SolutionMarketing = lazyWithReload(() => import('./pages/SolutionMarketing'))
const SolutionEos       = lazyWithReload(() => import('./pages/SolutionEos'))
const SolutionVentas    = lazyWithReload(() => import('./pages/SolutionVentas'))
const Login2           = lazyWithReload(() => import('./pages/Login2'))
const Register         = lazyWithReload(() => import('./pages/Register'))
const Dashboard        = lazyWithReload(() => import('./pages/Dashboard'))
const Admin            = lazyWithReload(() => import('./pages/Admin'))
const RRHH             = lazyWithReload(() => import('./pages/RRHH'))
const RealTime         = lazyWithReload(() => import('./pages/RealTime'))
const Reports          = lazyWithReload(() => import('./pages/Reports'))
const MyReports        = lazyWithReload(() => import('./pages/MyReports'))
const MyProjects       = lazyWithReload(() => import('./pages/MyProjects'))
const ProjectDetail    = lazyWithReload(() => import('./pages/ProjectDetail'))
const ForgotPassword   = lazyWithReload(() => import('./pages/ForgotPassword'))
const ResetPassword    = lazyWithReload(() => import('./pages/ResetPassword'))
const VerifyEmailChange = lazyWithReload(() => import('./pages/VerifyEmailChange'))
const VerifyEmail       = lazyWithReload(() => import('./pages/VerifyEmail'))
const MyProfile        = lazyWithReload(() => import('./pages/MyProfile'))
const UserProfile      = lazyWithReload(() => import('./pages/UserProfile'))
const Preferences      = lazyWithReload(() => import('./pages/Preferences'))
const Docs             = lazyWithReload(() => import('./pages/Docs'))
const SuperAdmin       = lazyWithReload(() => import('./pages/SuperAdmin'))
const JoinWorkspace    = lazyWithReload(() => import('./pages/JoinWorkspace'))
const Marketing        = lazyWithReload(() => import('./pages/Marketing'))
const Billing          = lazyWithReload(() => import('./pages/Billing'))
const EOS              = lazyWithReload(() => import('./pages/EOS'))
const Gamification     = lazyWithReload(() => import('./pages/Gamification'))
const Ventas           = lazyWithReload(() => import('./pages/Ventas'))
const Contenido        = lazyWithReload(() => import('./pages/Contenido'))
const LegalPage        = lazyWithReload(() => import('./pages/TermsPage'))
const ReportOrClientPortal = lazyWithReload(() => import('./pages/ReportOrClientPortal'))
const ProposalPublic   = lazyWithReload(() => import('./pages/ProposalPublic'))

function PrivateRoute({ children }) {
  const { user, loading, workspaceSuspended } = useAuth()
  if (loading) return <LoadingSpinner size="lg" fullPage />
  if (workspaceSuspended) return <WorkspaceSuspendedScreen />
  return user ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { user, loading, workspaceSuspended } = useAuth()
  if (loading) return <LoadingSpinner size="lg" fullPage />
  if (workspaceSuspended) return <WorkspaceSuspendedScreen />
  if (!user) return <Navigate to="/login" replace />
  if (!user.isAdmin) return <Navigate to="/" replace />
  return children
}

// Módulos con acceso por rol configurable desde Preferencias (rrhh/gamification/eos):
// pasan admins y quienes tengan el módulo habilitado vía user.moduleAccess (ver
// backend/src/lib/moduleAccess.js — el bypass de admin ya viene resuelto ahí).
function ModuleRoute({ moduleKey, children }) {
  const { user, loading, workspaceSuspended } = useAuth()
  if (loading) return <LoadingSpinner size="lg" fullPage />
  if (workspaceSuspended) return <WorkspaceSuspendedScreen />
  if (!user) return <Navigate to="/login" replace />
  if (!user.moduleAccess?.[moduleKey]) return <Navigate to="/" replace />
  return children
}

function SuperAdminRoute({ children }) {
  const { user, loading, workspaceSuspended } = useAuth()
  if (loading) return <LoadingSpinner size="lg" fullPage />
  if (workspaceSuspended) return <WorkspaceSuspendedScreen />
  if (!user) return <Navigate to="/login" replace />
  if (!user.isSuperAdmin) return <Navigate to="/" replace />
  return children
}

// Módulo Ventas: acceden admins/owners y el equipo comercial (user.isSales).
function SalesRoute({ children }) {
  const { user, loading, workspaceSuspended } = useAuth()
  if (loading) return <LoadingSpinner size="lg" fullPage />
  if (workspaceSuspended) return <WorkspaceSuspendedScreen />
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
    <ChatProvider>
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <React.Suspense fallback={<LoadingSpinner size="lg" fullPage />}>
        <Routes>
          <Route path="/login"    element={<Login2     />} />
          <Route path="/register" element={<Register   />} />
          <Route path="/pricing"  element={<Pricing    />} />
          <Route path="/soluciones/marketing" element={<SolutionMarketing />} />
          <Route path="/soluciones/eos"       element={<SolutionEos       />} />
          <Route path="/soluciones/ventas"    element={<SolutionVentas    />} />
          <Route path="/oauth"        element={<OAuthPopup    />} />
          <Route path="/auth"         element={<AuthCallback  />} />
          <Route path="/oauth-result" element={<OAuthResult   />} />
          <Route path="/report/:token" element={<ReportOrClientPortal />} />
          <Route path="/proposal/:token" element={<ProposalPublic />} />
          <Route path="/condiciones"  element={<LegalPage docKey="terms_of_service" />} />
          <Route path="/privacidad"   element={<LegalPage docKey="privacy_policy"   />} />
          <Route path="/join"     element={<JoinWorkspace />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email-change" element={<VerifyEmailChange />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
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
          <Route path="/contenido"  element={<PrivateRoute><Contenido /></PrivateRoute>} />
          <Route path="/billing"    element={<PrivateRoute><Billing  /></PrivateRoute>} />
          <Route path="/reports"             element={<AdminRoute><Reports      /></AdminRoute>} />
          <Route path="/superadmin" element={<SuperAdminRoute><SuperAdmin /></SuperAdminRoute>} />
          <Route path="/admin"              element={<AdminRoute><Admin        /></AdminRoute>} />
          <Route path="/admin/rrhh"         element={<ModuleRoute moduleKey="rrhh"><RRHH /></ModuleRoute>} />
          <Route path="/admin/eos"          element={<ModuleRoute moduleKey="eos"><EOS /></ModuleRoute>} />
          <Route path="/admin/gamification" element={<ModuleRoute moduleKey="gamification"><Gamification /></ModuleRoute>} />
          <Route path="/ventas"       element={<SalesRoute><Ventas /></SalesRoute>} />
          <Route path="/admin/ventas" element={<AdminRoute><Ventas /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </React.Suspense>
        <GlobalShortcuts />
      </BrowserRouter>
    </ChatProvider>
    </AuthProvider>
    </WorkspaceProvider>
    </ThemeProvider>
    </GoogleOAuthProvider>
    </ErrorBoundary>
  )
}
