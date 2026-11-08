import { useState } from 'react'
import api from '../api/client'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { Toggle } from '../pages/preferences/shared'

// Tarjeta "Secciones de la cuenta" en la pestaña Ajustes del proyecto: no todos los
// proyectos llevan marketing, calendario de contenido ni relevamiento. Apagar una
// saca al proyecto de esa sección entera (selector, agregados cross-proyecto,
// buscador, snapshots mensuales) y esconde su configuración acá mismo — ver concepto
// "Secciones por proyecto (Marketing, Contenido, Briefs)" en CLAUDE.md.
//
// `flag` es el feature flag del workspace: una sección que el workspace no tiene no
// se ofrece, su toggle no cambiaría nada visible. Briefs no tiene flag (está siempre
// disponible), así que este toggle es su única palanca. Es el mismo catálogo que
// ofrece `NewProjectModal.jsx` al crear — las descripciones viven acá y se comparten.
export const PROJECT_SECTIONS = [
  {
    field: 'marketingEnabled',
    flag:  'marketing',
    label: 'Marketing',
    what:  'Sitio web, integraciones de Google y redes, GEO/SEO, anuncios e informes mensuales.',
    on:    'Esta cuenta aparece en Marketing, con su sitio web y sus integraciones de Google y redes sociales.',
    off:   'Esta cuenta no aparece en Marketing. Lo ya cargado (integraciones, informes, keywords) se conserva y vuelve al prenderlo.',
    onCreate: true,
  },
  {
    field: 'contenidoEnabled',
    flag:  'contenido',
    label: 'Contenido',
    what:  'Calendario de piezas de redes, con producción y aprobación del cliente.',
    on:    'Esta cuenta aparece en el calendario de contenido, con sus piezas y la aprobación del cliente.',
    off:   'Esta cuenta no aparece en Contenido. Las piezas ya cargadas se conservan y vuelven al prenderlo.',
    onCreate: true,
  },
  {
    field: 'briefsEnabled',
    flag:  null,
    label: 'Briefs',
    what:  'Cuestionarios de relevamiento del cliente: marca, orgánico, web, ads, SEO/SEM, CRM.',
    on:    'La pestaña Briefs está disponible en esta cuenta.',
    off:   'Sin pestaña Briefs. Lo que ya se haya respondido se conserva y vuelve al prenderlo.',
    onCreate: false,
  },
]

export default function ProjectModulesToggle({ project, canEdit, onUpdated }) {
  const { enabled: marketingFlag } = useFeatureFlag('marketing')
  const { enabled: contenidoFlag } = useFeatureFlag('contenido')
  const flags = { marketing: marketingFlag, contenido: contenidoFlag }
  const [saving, setSaving] = useState(null) // field en curso
  const [error, setError]   = useState('')

  const available = PROJECT_SECTIONS.filter(m => !m.flag || flags[m.flag])
  if (!canEdit || available.length === 0) return null

  async function handleToggle(field, next) {
    setSaving(field)
    setError('')
    try {
      const { data } = await api.patch(`/projects/${project.id}/modules`, { [field]: next })
      onUpdated(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar la sección')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Secciones de la cuenta</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Qué secciones usa este proyecto. Apagar una la esconde para todo el equipo, sin borrar nada.
      </p>

      <div className="mt-3 space-y-3">
        {available.map(m => {
          const on = project[m.field] !== false
          return (
            <div key={m.field} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{m.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{on ? m.on : m.off}</p>
              </div>
              <Toggle on={on} onToggle={() => handleToggle(m.field, !on)} disabled={saving === m.field} />
            </div>
          )
        })}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
