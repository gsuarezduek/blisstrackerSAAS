import { useEffect, useState } from 'react'
import api from '../../../api/client'

/**
 * Elegir qué cuentas publicitarias de Meta suma el proyecto (ej. un cliente con dos
 * sucursales, cada una con su cuenta de ads). Lista las cuentas que ve el token ya
 * conectado — no hace falta volver a loguearse con Facebook — y guarda la selección.
 * La primera tildada queda como principal.
 */
export default function MetaAdAccountsManager({ projectId, onSaved, onClose }) {
  const [accounts, setAccounts] = useState(null)
  const [max,      setMax]      = useState(10)
  const [selected, setSelected] = useState([])
  const [error,    setError]    = useState(null)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    let alive = true
    api.get(`/marketing/projects/${projectId}/integrations/meta-ads/accounts`)
      .then(r => {
        if (!alive) return
        setAccounts(r.data.accounts)
        setMax(r.data.max ?? 10)
        setSelected(r.data.accounts.filter(a => a.selected).map(a => a.id))
      })
      .catch(err => alive && setError(err.response?.data?.error || 'No se pudieron cargar las cuentas publicitarias.'))
    return () => { alive = false }
  }, [projectId])

  function toggle(id) {
    setError(null)
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await api.put(`/marketing/projects/${projectId}/integrations/meta-ads/accounts`, { accountIds: selected })
      onSaved?.()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  const currencies = new Set((accounts ?? []).filter(a => selected.includes(a.id)).map(a => a.currency).filter(Boolean))

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Cuentas publicitarias del proyecto</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Tildá todas las que tiene el cliente (por ejemplo, una por sucursal). La pestaña, el informe y el snapshot mensual las suman; arriba vas a poder ver cada una por separado.
        </p>
      </div>

      {!accounts && !error && <p className="text-xs text-gray-400 dark:text-gray-500">Buscando las cuentas de la conexión…</p>}

      {accounts && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-100 dark:border-gray-700 rounded-lg max-h-72 overflow-y-auto">
          {accounts.map(a => {
            const checked = selected.includes(a.id)
            const disabled = !checked && selected.length >= max
            return (
              <li key={a.id}>
                <label className={`flex items-center gap-3 px-3 py-2.5 text-sm ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40'}`}>
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(a.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-gray-800 dark:text-gray-200">{a.name || a.id}</span>
                    <span className="block text-xs text-gray-400 dark:text-gray-500">
                      {a.id}{a.currency ? ` · ${a.currency}` : ''}
                      {a.accountStatus != null && a.accountStatus !== 1 ? ' · inactiva' : ''}
                      {!a.available ? ' · la conexión ya no la ve' : ''}
                    </span>
                  </span>
                  {checked && selected[0] === a.id && selected.length > 1 && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">Principal</span>
                  )}
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {accounts && accounts.length === 1 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          La conexión solo ve esta cuenta. Para sumar otra, el usuario de Facebook (o el System User) que conectó tiene que tener acceso a ella en Business Manager; después reconectá.
        </p>
      )}

      {currencies.size > 1 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Las cuentas elegidas tienen monedas distintas ({[...currencies].join(', ')}) y sus montos no se pueden sumar.
        </p>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={onClose}
          className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          Cancelar
        </button>
        <button onClick={save} disabled={saving || !accounts || selected.length === 0 || currencies.size > 1}
          className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
