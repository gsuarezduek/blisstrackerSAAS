import { useState } from 'react'
import { ConfirmModal } from './personasUI'
import { printAccountabilityChart } from './accountabilityHelpers'
import NodeModal from './NodeModal'
import { OrgTreeNode, ListTree } from './AccountabilityViews'

// ─── AccountabilityChart — contenedor principal ───────────────────────────────

export default function AccountabilityChart({ members, nodes, onCreateNode, onUpdateNode, onDeleteNode }) {
  const [modalState, setModalState] = useState(null) // { mode: 'add'|'edit', node?, parentId? }
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [view,       setView]       = useState('tree') // 'tree' | 'list'

  async function handleSave(data) {
    setSaving(true)
    try {
      if (modalState.mode === 'add') {
        await onCreateNode(data)        // data ya incluye parentId elegido en el modal
      } else {
        await onUpdateNode(modalState.node.id, data)
      }
      setModalState(null)
    } finally { setSaving(false) }
  }

  async function handleDelete(nodeId) {
    await onDeleteNode(nodeId)
    setConfirmDel(null)
  }

  const rootNodes = nodes.filter(n => n.parentId === null).sort((a, b) => a.order - b.order)

  const handlers = {
    onEdit:     node     => setModalState({ mode: 'edit', node }),
    onDelete:   nodeId   => setConfirmDel({ nodeId }),
    onAddChild: parentId => setModalState({ mode: 'add', parentId }),
  }

  return (
    <div className="space-y-4">
      {nodes.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            El organigrama está vacío. Comenzá agregando el puesto raíz.
          </p>
          <button onClick={() => setModalState({ mode: 'add', parentId: null })}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors">
            + Agregar puesto raíz
          </button>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
              {[{ id: 'tree', label: '🌳 Vista árbol' }, { id: 'list', label: '☰ Vista lista' }].map(v => (
                <button key={v.id} onClick={() => setView(v.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    view === v.id
                      ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}>
                  {v.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => printAccountabilityChart(nodes, members)}
                title="Imprimir / Exportar PDF"
                className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M5 4v3H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-1V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1Zm2 0h6v3H7V4Zm-1 9a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2H6Zm7-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                </svg>
              </button>
              <button onClick={() => setModalState({ mode: 'add', parentId: null })}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded-xl hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                + Puesto raíz
              </button>
            </div>
          </div>

          {/* Vista árbol */}
          {view === 'tree' && (
            <div className="overflow-x-auto">
              <div className="inline-flex gap-16 min-w-full justify-center py-6 px-8 bg-gray-50 dark:bg-gray-900/40 rounded-2xl border border-gray-100 dark:border-gray-800">
                {rootNodes.map(root => (
                  <OrgTreeNode key={root.id} node={root} allNodes={nodes} members={members} {...handlers} />
                ))}
              </div>
            </div>
          )}

          {/* Vista lista */}
          {view === 'list' && (
            <ListTree nodes={nodes} members={members} {...handlers} />
          )}
        </>
      )}

      {modalState && (
        <NodeModal
          node={modalState.mode === 'edit' ? modalState.node : null}
          allNodes={nodes}
          members={members}
          initialParentId={modalState.mode === 'add' ? (modalState.parentId ?? null) : null}
          onSave={handleSave}
          onClose={() => setModalState(null)}
          saving={saving}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          message="¿Eliminás este puesto? Los puestos dependientes se moverán un nivel arriba."
          onConfirm={() => handleDelete(confirmDel.nodeId)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}
