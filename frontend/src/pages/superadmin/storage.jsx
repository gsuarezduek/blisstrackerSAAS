import { useState, useEffect } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'
import { fmtBytes, StatCard } from './shared'

export function SectionStorage() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [confirmCleanup, setConfirmCleanup] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const { data } = await api.get('/superadmin/storage')
      setData(data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function cleanup() {
    setRunning(true)
    try {
      const { data: res } = await api.post('/superadmin/storage/cleanup-orphan-images', { olderThanDays: 1 })
      window.alert(
        `Eliminadas ${res.deleted} imagen(es).` +
        (res.r2Deleted ? ` ${res.r2Deleted} borradas del bucket (R2).` : '') +
        (res.vacuumed ? ' Espacio de la DB liberado (VACUUM ejecutado).' : '')
      )
      await load()
    } catch (err) {
      window.alert(`Error: ${err.response?.data?.error || err.message}`)
    } finally {
      setRunning(false)
      setConfirmCleanup(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (!data)   return null

  const { database, socialImages } = data
  const maxTableBytes = database.tables[0]?.bytes || 1

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Almacenamiento</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Tamaño de la base de datos y limpieza de imágenes de RRSS que ya no usa nadie.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Tamaño total de la base" value={fmtBytes(database.totalBytes)} />
        <StatCard
          label="Imágenes sociales en uso"
          value={socialImages.inUse.count.toLocaleString()}
          sub={fmtBytes(socialImages.inUse.bytes)}
        />
        <StatCard
          label="Imágenes huérfanas (recuperables)"
          value={socialImages.orphan.count.toLocaleString()}
          sub={fmtBytes(socialImages.orphan.bytes)}
          valueColor={socialImages.orphan.count > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
        />
      </div>

      {/* Ubicación de los blobs: object storage (R2) vs DB legacy */}
      {socialImages.location && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span>
            En object storage (R2):{' '}
            <b className="text-gray-700 dark:text-gray-300">{socialImages.location.r2.count.toLocaleString()}</b>{' '}
            ({fmtBytes(socialImages.location.r2.bytes)})
          </span>
          <span>
            En la base de datos (legacy):{' '}
            <b className={socialImages.location.db.count > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}>
              {socialImages.location.db.count.toLocaleString()}
            </b>{' '}
            ({fmtBytes(socialImages.location.db.bytes)})
            {socialImages.location.db.count > 0 && ' — pendientes de migrar'}
          </span>
        </div>
      )}

      {/* Limpieza de huérfanas */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white">Limpiar imágenes huérfanas</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {socialImages.orphan.count > 0
                ? <>Hay <b>{socialImages.orphan.count.toLocaleString()}</b> imágenes ({fmtBytes(socialImages.orphan.bytes)}) que ningún informe ni snapshot referencia. Se generan al refrescar RRSS (las URLs firmadas de los CDN cambian en cada scrape). Borrarlas no afecta nada visible.</>
                : <>No hay imágenes huérfanas. Todo lo guardado está en uso. 🎉</>}
            </p>
          </div>
          <button
            onClick={() => setConfirmCleanup(true)}
            disabled={running || socialImages.orphan.count === 0}
            className="shrink-0 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {running ? 'Limpiando…' : `Liberar ${fmtBytes(socialImages.orphan.bytes)}`}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          La limpieza automática también corre cada domingo (borra huérfanas con más de N días, configurable en Configuración → Operativo). A futuro estas imágenes se moverán a object storage.
        </p>
      </div>

      {/* Top tablas por tamaño */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">Tablas más grandes</h3>
          <button onClick={load} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">Actualizar</button>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {database.tables.map(t => (
            <div key={t.name} className="px-5 py-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-mono text-gray-700 dark:text-gray-300 truncate">{t.name}</span>
                <span className="text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap pl-3">
                  {fmtBytes(t.bytes)}
                  <span className="text-gray-400 dark:text-gray-600"> · {t.rows.toLocaleString()} filas</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary-500"
                  style={{ width: `${Math.max(2, Math.round((t.bytes / maxTableBytes) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmModal
        open={confirmCleanup}
        title="Limpiar imágenes huérfanas"
        message={`Eliminar ${socialImages.orphan.count} imagen(es) huérfana(s) (${fmtBytes(socialImages.orphan.bytes)}). Solo se borran imágenes que ya no referencia ningún informe ni snapshot. Luego se corre VACUUM para devolver el espacio al disco (la tabla queda bloqueada unos segundos). Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={running}
        onConfirm={cleanup}
        onCancel={() => setConfirmCleanup(false)}
      />
    </div>
  )
}

// ─── Coming Soon placeholder ──────────────────────────────────────────────────

