import { avatarUrl } from '../../../utils/avatarUrl'
import { Avatar } from './personasUI'
import { Pencil, X } from 'lucide-react'
import { Icon } from '../../ui/Icon'

// ─── Vista árbol: tarjeta de nodo ─────────────────────────────────────────────

function OrgCard({ node, allNodes, members, onEdit, onDelete, onAddChild }) {
  const person = node.userId ? members.find(m => m.id === node.userId) : null

  return (
    <div className="group relative bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-3 shadow-sm hover:border-primary-400 dark:hover:border-primary-600 hover:shadow-md transition-all cursor-default select-none"
         style={{ width: 192 }}>
      {/* Botones flotantes */}
      <div className="absolute -top-3 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button onClick={() => onAddChild(node.id)} title="Agregar subordinado"
          className="w-6 h-6 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-sm font-bold flex items-center justify-center shadow">+</button>
        <button onClick={() => onEdit(node)} title="Editar"
          className="w-6 h-6 bg-gray-500 hover:bg-gray-600 text-white rounded-full text-xs flex items-center justify-center shadow"><Icon as={Pencil} size={12} /></button>
        <button onClick={() => onDelete(node.id)} title="Eliminar"
          className="w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full text-sm font-bold flex items-center justify-center shadow">×</button>
      </div>

      {/* Puesto */}
      <p className="text-sm font-bold text-gray-900 dark:text-white leading-snug line-clamp-2" title={node.seat}>
        {node.seat}
      </p>

      {/* Persona */}
      {person ? (
        <div className="flex items-center gap-1.5 mt-2">
          <img src={avatarUrl(person.avatar)} alt={person.name}
            className="w-5 h-5 rounded-full object-cover border border-gray-200 dark:border-gray-600 shrink-0" />
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{person.name}</span>
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 italic">Sin asignar</p>
      )}

      {/* Responsabilidades */}
      {node.accountabilities.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-0.5">
          {node.accountabilities.slice(0, 3).map((a, i) => (
            <p key={i} className="text-xs text-gray-500 dark:text-gray-400 truncate">· {a}</p>
          ))}
          {node.accountabilities.length > 3 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">+{node.accountabilities.length - 3} más</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Vista árbol: nodo recursivo con conectores CSS ───────────────────────────
// Cada child-wrapper tiene padding horizontal de H_PAD px.
// Los segmentos de la barra horizontal se dibujan con divs absolutos:
//   primer hijo  → left:50%  right:0   (centro → borde derecho)
//   último hijo  → left:0    right:50% (borde izquierdo → centro)
//   hijos medios → left:0    right:0   (ancho completo)
// Como los padding son simétricos, los extremos de los segmentos se tocan
// exactamente en el punto medio entre hermanos.

const H_PAD = 20 // px padding horizontal por hijo

export function OrgTreeNode({ node, allNodes, members, onEdit, onDelete, onAddChild }) {
  const children = allNodes.filter(n => n.parentId === node.id).sort((a, b) => a.order - b.order)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <OrgCard node={node} allNodes={allNodes} members={members}
        onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} />

      {children.length > 0 && (
        <>
          {/* Línea vertical bajando desde la tarjeta */}
          <div className="bg-gray-300 dark:bg-gray-600" style={{ width: 1, height: 28 }} />

          {/* Fila de hijos */}
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            {children.map((child, i) => {
              const isFirst = i === 0
              const isLast  = i === children.length - 1
              const isOnly  = children.length === 1

              return (
                <div key={child.id}
                     style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                              position: 'relative', paddingLeft: H_PAD, paddingRight: H_PAD }}>
                  {/* Segmento horizontal de la barra */}
                  {!isOnly && isFirst && (
                    <div className="absolute bg-gray-300 dark:bg-gray-600"
                         style={{ top: 0, left: '50%', right: 0, height: 1 }} />
                  )}
                  {!isOnly && isLast && (
                    <div className="absolute bg-gray-300 dark:bg-gray-600"
                         style={{ top: 0, left: 0, right: '50%', height: 1 }} />
                  )}
                  {!isOnly && !isFirst && !isLast && (
                    <div className="absolute bg-gray-300 dark:bg-gray-600"
                         style={{ top: 0, left: 0, right: 0, height: 1 }} />
                  )}
                  {/* Línea vertical bajando al hijo */}
                  <div className="bg-gray-300 dark:bg-gray-600" style={{ width: 1, height: 28 }} />
                  {/* Sub-árbol hijo */}
                  <OrgTreeNode node={child} allNodes={allNodes} members={members}
                    onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Vista lista (compacta, indentada) ────────────────────────────────────────

function ListNodeCard({ node, members, onEdit, onDelete, onAddChild }) {
  const person = node.userId ? members.find(m => m.id === node.userId) : null
  return (
    <div className="group flex items-stretch">
      <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{node.seat}</p>
            {person ? (
              <div className="flex items-center gap-1.5 mt-1">
                <Avatar src={person.avatar} name={person.name} size="sm" />
                <span className="text-xs text-gray-500 dark:text-gray-400">{person.name}</span>
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">Sin asignar</p>
            )}
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => onAddChild(node.id)} title="Agregar subordinado" className="p-1 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 text-xs">＋</button>
            <button onClick={() => onEdit(node)}        title="Editar"              className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs"><Icon as={Pencil} size={14} /></button>
            <button onClick={() => onDelete(node.id)}   title="Eliminar"            className="p-1 text-gray-400 hover:text-red-500 text-xs"><Icon as={X} size={16} /></button>
          </div>
        </div>
        {node.accountabilities.length > 0 && (
          <ul className="mt-2 space-y-0.5 pl-1 border-t border-gray-100 dark:border-gray-700 pt-2">
            {node.accountabilities.map((a, i) => (
              <li key={i} className="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1">
                <span className="text-gray-300 dark:text-gray-600 shrink-0">·</span> {a}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function ListTree({ nodes, parentId = null, members, depth = 0, onEdit, onDelete, onAddChild }) {
  const children = nodes.filter(n => n.parentId === parentId).sort((a, b) => a.order - b.order)
  if (children.length === 0) return null
  return (
    <div className={depth === 0 ? 'space-y-3' : 'ml-6 pl-4 border-l-2 border-gray-200 dark:border-gray-700 mt-3 space-y-3'}>
      {children.map(node => (
        <div key={node.id}>
          <ListNodeCard node={node} members={members} onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} />
          <ListTree nodes={nodes} parentId={node.id} members={members} depth={depth + 1}
            onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} />
        </div>
      ))}
    </div>
  )
}
