import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { WorkspaceDetailModal, SectionComingSoon } from './superadmin/shared'
import { SectionOverview } from './superadmin/overview'
import { SectionWorkspaces } from './superadmin/workspaces'
import { SectionFeedback } from './superadmin/feedback'
import { SectionEmails } from './superadmin/emails'
import { SectionUsers } from './superadmin/users'
import { SectionSettings } from './superadmin/settings'
import { SectionStorage } from './superadmin/storage'
import { SectionAnnouncements } from './superadmin/announcements'
import { SectionLegales } from './superadmin/legal'
import { SectionBrandManual } from './superadmin/brand'
import { SectionAvatars } from './superadmin/avatars'
import { SectionLanding } from './superadmin/landing'
import { SectionBilling } from './superadmin/billing'
import { SectionFeatureFlags } from './superadmin/featureFlags'
import { SectionAiTokens } from './superadmin/aiTokens'
import { SectionWhatsappUsage } from './superadmin/whatsappUsage'
import { SectionScraping } from './superadmin/scraping'
import { SectionMetrics } from './superadmin/metrics'

// ─── Navegación + shell del panel. Las secciones viven en ./superadmin/*.jsx ───
const NAV_GROUPS = [
  {
    label: 'Visión general',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        implemented: true,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'metrics',
        label: 'Métricas',
        implemented: true,
        description: 'DAU/MAU, retención, tasa de conversión de trials, actividad por workspace y tendencias de uso a lo largo del tiempo.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 003 0v-13A1.5 1.5 0 0015.5 2zM9.5 6A1.5 1.5 0 008 7.5v9a1.5 1.5 0 003 0v-9A1.5 1.5 0 009.5 6zM3.5 10A1.5 1.5 0 002 11.5v5a1.5 1.5 0 003 0v-5A1.5 1.5 0 003.5 10z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Clientes',
    items: [
      {
        id: 'workspaces',
        label: 'Workspaces',
        implemented: true,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M4 16.5v-13h-.25a.75.75 0 010-1.5h12.5a.75.75 0 010 1.5H16v13h.25a.75.75 0 010 1.5h-3.5a.75.75 0 01-.75-.75v-2.5a.75.75 0 00-.75-.75h-2.5a.75.75 0 00-.75.75v2.5a.75.75 0 01-.75.75h-3.5a.75.75 0 010-1.5H4zm3-11a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5A.75.75 0 017 5.5zm.75 1.75a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5zm-.75 3.75a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5a.75.75 0 01-.75-.75zm5.75-5.5a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5zm-.75 3.75a.75.75 0 01.75-.75h.5a.75.75 0 010 1.5h-.5a.75.75 0 01-.75-.75zm.75 1.75a.75.75 0 000 1.5h.5a.75.75 0 000-1.5h-.5z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'users',
        label: 'Usuarios',
        implemented: true,
        description: 'Lista global de todos los usuarios de la plataforma. Buscar por email, ver en qué workspaces participa cada uno y desactivar cuentas globalmente.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M7 8a3 3 0 100-6 3 3 0 000 6zM14.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.569 1.175A9.953 9.953 0 017 18a9.953 9.953 0 01-5.385-1.572zM14.5 16h-.106c.07-.297.088-.611.048-.933a7.47 7.47 0 00-1.588-3.755 4.502 4.502 0 015.874 2.636.818.818 0 01-.36.98A7.465 7.465 0 0114.5 16z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Negocio',
    items: [
      {
        id: 'billing',
        label: 'Billing',
        implemented: true,
        description: 'MRR, ARR y churn. Lista de suscripciones activas, trials próximos a vencer, pagos fallidos y acceso al portal de Stripe. Requiere integración con Stripe.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M1 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H2a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h16a1 1 0 011 1v6a1 1 0 01-1 1H2a1 1 0 01-1-1v-6zm8 4a1 1 0 100-2 1 1 0 000 2zm3 1a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'ai-tokens',
        label: 'IA & Tokens',
        implemented: true,
        description: 'Uso de tokens de IA por workspace y usuario, costo estimado acumulado, anomalías de consumo y configuración de límites por workspace.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.683a1 1 0 01-.633-.633L6.95 5.684z" />
          </svg>
        ),
      },
      {
        id: 'scraping',
        label: 'Scraping',
        implemented: true,
        description: 'Consumo de Apify por workspace y proyecto, gasto real en USD por cuenta, y configuración de actores/tokens de scraping.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'whatsapp-usage',
        label: 'WhatsApp',
        implemented: true,
        description: 'Uso de WhatsApp por workspace y mes (mensajes, plantillas enviadas, conversaciones activas) y costo estimado configurable — Fase 6 del módulo de Ventas.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a9.06 9.06 0 01-2.347-.306c-.584.297-1.925.955-4.181 1.234a.39.39 0 01-.415-.516c.257-.708.72-2.055.923-3.121C2.496 12.87 2 11.49 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" clipRule="evenodd" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      {
        id: 'feedback',
        label: 'Feedback',
        implemented: true,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293a.783.783 0 01.642-.413 41.102 41.102 0 003.55-.414c1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2zM6.75 6a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 2.5a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'emails',
        label: 'Emails',
        implemented: true,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
            <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
          </svg>
        ),
      },
      {
        id: 'announcements',
        label: 'Anuncios',
        implemented: true,
        description: 'Publicar avisos o novedades que aparecen dentro de la app para todos los workspaces o para workspaces específicos. Ideal para comunicar nuevas funciones o mantenimientos.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M13.92 3.845a19.361 19.361 0 01-6.3 1.98C6.765 5.942 5.89 6 5 6a4 4 0 00-.504 7.969 15.974 15.974 0 001.271 3.341c.397.77 1.342 1 2.05.59l.867-.5c.726-.42.94-1.321.588-2.021-.166-.33-.315-.666-.448-1.004 1.8.358 3.511.964 5.096 1.78A17.964 17.964 0 0015 10c0-2.161-.381-4.234-1.08-6.155zM15.243 3.097A19.456 19.456 0 0116.5 10c0 2.431-.445 4.758-1.257 6.904l-.03.077a.75.75 0 001.401.537 20.902 20.902 0 001.312-5.745 1.999 1.999 0 000-3.545 20.902 20.902 0 00-1.312-5.745.75.75 0 00-1.4.538l.029.076z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Plataforma',
    items: [
      {
        id: 'feature-flags',
        label: 'Feature Flags',
        implemented: true,
        description: 'Activar o desactivar funcionalidades de la app por workspace, plan o globalmente. Útil para rollouts graduales y acceso anticipado a nuevas features.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3.5 2.75a.75.75 0 00-1.5 0v14.5a.75.75 0 001.5 0v-4.392l1.657-.348a6.449 6.449 0 014.271.572 7.948 7.948 0 005.965.524l2.078-.64A.75.75 0 0018 12.25v-8.5a.75.75 0 00-.904-.734l-2.38.501a7.25 7.25 0 01-4.186-.363l-.502-.2a8.75 8.75 0 00-5.053-.439l-1.475.31V2.75z" />
          </svg>
        ),
      },
      {
        id: 'settings',
        label: 'Configuración',
        implemented: true,
        description: 'Ajustes globales de la plataforma: modo mantenimiento, duración del trial por defecto, límites de uso de IA, configuración de dominios y variables operativas.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.992 6.992 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'storage',
        label: 'Almacenamiento',
        implemented: true,
        description: 'Tamaño de la base de datos, tablas más grandes y limpieza de imágenes de RRSS huérfanas para recuperar espacio en disco.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3 4.25C3 3.01 6.13 2 10 2s7 1.01 7 2.25v1.5C17 6.99 13.87 8 10 8S3 6.99 3 5.75v-1.5z" />
            <path d="M3 8.43v2.32C3 11.99 6.13 13 10 13s7-1.01 7-2.25V8.43C15.49 9.4 12.89 9.9 10 9.9s-5.49-.5-7-1.47z" />
            <path d="M3 13.43v2.32C3 16.99 6.13 18 10 18s7-1.01 7-2.25v-2.32c-1.51.97-4.11 1.47-7 1.47s-5.49-.5-7-1.47z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Marca y Contenido',
    items: [
      {
        id: 'landing',
        label: 'Landing',
        implemented: true,
        description: 'Hero, video de demo y logos de empresas destacadas en la landing pública (blisstracker.app).',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 2.75a.75.75 0 00-1.5 0V4.5h-1a.75.75 0 000 1.5h1v1.75a.75.75 0 001.5 0V6h1a.75.75 0 000-1.5h-1V2.75z" />
            <path fillRule="evenodd" d="M2 6a2 2 0 012-2h3.5a.75.75 0 010 1.5H4a.5.5 0 00-.5.5v9a.5.5 0 00.5.5h12a.5.5 0 00.5-.5v-3.5a.75.75 0 011.5 0V15a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'brand',
        label: 'Manual de Marca',
        implemented: true,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2H4zm3.5 4.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM5 12.5l2.5-3 2 2.5 2.5-3.5L15 13H5z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'avatars',
        label: 'Avatares',
        implemented: true,
        description: 'Gestionar las fotos de perfil disponibles en la plataforma.',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        id: 'legal',
        label: 'Legales',
        implemented: true,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
          </svg>
        ),
      },
    ],
  },
]

// Flatten for lookup (id → section info)
const NAV_ITEMS_FLAT = NAV_GROUPS.flatMap(g => g.items)

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SuperAdmin() {
  const navigate  = useNavigate()
  const [section,    setSection]    = useState('dashboard')
  const [stats,      setStats]      = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selected,   setSelected]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, wsRes] = await Promise.all([
        api.get('/superadmin/stats'),
        api.get('/superadmin/workspaces'),
      ])
      setStats(statsRes.data)
      setWorkspaces(wsRes.data)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function handleStatusChange(id, newStatus) {
    setWorkspaces(ws => ws.map(w => w.id === id ? { ...w, status: newStatus } : w))
    if (selected?.id === id) setSelected(s => ({ ...s, status: newStatus }))
  }

  const currentNavItem = NAV_ITEMS_FLAT.find(n => n.id === section)

  function renderSection() {
    if (section === 'dashboard') {
      return (
        <SectionOverview
          stats={stats}
          workspaces={workspaces}
          loading={loading}
          onNavigate={setSection}
          onSelectWorkspace={setSelected}
        />
      )
    }
    if (section === 'workspaces') {
      return (
        <SectionWorkspaces
          workspaces={workspaces}
          loading={loading}
          onSelectWorkspace={setSelected}
        />
      )
    }
    if (section === 'metrics')       return <SectionMetrics />
    if (section === 'feedback')      return <SectionFeedback />
    if (section === 'emails')        return <SectionEmails />
    if (section === 'users')         return <SectionUsers />
    if (section === 'settings')      return <SectionSettings />
    if (section === 'storage')       return <SectionStorage />
    if (section === 'announcements') return <SectionAnnouncements workspaces={workspaces} />
    if (section === 'avatars')       return <SectionAvatars />
    if (section === 'feature-flags') return <SectionFeatureFlags />
    if (section === 'billing')       return <SectionBilling />
    if (section === 'ai-tokens')     return <SectionAiTokens />
    if (section === 'whatsapp-usage') return <SectionWhatsappUsage />
    if (section === 'scraping')      return <SectionScraping />
    if (section === 'legal')         return <SectionLegales />
    if (section === 'brand')         return <SectionBrandManual />
    if (section === 'landing')       return <SectionLanding />

    // Not yet implemented
    return (
      <SectionComingSoon
        label={currentNavItem?.label || section}
        description={currentNavItem?.description}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">

      {/* Top bar */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
            ← Volver
          </button>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Super Admin</span>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">{currentNavItem?.label}</span>
        </div>
        <img src="/logo-lockup.svg" alt="BlissTracker" className="h-7 w-auto" />
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col py-4 overflow-y-auto">
          <nav className="flex-1 px-3 space-y-5">
            {NAV_GROUPS.map(group => (
              <div key={group.label}>
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map(item => {
                    const isActive = section === item.id
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSection(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left ${
                          isActive
                            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                      >
                        <span className={isActive ? 'text-primary-600 dark:text-primary-400' : ''}>
                          {item.icon}
                        </span>
                        <span className="flex-1">{item.label}</span>
                        {!item.implemented && (
                          <span className="flex-shrink-0 text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full leading-none">
                            Soon
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {renderSection()}
          </div>
        </main>
      </div>

      {selected && (
        <WorkspaceDetailModal
          workspace={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
