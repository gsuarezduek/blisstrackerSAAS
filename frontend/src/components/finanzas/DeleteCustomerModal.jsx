import { useState } from 'react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'

// Un cliente es un FinanceItem con tracksAccount — y un item con historial no
// se borra (el backend lo bloquea con 409, igual que en Configuración → Items):
// se arrastrarían facturas, cobros y extras que son el registro contable de la
// agencia. De ahí las dos salidas de este modal: desactivar (lo saca de
// Clientes y de los selectores de carga, conservando todo) o, sólo si nunca se
// usó, eliminarlo de verdad (admin/owner — `DELETE /items/:id` es workspaceAdminOnly).
export default function DeleteCustomerModal({ customer, onClose, onDone }) {
  const { user } = useAuth()
  const [working, setWorking] = useState('')
  const [error, setError] = useState('')

  const c = customer.counts || {}
  const usage = [
    [c.invoices, 'factura', 'facturas'],
    [c.movements, 'movimiento', 'movimientos'],
    [c.extras, 'extra', 'extras'],
    [c.nextActions, 'próxima acción', 'próximas acciones'],
  ].filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
  const canHardDelete = usage.length === 0 && user?.isAdmin

  async function run(action) {
    setWorking(action); setError('')
    try {
      if (action === 'delete') await api.delete(`/finanzas/items/${customer.id}`)
      else await api.patch(`/finanzas/items/${customer.id}`, { active: false })
      onDone()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo completar')
    } finally { setWorking('') }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Eliminar cliente</h2>

        {usage.length > 0 ? (
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p><strong className="text-gray-900 dark:text-white">{customer.name}</strong> tiene {usage.join(', ')} cargados, así que no se puede eliminar sin borrar su historial.</p>
            <p>Si ya no trabajás con este cliente, <strong className="text-gray-900 dark:text-white">desactivalo</strong>: deja de aparecer en Clientes y en los selectores de carga, y las facturas, cobros y extras se conservan tal como están.</p>
            {user?.isAdmin && <p className="text-xs text-gray-400">Se puede volver a activar desde Configuración → Items.</p>}
          </div>
        ) : (
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <p><strong className="text-gray-900 dark:text-white">{customer.name}</strong> no tiene facturas, movimientos ni extras cargados.</p>
            {canHardDelete
              ? <p>Se elimina definitivamente — esta acción no se puede deshacer.</p>
              : <p>Para eliminarlo definitivamente hace falta ser admin del workspace. Podés desactivarlo: deja de aparecer en Clientes y en los selectores de carga.</p>}
          </div>
        )}

        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

        <div className="flex flex-wrap gap-3 mt-5">
          <button onClick={onClose} disabled={!!working} className="flex-1 min-w-[6rem] border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl py-2.5 text-sm font-medium disabled:opacity-60">Cancelar</button>
          <button onClick={() => run('deactivate')} disabled={!!working}
            className={`flex-1 min-w-[6rem] rounded-xl py-2.5 text-sm font-medium disabled:opacity-60 ${canHardDelete ? 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700' : 'bg-red-500 hover:bg-red-600 text-white'}`}>
            {working === 'deactivate' ? 'Un momento…' : 'Desactivar'}
          </button>
          {canHardDelete && (
            <button onClick={() => run('delete')} disabled={!!working} className="flex-1 min-w-[6rem] bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-60">
              {working === 'delete' ? 'Un momento…' : 'Eliminar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
