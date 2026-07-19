import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import ProposalModal from './ProposalModal'

const card = 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5'

function fmtDate(d) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ProposalsPanel({ leadId, onChanged }) {
  const [proposals, setProposals] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { } nueva | { proposal } editar | null

  const load = useCallback(async () => {
    const { data } = await api.get(`/ventas/leads/${leadId}/proposals`)
    setProposals(data)
    setLoading(false)
  }, [leadId])

  useEffect(() => { load() }, [load])

  async function remove(id) {
    if (!window.confirm('¿Eliminar esta propuesta?')) return
    await api.delete(`/ventas/leads/${leadId}/proposals/${id}`)
    load(); onChanged?.()
  }

  function afterSaved() { load(); onChanged?.() }

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">📄 Propuestas</h3>
        <button onClick={() => setModal({})} className="bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-3 py-1.5 text-xs font-semibold">+ Nueva propuesta</button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : proposals.length === 0 ? (
        <p className="text-sm text-gray-400">Sin propuestas. Generá una con IA a partir de los servicios y objetivos del cliente.</p>
      ) : (
        <ul className="space-y-2">
          {proposals.map(p => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0 border-gray-100 dark:border-gray-700">
              <button onClick={() => setModal({ proposal: p })} className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white truncate">{p.title || `Propuesta v${p.version}`}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'confirmed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                    {p.status === 'confirmed' ? 'Confirmada' : 'Borrador'}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">v{p.version} · {fmtDate(p.createdAt)}{p.createdBy ? ` · ${p.createdBy.name}` : ''}</div>
              </button>
              <div className="flex gap-2 shrink-0 text-sm">
                <button onClick={() => setModal({ proposal: p })} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Ver/Editar</button>
                <button onClick={() => remove(p.id)} className="text-red-400 hover:text-red-600">Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal && <ProposalModal leadId={leadId} proposal={modal.proposal} onClose={() => setModal(null)} onSaved={afterSaved} />}
    </div>
  )
}
