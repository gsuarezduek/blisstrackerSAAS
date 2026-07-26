/**
 * "Primeros pasos" — tarjeta persistente en el Dashboard, solo para admin/owner.
 * Mismo patrón que los usos existentes de SetupHintCard (RRHH, GEO): cada ítem
 * se calcula afuera y se muestra solo mientras la condición no está cumplida —
 * sin botón de "descartar", desaparece solo cuando ya no aplica.
 *
 * Fuente de verdad: GET /workspaces/current/onboarding/checklist (computa fresco,
 * sin caché). Los módulos aparecen solo si el workspace los tiene habilitados.
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import SetupHintCard from './SetupHintCard'
import { moduleMeta } from '../lib/moduleCatalog'

export default function SetupChecklist() {
  const { user } = useAuth()
  const [checklist, setChecklist] = useState(null)

  useEffect(() => {
    if (!user?.isAdmin) return
    api.get('/workspaces/current/onboarding/checklist')
      .then(({ data }) => setChecklist(data))
      .catch(() => setChecklist(null))
  }, [user?.isAdmin])

  if (!user?.isAdmin || !checklist) return null

  const items = []

  if (!checklist.team.done) {
    items.push({
      key: 'team', icon: '👥', label: 'Invitá a tu equipo',
      hint: 'BlissTracker se siente distinto con tu equipo adentro. Invitalos por email, sin gestión de contraseñas.',
      to: '/admin?tab=team', ctaLabel: 'Invitar equipo →',
    })
  }
  if (checklist.marketing && !checklist.marketing.done) {
    items.push({
      key: 'marketing', icon: moduleMeta('marketing').icon, label: 'Conectá tu primer proyecto de Marketing',
      hint: 'Sumá Google Analytics, Search Console o Ads a un proyecto para empezar a ver datos reales.',
      to: '/marketing', ctaLabel: 'Ir a Marketing →',
    })
  }
  if (checklist.eos && !checklist.eos.done) {
    items.push({
      key: 'eos', icon: moduleMeta('eos').icon, label: 'Cargá tu Visión (VTO)',
      hint: 'Definí propósito, nicho y metas del negocio — la base de todo el sistema EOS.',
      to: '/admin/eos', ctaLabel: 'Cargar Visión →',
    })
  }
  if (checklist.ventas && !checklist.ventas.done) {
    items.push({
      key: 'ventas', icon: moduleMeta('ventas').icon, label: 'Cargá tu primer lead',
      hint: 'Arrancá tu pipeline comercial — después podés investigar la empresa y generar una propuesta con IA.',
      to: '/admin/ventas', ctaLabel: 'Ir a Ventas →',
    })
  }

  if (!items.length) return null

  return (
    <div className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2 px-1">
        Primeros pasos
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map(it => (
          <SetupHintCard
            key={it.key}
            icon={it.icon}
            label={it.label}
            hint={it.hint}
            to={it.to}
            ctaLabel={it.ctaLabel}
          />
        ))}
      </div>
    </div>
  )
}
