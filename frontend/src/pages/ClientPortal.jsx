import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import ClientBriefsView from '../components/ClientBriefsView'
import PortalLoginGate from '../components/portal/PortalLoginGate'
import ClientContentTab, { QUEUE_START } from '../components/portal/ClientContentTab'
import ClientReportsSection from '../components/portal/ClientReportsSection'
import PortalHome from '../components/portal/PortalHome'
import ClientTeamTab from '../components/portal/ClientTeamTab'
import ClientFilesTab from '../components/portal/ClientFilesTab'
import PortalFooter from '../components/portal/PortalFooter'
import { Card, ErrorState, Icon, Segmented, SectionTitle, Skeleton, ToastProvider, readableOn } from '../components/portal/portalUi'

const API = import.meta.env.VITE_API_URL || ''

// ─── Arquitectura de información ─────────────────────────────────────────────
// Antes: 7 pestañas planas del mismo peso (Inicio, Contenido, Informes, Briefs,
// Tu equipo, Datos Actuales, Nube). Ahora 4 secciones, ordenadas por lo que el
// cliente HACE (revisar) antes de lo que CONSULTA:
//   inicio     → qué me toca + novedades
//   contenido  → revisar/aprobar + calendario
//   informes   → "Resultados": informes mensuales + métricas en vivo
//   proyecto   → equipo y reuniones, archivos, briefs
// 4 ítems entran en una barra inferior en mobile sin scroll horizontal.
//
// Sección y sub-vista viven en la URL (?tab=&view=&report=&piece=) para que
// recargar, volver atrás o compartir un link no pierda el lugar. Los valores
// viejos de ?tab= (los links de emails ya enviados) se siguen aceptando.
const LEGACY_TABS = {
  vivo:     ['informes', 'vivo'],
  briefs:   ['proyecto', 'briefs'],
  equipo:   ['proyecto', 'equipo'],
  archivos: ['proyecto', 'archivos'],
}

function buildSections(meta) {
  const reports = meta.reports || []
  const project = []
  if (meta.team?.length > 0 || meta.meetings?.length > 0) project.push({ key: 'equipo', label: 'Equipo y reuniones' })
  if (meta.showFiles) project.push({ key: 'archivos', label: 'Archivos' })
  if (meta.briefs?.length > 0) project.push({ key: 'briefs', label: 'Briefs' })

  const sections = [{ key: 'inicio', label: 'Inicio', icon: 'home' }]
  if (meta.hasContent) sections.push({ key: 'contenido', label: 'Contenido', icon: 'content' })
  if (reports.length > 0 || meta.hasLiveSections) sections.push({ key: 'informes', label: 'Resultados', icon: 'reports' })
  if (project.length > 0) sections.push({ key: 'proyecto', label: 'Proyecto', icon: 'folder', subs: project })
  return sections
}

// ─── Header + navegación ─────────────────────────────────────────────────────

function ViewerMenu({ viewer, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const label = viewer?.name || viewer?.email || 'Mi cuenta'
  const initial = label.trim().charAt(0).toUpperCase()
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="Mi cuenta" aria-expanded={open}
        className="w-9 h-9 rounded-full bg-gray-900 text-white text-sm font-semibold flex items-center justify-center hover:ring-4 hover:ring-gray-200 transition-all">
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-gray-200 shadow-xl p-2 z-50">
          <div className="px-3 py-2.5">
            {viewer?.name && <p className="text-sm font-semibold text-gray-900 truncate">{viewer.name}</p>}
            {viewer?.email && <p className="text-xs text-gray-500 truncate">{viewer.email}</p>}
          </div>
          <button type="button" onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
            <Icon name="logout" className="w-4 h-4" /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}

function PortalHeader({ workspace, projectName, sections, active, onNavigate, pendingCount, brandPrimary, viewer, onLogout }) {
  const agencyName = workspace?.companyName || workspace?.name || ''
  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-gray-200/70">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1 md:flex-none">
          {workspace?.hasLogo && workspace?.slug ? (
            <img src={`${API}/api/public/logo/${workspace.slug}`} alt={agencyName} className="h-7 max-w-[110px] object-contain shrink-0"
              onError={e => { e.currentTarget.style.display = 'none' }} />
          ) : agencyName ? <span className="text-sm font-semibold text-gray-900 shrink-0">{agencyName}</span> : null}
          <span className="w-px h-6 bg-gray-200 shrink-0" />
          <span className="text-sm font-medium text-gray-600 truncate">{projectName}</span>
        </div>

        <nav className="hidden md:flex flex-1 justify-center gap-1" aria-label="Secciones">
          {sections.map(s => {
            const isActive = s.key === active
            return (
              <button key={s.key} type="button" onClick={() => onNavigate(s.key)} aria-current={isActive ? 'page' : undefined}
                className={`relative inline-flex items-center gap-2 px-3.5 h-16 text-sm font-medium transition-colors ${
                  isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
                {s.label}
                {s.key === 'contenido' && pendingCount > 0 && (
                  <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-semibold inline-flex items-center justify-center"
                    style={{ backgroundColor: brandPrimary, color: readableOn(brandPrimary) }}>{pendingCount}</span>
                )}
                {isActive && <span className="absolute left-3 right-3 bottom-0 h-0.5 rounded-full" style={{ backgroundColor: brandPrimary }} />}
              </button>
            )
          })}
        </nav>

        <ViewerMenu viewer={viewer} onLogout={onLogout} />
      </div>
    </header>
  )
}

function MobileNav({ sections, active, onNavigate, pendingCount, brandPrimary }) {
  if (sections.length < 2) return null
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 pb-[env(safe-area-inset-bottom)]" aria-label="Secciones">
      <div className="flex">
        {sections.map(s => {
          const isActive = s.key === active
          return (
            <button key={s.key} type="button" onClick={() => onNavigate(s.key)} aria-current={isActive ? 'page' : undefined}
              className="relative flex-1 flex flex-col items-center gap-0.5 pt-2.5 pb-2 text-[11px] font-medium"
              style={{ color: isActive ? brandPrimary : '#6b7280' }}>
              <span className="relative">
                <Icon name={s.icon} className="w-6 h-6" strokeWidth={isActive ? 2.1 : 1.7} />
                {s.key === 'contenido' && pendingCount > 0 && (
                  <span className="absolute -top-1 -right-2.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-white"
                    style={{ backgroundColor: brandPrimary, color: readableOn(brandPrimary) }}>{pendingCount}</span>
                )}
              </span>
              {s.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function PortalCover({ slug }) {
  const [ok, setOk] = useState(true)
  if (!ok) return null
  return (
    <div className="relative h-32 sm:h-48 rounded-3xl overflow-hidden mb-6 sm:mb-8 bg-gray-100">
      <img src={`${API}/api/public/client-portal-banner/${slug}`} alt="" className="w-full h-full object-cover" onError={() => setOk(false)} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/15 to-transparent" />
    </div>
  )
}

function PortalSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-40 rounded-3xl" />
      <div className="grid sm:grid-cols-2 gap-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
    </div>
  )
}

// ─── Portal autenticado ──────────────────────────────────────────────────────

function PortalApp({ slug, token, requireReauth, brandPrimary, projectName, hasBanner }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [meta,    setMeta]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [nonce,   setNonce]   = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  // ?piece= de la URL o elegido desde Inicio — lo consume ClientContentTab al montar.
  const [pieceToOpen, setPieceToOpen] = useState(() => searchParams.get('piece'))

  useEffect(() => {
    setLoading(true); setError(null)
    axios.get(`${API}/api/public/client-portal/${slug}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { setMeta(r.data); setPendingCount(r.data.pendingApprovalCount || 0) })
      .catch(err => {
        if (err.response?.status === 401) requireReauth()
        else setError(err.response?.data?.error || 'No se pudo cargar el portal')
      })
      .finally(() => setLoading(false))
  }, [slug, token, requireReauth, nonce])

  const sections = meta ? buildSections(meta) : []

  // Resolver sección/sub-vista desde la URL (con compatibilidad de links viejos).
  let rawTab = searchParams.get('tab')
  let rawView = searchParams.get('view')
  if (LEGACY_TABS[rawTab]) [rawTab, rawView] = LEGACY_TABS[rawTab]
  if (!rawTab && searchParams.get('report')) rawTab = 'informes'
  const active = sections.some(s => s.key === rawTab) ? rawTab : 'inicio'
  const reports = meta?.reports || []
  const reportParam = searchParams.get('report')
  const selectedReport = reports.some(r => r.token === reportParam) ? reportParam : (reports[0]?.token ?? null)

  const navigate = useCallback((tab, view, extra = {}) => {
    setSearchParams(prev => {
      const next = new URLSearchParams()
      if (tab && tab !== 'inicio') next.set('tab', tab)
      if (view) next.set('view', view)
      for (const [k, v] of Object.entries(extra)) if (v != null) next.set(k, v)
      // conserva el informe elegido si seguimos en Resultados
      if (tab === 'informes' && !extra.report && prev.get('report')) next.set('report', prev.get('report'))
      return next
    }, { replace: false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [setSearchParams])

  const handlePending = useCallback(n => setPendingCount(n), [])

  if (loading) return <PortalSkeleton />
  if (error || !meta) {
    return <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10"><Card><ErrorState message={error} onRetry={() => setNonce(n => n + 1)} /></Card></div>
  }

  const viewer = meta.viewer || null
  const projectSection = sections.find(s => s.key === 'proyecto')
  const projectView = projectSection?.subs.some(s => s.key === rawView) ? rawView : projectSection?.subs[0]?.key

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f7f7f8' }}>
      <PortalHeader workspace={meta.workspace} projectName={meta.project?.name || projectName} sections={sections}
        active={active} onNavigate={t => navigate(t)} pendingCount={pendingCount} brandPrimary={brandPrimary}
        viewer={viewer} onLogout={requireReauth} />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-28 md:pb-12">
        {active === 'inicio' && (
          <>
            {hasBanner && <PortalCover slug={slug} />}
            <PortalHome
              meta={meta} pendingCount={pendingCount} brandPrimary={brandPrimary} projectName={meta.project?.name || projectName}
              onNavigate={navigate}
              onReview={pieceId => { setPieceToOpen(pieceId ?? QUEUE_START); navigate('contenido') }}
            />
          </>
        )}

        {active === 'contenido' && (
          <ClientContentTab
            slug={slug} token={token} requireReauth={requireReauth} brandPrimary={brandPrimary}
            viewerCanApprove={viewer ? viewer.canApprove !== false : true}
            initialPieceId={pieceToOpen}
            onInitialPieceConsumed={() => setPieceToOpen(null)}
            onPendingChange={handlePending}
          />
        )}

        {active === 'informes' && (
          <ClientReportsSection
            slug={slug} token={token} requireReauth={requireReauth} meta={meta} brandPrimary={brandPrimary}
            sub={rawView} onSubChange={v => navigate('informes', v)}
            selectedReport={selectedReport} onSelectReport={t => navigate('informes', 'mensuales', { report: t })}
          />
        )}

        {active === 'proyecto' && projectSection && (
          <div>
            <SectionTitle title="Proyecto" subtitle="Quiénes trabajan en tu cuenta, lo que acordamos y los materiales" />
            {projectSection.subs.length > 1 && (
              <Segmented className="mb-5" brandPrimary={brandPrimary} value={projectView} onChange={v => navigate('proyecto', v)}
                options={projectSection.subs} />
            )}
            {projectView === 'equipo' && <ClientTeamTab team={meta.team} meetings={meta.meetings} today={meta.today} />}
            {projectView === 'archivos' && (
              <Card className="p-4 sm:p-6"><ClientFilesTab slug={slug} token={token} requireReauth={requireReauth} /></Card>
            )}
            {projectView === 'briefs' && <ClientBriefsView briefs={meta.briefs} />}
          </div>
        )}
      </main>

      <div className="pb-20 md:pb-0"><PortalFooter /></div>

      <MobileNav sections={sections} active={active} onNavigate={t => navigate(t)} pendingCount={pendingCount} brandPrimary={brandPrimary} />
    </div>
  )
}

// Portal inactivo/inexistente — nunca llegamos siquiera a mostrar el login.
function PortalUnavailable({ error }) {
  return (
    <div className="min-h-screen bg-[#f7f7f8] flex items-center justify-center px-4">
      <Card className="text-center max-w-sm p-8">
        <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center"><Icon name="lock" className="w-6 h-6" /></div>
        <p className="text-lg font-semibold text-gray-900 mb-1">Este portal no está disponible</p>
        <p className="text-sm text-gray-500">{error || 'Puede que el link haya cambiado. Pedile el link actualizado a tu agencia.'}</p>
      </Card>
    </div>
  )
}

export default function ClientPortal() {
  const { token: slug } = useParams()
  const [searchParams]  = useSearchParams()
  // ?mt=<magic-token>, viene del email "Pedir aprobación" de Contenido — deja
  // entrar directo por 72h desde el envío, sin pasar por el código OTP.
  const magicToken = searchParams.get('mt') || null
  const [branding, setBranding] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  // Único fetch público de todo el portal: nombre de proyecto + branding del
  // workspace, lo justo para pintar la pantalla de ingreso. Todo lo demás
  // vive detrás de <PortalLoginGate>.
  useEffect(() => {
    if (!slug) return
    setLoading(true)
    axios.get(`${API}/api/public/client-portal/${slug}/branding`)
      .then(r => setBranding(r.data))
      .catch(err => setError(err.response?.data?.error || null))
      .finally(() => setLoading(false))
  }, [slug])

  const workspace      = branding?.workspace || null
  const brandPrimary   = workspace?.brandColors?.[0]?.hex || '#f97316'
  const brandSecondary = workspace?.brandColors?.[1]?.hex || null

  useEffect(() => {
    if (branding?.project?.name) document.title = `${branding.project.name} · Portal`
  }, [branding])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f7f8] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    )
  }
  if (error || !branding) return <PortalUnavailable error={error} />

  const agencyName = workspace?.companyName || workspace?.name || ''
  return (
    <ToastProvider>
      <PortalLoginGate
        slug={slug} brandPrimary={brandPrimary} brandSecondary={brandSecondary}
        projectName={branding.project?.name} agencyName={agencyName}
        logoUrl={workspace?.hasLogo && workspace?.slug ? `${API}/api/public/logo/${workspace.slug}` : null}
        bannerUrl={branding.hasBanner ? `${API}/api/public/client-portal-banner/${slug}` : null}
        magicToken={magicToken}
      >
        {(token, { requireReauth }) => (
          <PortalApp slug={slug} token={token} requireReauth={requireReauth} brandPrimary={brandPrimary}
            projectName={branding.project?.name} hasBanner={!!branding.hasBanner} />
        )}
      </PortalLoginGate>
    </ToastProvider>
  )
}
