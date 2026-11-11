import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import api from '../../api/client'
import PeopleAnalyzer from '../../components/eos/personas/PeopleAnalyzer'
import PeopleHistoryModal from '../../components/eos/personas/PeopleHistoryModal'
import ThreeStrikes from '../../components/eos/personas/ThreeStrikes'
import { SectionCard, HelpModal } from '../../components/eos/personas/personasUI'
import { PeopleAnalyzerHelp } from '../../components/eos/personas/personasHelpContent'
import OneOnOnes from '../../components/rrhh/OneOnOnes'
import { Card } from '../project-detail/ui'
import LoadingSpinner from '../../components/LoadingSpinner'

// ─── Sección "Desempeño" del panel RRHH ───────────────────────────────────────
// Tres cosas que se usan juntas pero vienen de lugares distintos:
//
//  · People Analyzer y 3 Faltas son de EOS (`/api/eos/*`, admin-only + flag `eos`).
//    Acá NO son una copia: mismo endpoint, mismo componente, mismo historial —
//    calificar o registrar una falta desde RRHH es hacerlo en EOS.
//  · 1on1 es de RRHH (`/api/admin/rrhh/one-on-ones`) y funciona sin EOS: un 1on1
//    es trabajo de RRHH, no de Traction.
//
// Por eso cada sub-vista lleva su propio permiso en vez de gatear la sección
// entera: un workspace sin EOS ve Desempeño con 1on1 adentro, y nada más.

const EOS_VIEWS = new Set(['analyzer', 'strikes'])

// `members` son los miembros activos del workspace, que ya tiene el shell de RRHH.
// El People Analyzer y las Faltas usan en cambio los de `/eos/personas` (traen
// `teamRole`, que es lo que pintan sus badges); 1on1 usa estos, que es lo correcto:
// se tiene un 1on1 con alguien del equipo, no con "alguien de EOS".
export function TabDesempeno({ eosAvailable, members: wsMembers = [] }) {
  const [view, setView] = useState(() => (eosAvailable ? 'analyzer' : 'oneonone'))
  const [data, setData] = useState(null)
  const [state, setState] = useState(eosAvailable ? 'loading' : 'ready')
  const [showHelp, setShowHelp] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const load = useCallback(() => {
    if (!eosAvailable) { setState('ready'); return }
    setState('loading')
    api.get('/eos/personas')
      .then(r => { setData(r.data); setState('ready') })
      .catch(() => setState('error'))
  }, [eosAvailable])

  useEffect(() => { load() }, [load])

  // Si EOS no está disponible, las vistas que dependen de él no existen.
  const views = useMemo(() => [
    { id: 'analyzer', label: 'People Analyzer', needsEos: true },
    { id: 'strikes',  label: 'Faltas',          needsEos: true },
    { id: 'oneonone', label: '1on1 y acuerdos', needsEos: false },
  ].filter(v => !v.needsEos || eosAvailable), [eosAvailable])

  useEffect(() => {
    if (!eosAvailable && EOS_VIEWS.has(view)) setView('oneonone')
  }, [eosAvailable, view])

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

  // Alta, levantado y borrado de faltas recargan: el número de cada una se deriva
  // de las ACTIVAS (ver backend/src/lib/strikes.js), así que tocar una puede
  // correr la numeración de las demás.
  async function reloadStrikes() {
    const { data: fresh } = await api.get('/eos/personas')
    setData(prev => ({ ...prev, strikesMap: fresh.strikesMap }))
  }
  async function handleAddStrike(userId, reason, agreement) {
    await api.post('/eos/strikes', { userId, reason, agreement })
    await reloadStrikes()
  }
  async function handleLiftStrike(strikeId, reason) {
    await api.patch(`/eos/strikes/${strikeId}/lift`, { reason })
    await reloadStrikes()
  }
  async function handleRemoveStrike(strikeId) {
    await api.delete(`/eos/strikes/${strikeId}`)
    await reloadStrikes()
  }

  if (state === 'loading') return <LoadingSpinner className="py-16" />
  if (state === 'error') {
    return (
      <Card className="px-4 py-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">No pudimos cargar la sección.</p>
        <button type="button" onClick={load}
          className="mt-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">Reintentar</button>
      </Card>
    )
  }

  const members = data?.members ?? []
  const strikesMap = data?.strikesMap ?? {}

  return (
    <div className="space-y-4">
      {views.length > 1 && (
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-none">
          <div className="flex gap-1.5 min-w-max">
            {views.map(v => (
              <button key={v.id} type="button" onClick={() => setView(v.id)} aria-pressed={view === v.id}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  view === v.id
                    ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white text-white dark:text-gray-900'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300'}`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'analyzer' && data && (
        <>
          <SectionCard
            title="Analizador de Personas"
            desc="Cada persona contra los Valores Medulares del workspace y el GWC de su puesto. Es la misma evaluación que EOS → Personas."
            onHelp={() => setShowHelp(true)}
            onHistory={() => setShowHistory(true)}
          >
            <PeopleAnalyzer members={members} coreValues={data.coreValues} ratingsMap={data.ratingsMap}
              onRatingChange={handleRatingChange} />
          </SectionCard>
          <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
            El Organigrama de Rendición de Cuentas sigue en{' '}
            <Link to="/admin/eos?tab=personas" className="text-primary-600 dark:text-primary-400 hover:underline">EOS → Personas</Link>.
          </p>
        </>
      )}

      {view === 'strikes' && data && (
        <SectionCard
          title="Regla de las 3 Faltas"
          desc="Protocolo para acompañar y, cuando es necesario, separar a quienes no viven los valores medulares. Una falta deja de contar cuando vence o cuando alguien la levanta."
        >
          <ThreeStrikes members={members} strikesMap={strikesMap}
            onAddStrike={handleAddStrike} onLiftStrike={handleLiftStrike} onRemoveStrike={handleRemoveStrike} />
        </SectionCard>
      )}

      {view === 'oneonone' && (
        <OneOnOnes members={wsMembers} strikesMap={strikesMap} />
      )}

      {showHelp && (
        <HelpModal title="¿Cómo usar el Analizador de Personas?" onClose={() => setShowHelp(false)}>
          <PeopleAnalyzerHelp />
        </HelpModal>
      )}
      {showHistory && <PeopleHistoryModal onClose={() => setShowHistory(false)} />}
    </div>
  )
}
