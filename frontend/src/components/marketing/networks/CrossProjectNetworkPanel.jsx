import { useState, useEffect, useCallback } from 'react'
import api from '../../../api/client'
import CrossProjectRRSSPanel from '../CrossProjectRRSSPanel'
import { NetworkMark, BrandSpinner } from './ui'

/**
 * Vista "todos los clientes" de una red (sin proyecto elegido), igual para
 * Instagram, TikTok, LinkedIn, Facebook y YouTube: carga /summary/<red>, ordena
 * con CrossProjectRRSSPanel, permite borrar el último snapshot de un proyecto y,
 * en las redes con scraping, "Actualizar todo".
 *
 * @param {object}   brand
 * @param {string}   network          clave del endpoint (instagram|tiktok|linkedin|facebook|youtube)
 * @param {boolean}  [refreshable]    muestra "Actualizar todo" (redes conectables por scraping)
 * @param {string}   [audienceNoun]   "seguidores" | "suscriptores" (texto del confirm)
 * @param {function} renderSecondary  (p) => JSX con las stats secundarias de la fila
 */
export default function CrossProjectNetworkPanel({ brand, network, refreshable = false, audienceNoun = 'seguidores', renderSecondary, onSelectProject }) {
  const [data,       setData]       = useState(null)
  const [deleting,   setDeleting]   = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [flash,      setFlash]      = useState(null) // { ok, cooldown, error } — error -1 = falló la request entera

  const load = useCallback(() =>
    api.get(`/marketing/summary/${network}`)
      .then(r => setData(r.data))
      .catch(() => setData([])), [network])

  useEffect(() => { load() }, [load])

  async function refreshAll() {
    setRefreshing(true); setFlash(null)
    try {
      const { data: res } = await api.post(`/marketing/summary/rrss/${network}/refresh`)
      setFlash({
        ok: res.refreshed,
        cooldown: res.results.filter(r => r.status === 'cooldown').length,
        error:    res.results.filter(r => r.status === 'error').length,
      })
      await load()
    } catch {
      setFlash({ ok: 0, cooldown: 0, error: -1 })
    } finally { setRefreshing(false) }
  }

  async function handleDelete(p) {
    if (!window.confirm(`¿Borrar el último snapshot de ${brand.label} de "${p.projectName}" (${p.month})? También se eliminarán los registros diarios de ${audienceNoun} de ese mes. No se puede deshacer.`)) return
    setDeleting(p.projectId)
    try {
      await api.delete(`/marketing/projects/${p.projectId}/${network}/snapshots/${p.month}`)
      await load()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo borrar el snapshot.')
    } finally { setDeleting(null) }
  }

  if (data === null) return <BrandSpinner brand={brand} className="py-12" />

  if (!data.length) return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
      <NetworkMark brand={brand} size="sm" className="mx-auto mb-3 opacity-80" />
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Todavía no hay datos de {brand.label}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Elegí un proyecto arriba para conectar su cuenta.</p>
    </div>
  )

  return (
    <CrossProjectRRSSPanel
      data={data}
      title={`${brand.label} por proyecto`}
      gradient={brand.bar}
      onSelectProject={onSelectProject}
      headerAction={refreshable && (
        <button type="button" onClick={refreshAll} disabled={refreshing}
          className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {refreshing
            ? <><span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Actualizando…</>
            : <>🔄 Actualizar todo</>}
        </button>
      )}
      banner={flash && (
        <div className={`mb-4 text-xs rounded-lg px-3 py-2 border ${
          flash.error === -1
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
        }`}>
          {flash.error === -1
            ? 'No se pudo ejecutar la actualización. Reintentá en unos segundos.'
            : <>
                {flash.ok} proyecto(s) actualizado(s).
                {flash.cooldown > 0 && <span className="text-amber-600 dark:text-amber-400"> · {flash.cooldown} en cooldown (esperá unos min)</span>}
                {flash.error > 0    && <span className="text-red-600 dark:text-red-400"> · {flash.error} con error</span>}
              </>}
        </div>
      )}
      renderRowAction={p => (
        <button type="button" onClick={() => handleDelete(p)} disabled={deleting === p.projectId}
          title="Borrar este snapshot" aria-label={`Borrar el snapshot de ${p.projectName}`}
          className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 transition-colors text-sm leading-none">
          {deleting === p.projectId ? '…' : '🗑'}
        </button>
      )}
      renderSecondary={renderSecondary}
    />
  )
}
