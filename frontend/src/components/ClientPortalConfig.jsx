import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'
import ConfirmModal from './ConfirmModal'
import ClientPortalContacts from './ClientPortalContacts'
import { useFeatureFlag } from '../hooks/useFeatureFlag'

// Mismas claves que SECTION_KEYS en backend/src/controllers/monthlyReport.controller.js
// (labels/iconos espejo de SECTION_CATALOG en marketing/InformesTab.jsx).
const LIVE_SECTIONS = [
  { key: 'objectives',  label: 'Objetivos',                              icon: '🎯' },
  { key: 'analytics',   label: 'Analítica web (GA4)',                    icon: '📊' },
  { key: 'performance', label: 'Performance web',                        icon: '⚡' },
  { key: 'geo',         label: 'Presencia en IA (GEO)',                  icon: '🤖' },
  { key: 'seo',         label: 'Rendimiento del sitio (Search Console)', icon: '🔍' },
  { key: 'keywords',    label: 'Posicionamiento SEO (keywords)',         icon: '🔑' },
  { key: 'instagram',   label: 'Instagram',                              icon: '📸' },
  { key: 'tiktok',      label: 'TikTok',                                 icon: '🎵' },
  { key: 'linkedin',    label: 'LinkedIn',                               icon: '💼' },
  { key: 'facebook',    label: 'Facebook',                               icon: '👍' },
  { key: 'metaAds',     label: 'Meta Ads',                               icon: '📣' },
  { key: 'googleAds',   label: 'Google Ads',                             icon: '🔎' },
  { key: 'competitors', label: 'Competidores',                           icon: '🏁' },
  { key: 'tasks',       label: 'Trabajo realizado',                      icon: '✅' },
]

// Configuración del portal de cliente (Info → antes de Equipo). Acceso externo,
// por proyecto, a Informes + Briefs (abierto), Datos en vivo (con código OTP) y,
// si el módulo Contenido está habilitado, el calendario de piezas (aprobación).
// Los contactos autorizados (multi-contacto) se administran en ClientPortalContacts,
// con sus propios endpoints — no dependen de este "Guardar".
export default function ClientPortalConfig({ projectId, canEdit }) {
  const { enabled: contenidoEnabled } = useFeatureFlag('contenido')
  const [portal,  setPortal]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [copied,  setCopied]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadPortal = useCallback(() => (
    api.get(`/projects/${projectId}/client-portal`)
      .then(r => setPortal(r.data.portal))
      .catch(() => setPortal(null))
  ), [projectId])

  useEffect(() => {
    setLoading(true)
    loadPortal().finally(() => setLoading(false))
  }, [loadPortal])

  function openEdit() {
    setDraft(portal
      ? { slug: portal.slug, active: portal.active, contentEnabled: portal.contentEnabled, showMeetings: portal.showMeetings, showTeam: portal.showTeam, liveSections: portal.liveSections }
      : { slug: '', active: true, contentEnabled: false, showMeetings: false, showTeam: false, liveSections: [] })
    setError('')
    setEditing(true)
  }

  function toggleSection(key) {
    setDraft(prev => ({
      ...prev,
      liveSections: prev.liveSections.includes(key)
        ? prev.liveSections.filter(k => k !== key)
        : [...prev.liveSections, key],
    }))
  }

  async function handleSave() {
    setSaving(true); setError('')
    try {
      const { data } = await api.put(`/projects/${projectId}/client-portal`, {
        slug:           draft.slug.trim().toLowerCase(),
        active:         draft.active,
        contentEnabled: draft.contentEnabled,
        showMeetings:   draft.showMeetings,
        showTeam:       draft.showTeam,
        liveSections:   draft.liveSections,
      })
      setPortal(data.portal)
      setEditing(false)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/projects/${projectId}/client-portal`)
      setPortal(null); setEditing(false)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(portal.publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (loading) return null
  if (!canEdit && !portal) return null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Cliente</p>
        {canEdit && !editing && (
          <button onClick={openEdit} className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">
            {portal ? '✏️ Editar' : '+ Configurar acceso'}
          </button>
        )}
      </div>

      {!editing && portal && (
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${portal.active
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                {portal.active ? 'Activo' : 'Inactivo'}
              </span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {portal.contactCount} contacto{portal.contactCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-gray-50 dark:bg-gray-900 px-2 py-1 rounded flex-1 truncate">{portal.publicUrl}</code>
              <button onClick={copyLink} className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium shrink-0">
                {copied ? '¡Copiado!' : 'Copiar link'}
              </button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Datos en vivo: {portal.liveSections.length > 0 ? `${portal.liveSections.length} secciones habilitadas` : 'ninguna sección habilitada'}
              {contenidoEnabled && (portal.contentEnabled ? ' · Contenido visible' : ' · Contenido oculto')}
              {portal.showMeetings && ' · Próxima reunión visible'}
              {portal.showTeam && ' · Equipo visible'}
            </p>
          </div>

          <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Contactos autorizados</p>
            <ClientPortalContacts projectId={projectId} contacts={portal.contacts} canEdit={canEdit} onChanged={loadPortal} />
          </div>
        </div>
      )}

      {!editing && !portal && canEdit && (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic">Sin portal configurado. El cliente no tiene acceso externo.</p>
      )}

      {editing && draft && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Link (slug)</label>
            <input
              value={draft.slug}
              onChange={e => setDraft(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
              placeholder="ej: kahuak"
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-900 rounded-lg"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={e => setDraft(prev => ({ ...prev, active: e.target.checked }))}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Portal activo</span>
          </label>
          {contenidoEnabled && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.contentEnabled}
                onChange={e => setDraft(prev => ({ ...prev, contentEnabled: e.target.checked }))}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Mostrar el calendario de contenido en el portal</span>
            </label>
          )}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.showMeetings}
              onChange={e => setDraft(prev => ({ ...prev, showMeetings: e.target.checked }))}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Mostrar la próxima reunión con el cliente en "Inicio" (fecha y título, sin notas)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.showTeam}
              onChange={e => setDraft(prev => ({ ...prev, showTeam: e.target.checked }))}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Mostrar el equipo del proyecto en "Tu equipo" (foto, nombre y rol)</span>
          </label>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Secciones habilitadas para "Datos en vivo"</p>
            <div className="flex flex-wrap gap-1.5">
              {LIVE_SECTIONS.map(s => (
                <label
                  key={s.key}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border cursor-pointer select-none ${
                    draft.liveSections.includes(s.key)
                      ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}
                >
                  <input type="checkbox" className="hidden" checked={draft.liveSections.includes(s.key)} onChange={() => toggleSection(s.key)} />
                  {s.icon} {s.label}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-sm px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              Cancelar
            </button>
            {portal && (
              <button onClick={() => setConfirmDelete(true)} className="text-sm px-3 py-1.5 text-red-600 hover:text-red-700 ml-auto">
                Eliminar portal
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmDelete}
        title="Eliminar portal de cliente"
        message="El cliente pierde el acceso de inmediato."
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
