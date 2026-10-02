import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import SocialIcon from './SocialIcon'
import { Globe, ChartColumn, Search, Megaphone } from 'lucide-react'
import { Icon } from '../ui/Icon'

// Fuentes de datos de Marketing de un proyecto, en el orden en que se recorren las
// secciones. `section` = id del NAV (para ocultar las fuentes de secciones apagadas
// en Preferencias); `link` = pestaña donde vive el flujo de conexión de esa fuente.
export const CONNECTION_SOURCES = [
  { type: 'website',               label: 'Sitio web',       icon: Globe, section: null },
  { type: 'google_analytics',      label: 'Google Analytics', icon: ChartColumn, section: 'web',      link: { tab: 'web', sub: 'analytics' } },
  { type: 'google_search_console', label: 'Search Console',  icon: Search, section: 'geo-seo',  link: { tab: 'geo-seo', sub: 'diagnostico', view: 'seo' } },
  { type: 'instagram',             label: 'Instagram',       network: 'instagram', section: 'rrss', link: { tab: 'rrss', sub: 'instagram' } },
  { type: 'tiktok',                label: 'TikTok',          network: 'tiktok',    section: 'rrss', link: { tab: 'rrss', sub: 'tiktok' } },
  { type: 'linkedin',              label: 'LinkedIn',        network: 'linkedin',  section: 'rrss', link: { tab: 'rrss', sub: 'linkedin' } },
  { type: 'facebook',              label: 'Facebook',        network: 'facebook',  section: 'rrss', link: { tab: 'rrss', sub: 'facebook' } },
  { type: 'google_youtube',        label: 'YouTube',         network: 'youtube',   section: 'rrss', link: { tab: 'rrss', sub: 'youtube' } },
  { type: 'meta_ads',              label: 'Meta Ads',        icon: Megaphone, section: 'anuncios', link: { tab: 'anuncios', sub: 'meta-ads' } },
  { type: 'google_ads',            label: 'Google Ads',      icon: Megaphone, section: 'anuncios', link: { tab: 'anuncios', sub: 'google-ads' } },
]

const STATE = {
  active:  { dot: 'bg-green-500', text: 'Conectado',    cls: 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200' },
  expired: { dot: 'bg-red-500',   text: 'Reconectar',   cls: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' },
  missing: { dot: 'bg-gray-300 dark:bg-gray-600', text: 'Sin conectar', cls: 'border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400' },
}

// Estado de cada fuente: el sitio web sale de Project.websiteUrl; el resto de
// ProjectIntegration (active → conectado, cualquier otro status → hay que reconectar).
export function resolveConnections({ integrations, websiteUrl, disabledSections = [] }) {
  const byType = new Map((integrations ?? []).map(i => [i.type, i.status]))
  return CONNECTION_SOURCES
    .filter(s => !s.section || !disabledSections.includes(s.section))
    .map(s => {
      let state
      if (s.type === 'website') state = websiteUrl ? 'active' : 'missing'
      else if (!byType.has(s.type)) state = 'missing'
      else state = byType.get(s.type) === 'active' ? 'active' : 'expired'
      return { ...s, state }
    })
}

/**
 * Panel "Conexiones" arriba de Prioridades: una pastilla por fuente de datos del
 * proyecto con su estado. Lo vencido se muestra primero y en rojo (es lo que corta
 * datos de informes y hallazgos); click lleva a la pestaña donde se conecta.
 */
export default function ConnectionsPanel({ projectId, websiteUrl, disabledSections, onNavigate }) {
  const [integrations, setIntegrations] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setIntegrations(null)
    api.get(`/marketing/projects/${projectId}/integrations`)
      .then(r => setIntegrations(r.data))
      .catch(() => setIntegrations([]))
  }, [projectId])

  if (integrations === null) {
    return <div className="h-[74px] rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 animate-pulse" />
  }

  const list = resolveConnections({ integrations, websiteUrl, disabledSections })
  const expired = list.filter(c => c.state === 'expired')
  const active  = list.filter(c => c.state === 'active')
  const missing = list.filter(c => c.state === 'missing')
  // Sin expandir: lo que importa (vencidas + conectadas). Las "sin conectar" se
  // pliegan para no llenar el panel de pastillas grises en proyectos chicos.
  const shown = expanded ? [...expired, ...active, ...missing] : [...expired, ...active]

  return (
    <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Conexiones
          <span className="ml-1.5 normal-case font-medium text-gray-400 dark:text-gray-500">
            · {active.length} de {list.length} activas
          </span>
        </h3>
        {expired.length > 0 && (
          <span className="text-xs font-medium text-red-600 dark:text-red-400">
            {expired.length} {expired.length === 1 ? 'conexión vencida' : 'conexiones vencidas'} — sin datos nuevos hasta reconectar
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {shown.map(c => <ConnectionChip key={c.type} c={c} projectId={projectId} onNavigate={onNavigate} />)}
        {missing.length > 0 && (
          <button type="button" onClick={() => setExpanded(v => !v)}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline">
            {expanded ? 'Ocultar sin conectar' : `+ ${missing.length} sin conectar`}
          </button>
        )}
        {shown.length === 0 && missing.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500">No hay fuentes de datos para las secciones activas.</p>
        )}
      </div>
    </section>
  )
}

function ConnectionChip({ c, projectId, onNavigate }) {
  const st = STATE[c.state]
  const title = c.state === 'active' ? `${c.label}: conectado` : c.state === 'expired' ? `${c.label}: el acceso venció, hay que reconectar` : `${c.label}: sin conectar`
  const content = (
    <>
      {c.network
        ? <SocialIcon network={c.network} className="w-3.5 h-3.5" />
        : <Icon as={c.icon} size={14} />}
      <span>{c.label}</span>
      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} aria-hidden="true" />
      {c.state !== 'active' && <span className="font-semibold">{st.text}</span>}
    </>
  )
  const cls = `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap hover:shadow-sm transition-shadow ${st.cls}`

  // El sitio web se carga en la ficha del proyecto (Ajustes), no en Marketing.
  if (c.type === 'website') {
    return <Link to={`/my-projects/${projectId}?infoTab=ajustes`} title={title} className={cls}>{content}</Link>
  }
  return (
    <button type="button" onClick={() => onNavigate?.(c.link)} title={title} className={cls}>
      {content}
    </button>
  )
}
