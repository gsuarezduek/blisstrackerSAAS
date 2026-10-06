import { useState, useEffect } from 'react'
import api from '../../api/client'
import { SectionCard, HelpModal } from './personas/personasUI'
import PeopleAnalyzer from './personas/PeopleAnalyzer'
import PeopleHistoryModal from './personas/PeopleHistoryModal'
import ThreeStrikes from './personas/ThreeStrikes'
import AccountabilityChart from './personas/AccountabilityChart'
import { PeopleAnalyzerHelp, AccountabilityHelp } from './personas/personasHelpContent'

// ═══════════════════════════════════════════════════════════════════════════════
// PersonasTab — componente principal
// ═══════════════════════════════════════════════════════════════════════════════

export default function PersonasTab() {
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [showHelp,    setShowHelp]    = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    api.get('/eos/personas')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleRatingChange(userId, valueKey, rating) {
    await api.patch('/eos/people-analyzer', { userId, valueKey, rating })
    setData(prev => {
      const ratingsMap = { ...prev.ratingsMap }
      if (!ratingsMap[userId]) ratingsMap[userId] = {}
      if (rating) {
        ratingsMap[userId] = { ...ratingsMap[userId], [valueKey]: rating }
      } else {
        const { [valueKey]: _, ...rest } = ratingsMap[userId]
        ratingsMap[userId] = rest
      }
      return { ...prev, ratingsMap }
    })
  }

  async function handleAddStrike(userId, reason) {
    const res = await api.post('/eos/strikes', { userId, reason })
    const strike = res.data
    setData(prev => {
      const strikesMap = { ...prev.strikesMap }
      strikesMap[userId] = [...(strikesMap[userId] || []), strike]
      return { ...prev, strikesMap }
    })
  }

  async function handleRemoveStrike(strikeId) {
    await api.delete(`/eos/strikes/${strikeId}`)
    setData(prev => {
      const strikesMap = {}
      for (const [uid, strikes] of Object.entries(prev.strikesMap)) {
        strikesMap[uid] = strikes.filter(s => s.id !== strikeId).map((s, i) => ({ ...s, strikeNumber: i + 1 }))
      }
      return { ...prev, strikesMap }
    })
  }

  async function handleCreateNode(nodeData) {
    const res = await api.post('/eos/accountability', nodeData)
    setData(prev => ({ ...prev, nodes: [...prev.nodes, res.data] }))
  }

  async function handleUpdateNode(id, changes) {
    const res = await api.patch(`/eos/accountability/${id}`, changes)
    setData(prev => ({ ...prev, nodes: prev.nodes.map(n => n.id === id ? res.data : n) }))
  }

  async function handleDeleteNode(id) {
    await api.delete(`/eos/accountability/${id}`)
    setData(prev => ({
      ...prev,
      nodes: prev.nodes
        .filter(n => n.id !== id)
        .map(n => n.parentId === id ? { ...n, parentId: prev.nodes.find(x => x.id === id)?.parentId ?? null } : n),
    }))
  }

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  const { members, coreValues, ratingsMap, strikesMap, nodes } = data

  return (
    <div className="space-y-6">
      <SectionCard
        title="Analizador de Personas"
        desc="Evaluá a cada miembro del equipo contra los Valores Medulares y el GWC de su puesto."
        onHelp={() => setShowHelp('analyzer')}
        onHistory={() => setShowHistory(true)}
      >
        <PeopleAnalyzer members={members} coreValues={coreValues} ratingsMap={ratingsMap} onRatingChange={handleRatingChange} />
      </SectionCard>

      <SectionCard
        title="Regla de las 3 Faltas"
        desc="Protocolo para acompañar y, cuando es necesario, separar a quienes no viven los valores medulares."
      >
        <ThreeStrikes members={members} strikesMap={strikesMap} onAddStrike={handleAddStrike} onRemoveStrike={handleRemoveStrike} />
      </SectionCard>

      <SectionCard
        title="Organigrama de Rendición de Cuentas"
        desc="Define quién es responsable de cada función clave de la empresa."
        onHelp={() => setShowHelp('accountability')}
      >
        <AccountabilityChart
          members={members} nodes={nodes}
          onCreateNode={handleCreateNode}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
        />
      </SectionCard>

      {showHelp === 'analyzer' && (
        <HelpModal title="¿Cómo usar el Analizador de Personas?" onClose={() => setShowHelp(null)}>
          <PeopleAnalyzerHelp />
        </HelpModal>
      )}
      {showHelp === 'accountability' && (
        <HelpModal title="¿Cómo construir el Organigrama de Rendición de Cuentas?" onClose={() => setShowHelp(null)}>
          <AccountabilityHelp />
        </HelpModal>
      )}
      {showHistory && <PeopleHistoryModal onClose={() => setShowHistory(false)} />}
    </div>
  )
}
