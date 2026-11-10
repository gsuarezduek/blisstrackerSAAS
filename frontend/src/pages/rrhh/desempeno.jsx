import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import PeopleAnalyzer from '../../components/eos/personas/PeopleAnalyzer'
import PeopleHistoryModal from '../../components/eos/personas/PeopleHistoryModal'
import { SectionCard, HelpModal } from '../../components/eos/personas/personasUI'
import { PeopleAnalyzerHelp } from '../../components/eos/personas/personasHelpContent'
import { Card } from '../project-detail/ui'
import LoadingSpinner from '../../components/LoadingSpinner'

// ─── Sección "Desempeño" del panel RRHH ───────────────────────────────────────
// El Analizador de Personas (EOS) visto desde RRHH: es la misma evaluación y la
// misma tabla —mismo endpoint, mismo componente, los cambios se ven en los dos
// lados—, no una copia. Vive acá porque la pregunta "¿quién está bien en su
// puesto?" se responde con RRHH abierto, no entrando a EOS.
//
// Solo se muestra a admin/owner con el módulo EOS habilitado: /api/eos/* es
// workspaceAdminOnly, así que a un rol con acceso a RRHH pero sin EOS el panel
// le respondería 403 (el gate está en rrhhNav.js, que arma las secciones).

export function TabDesempeno() {
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')   // loading | ready | error
  const [showHelp, setShowHelp] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const load = useCallback(() => {
    setState('loading')
    api.get('/eos/personas')
      .then(r => { setData(r.data); setState('ready') })
      .catch(() => setState('error'))
  }, [])

  useEffect(() => { load() }, [load])

  // Misma escritura que en EOS → Personas: la calificación se guarda al toque y
  // el estado local se actualiza sin recargar toda la sección.
  async function handleRatingChange(userId, valueKey, rating) {
    await api.patch('/eos/people-analyzer', { userId, valueKey, rating })
    setData(prev => {
      const ratingsMap = { ...prev.ratingsMap }
      const row = { ...(ratingsMap[userId] || {}) }
      if (rating) row[valueKey] = rating
      else delete row[valueKey]
      ratingsMap[userId] = row
      return { ...prev, ratingsMap }
    })
  }

  if (state === 'loading') return <LoadingSpinner className="py-16" />
  if (state === 'error') {
    return (
      <Card className="px-4 py-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">No pudimos cargar el Analizador de Personas.</p>
        <button type="button" onClick={load}
          className="mt-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">Reintentar</button>
      </Card>
    )
  }

  const { members, coreValues, ratingsMap } = data

  return (
    <div className="space-y-4">
      <SectionCard
        title="Analizador de Personas"
        desc="Cada persona contra los Valores Medulares del workspace y el GWC de su puesto. Es la misma evaluación que EOS → Personas."
        onHelp={() => setShowHelp(true)}
        onHistory={() => setShowHistory(true)}
      >
        <PeopleAnalyzer members={members} coreValues={coreValues} ratingsMap={ratingsMap} onRatingChange={handleRatingChange} />
      </SectionCard>

      <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
        Las 3 Faltas y el Organigrama de Rendición de Cuentas siguen en{' '}
        <Link to="/admin/eos?tab=personas" className="text-primary-600 dark:text-primary-400 hover:underline">EOS → Personas</Link>.
      </p>

      {showHelp && (
        <HelpModal title="¿Cómo usar el Analizador de Personas?" onClose={() => setShowHelp(false)}>
          <PeopleAnalyzerHelp />
        </HelpModal>
      )}
      {showHistory && <PeopleHistoryModal onClose={() => setShowHistory(false)} />}
    </div>
  )
}
