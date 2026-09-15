import { useState, useEffect } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../../components/LoadingSpinner'
import ConfirmModal from '../../components/ConfirmModal'
import { fmtBytes, StatCard } from './shared'
import { TokenBar } from './aiTokens'

const STORAGE_CATEGORY_LABELS = {
  archivos:         'Archivos (Nube)',
  contenido:        'Contenido',
  imagenesSociales: 'Imágenes de RRSS',
  whatsapp:         'WhatsApp',
  chat:             'Chat',
}

export function SectionStorage() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [confirmCleanup, setConfirmCleanup] = useState(false)
  const [byWorkspace, setByWorkspace]         = useState(null)
  const [loadingByWorkspace, setLoadingByWorkspace] = useState(true)
  const [expanded, setExpanded] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const { data } = await api.get('/superadmin/storage')
      setData(data)
    } finally { setLoading(false) }
  }

  async function loadByWorkspace() {
    setLoadingByWorkspace(true)
    try {
      const { data } = await api.get('/superadmin/storage/by-workspace')
      setByWorkspace(data.workspaces)
    } finally { setLoadingByWorkspace(false) }
  }

  useEffect(() => { load(); loadByWorkspace() }, [])

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

  const ready = !loading && data && !loadingByWorkspace && byWorkspace
  if (!ready) return <LoadingSpinner />

  const { database, socialImages } = data
  const maxTableBytes = database.tables[0]?.bytes || 1

  // Totales globales en R2: Archivos/Contenido/WhatsApp viven 100% en R2 en
  // cualquier deploy con las envs R2_* configuradas (ProjectFile ni siquiera
  // tiene fallback a DB). Imágenes de RRSS es el único caso con legado real en
  // Postgres (`socialImages.location`, ya calculado aparte) — se usa solo su
  // porción `r2`, no `socialImages.inUse`/`orphan` que mezclan R2 + legacy.
  const categoryTotals = {
    archivos:         byWorkspace.reduce((s, w) => s + (w.archivos || 0), 0),
    contenido:        byWorkspace.reduce((s, w) => s + (w.contenido || 0), 0),
    imagenesSociales: socialImages.location.r2.bytes,
    whatsapp:         byWorkspace.reduce((s, w) => s + (w.whatsapp || 0), 0),
    chat:             byWorkspace.reduce((s, w) => s + (w.chat || 0), 0),
  }
  const totalR2Bytes = Object.values(categoryTotals).reduce((s, v) => s + v, 0)
  const maxCategoryBytes = Math.max(...Object.values(categoryTotals), 1)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Almacenamiento</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Object storage (R2, lo que factura Cloudflare) y base de datos (Postgres, lo que factura Railway).
        </p>
      </div>

      {/* ── Object Storage (R2) — lo que realmente crece con Archivos/Contenido ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">☁️ Object Storage (R2)</h3>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total en R2</p>
          <p className="text-3xl font-bold text-primary-600 dark:text-primary-400 mt-1">{fmtBytes(totalR2Bytes)}</p>
          <div className="mt-4 space-y-2.5">
            {Object.entries(STORAGE_CATEGORY_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-xs text-gray-600 dark:text-gray-400">{label}</span>
                <TokenBar value={categoryTotals[key]} max={maxCategoryBytes} />
                <span className="w-24 shrink-0 text-right text-xs font-medium text-gray-700 dark:text-gray-300">{fmtBytes(categoryTotals[key])}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Huérfanas: plata recuperable en R2, no solo "prolijidad" de la DB */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Imágenes de RRSS huérfanas</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {socialImages.orphan.count > 0
                  ? <>Hay <b>{socialImages.orphan.count.toLocaleString()}</b> imágenes ({fmtBytes(socialImages.orphan.bytes)}) que ningún informe ni snapshot referencia — se generan al refrescar RRSS (las URLs firmadas de los CDN cambian en cada scrape). Borrarlas libera espacio real en R2, sin afectar nada visible.</>
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
            En uso: {socialImages.inUse.count.toLocaleString()} ({fmtBytes(socialImages.inUse.bytes)}). La limpieza automática también corre cada domingo (borra huérfanas con más de N días, configurable en Configuración → Operativo).
          </p>
        </div>
      </div>

      {/* ── Base de datos (Postgres) ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">🗄️ Base de datos (Postgres)</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label="Tamaño total de la base" value={fmtBytes(database.totalBytes)} />
          <StatCard
            label="Bytes legacy pendientes de migrar a R2"
            value={fmtBytes(socialImages.location.db.bytes)}
            sub={`${socialImages.location.db.count.toLocaleString()} imagen(es) de RRSS todavía en Postgres`}
            valueColor={socialImages.location.db.count > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
          />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h4 className="font-semibold text-gray-900 dark:text-white text-sm">Tablas más grandes</h4>
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
      </div>

      {/* ── Ranking por workspace ── */}
      {byWorkspace.length > 0 && (() => {
        const withUsage = byWorkspace.filter(w => w.total > 0)
        const maxTotal  = withUsage[0]?.total || 1
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">📊 Ranking por workspace</h3>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <p className="text-xs font-normal text-gray-400">{withUsage.length} con datos</p>
                <button onClick={loadByWorkspace} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">Actualizar</button>
              </div>
              {withUsage.length === 0 ? (
                <p className="px-5 py-8 text-sm text-gray-400 text-center">Ningún workspace tiene almacenamiento usado todavía.</p>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {withUsage.map((w, idx) => {
                    const limitBytes = w.storageLimitMb > 0 ? w.storageLimitMb * 1024 * 1024 : null
                    const pct = limitBytes ? Math.round((w.total / limitBytes) * 100) : null
                    return (
                      <div key={w.workspaceId}>
                        <button
                          className="w-full px-5 py-3 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors text-left"
                          onClick={() => setExpanded(prev => prev === w.workspaceId ? null : w.workspaceId)}
                        >
                          <span className="w-5 flex-shrink-0 text-xs font-bold text-gray-300 dark:text-gray-600 tabular-nums">{idx + 1}</span>
                          <div className="w-36 flex-shrink-0 min-w-0">
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{w.name}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">{w.slug}</p>
                          </div>
                          <TokenBar value={w.total} max={maxTotal} />
                          <div className="text-right flex-shrink-0 w-32">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{fmtBytes(w.total)}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">
                              {pct != null ? `${pct}% de ${fmtBytes(limitBytes)}` : 'ilimitado'}
                            </p>
                          </div>
                          <span className={`flex-shrink-0 text-gray-400 text-xs transition-transform duration-200 ${expanded === w.workspaceId ? 'rotate-180' : ''}`}>▾</span>
                        </button>
                        {expanded === w.workspaceId && (
                          <div className="bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700">
                            {Object.entries(STORAGE_CATEGORY_LABELS).map(([key, label]) => (
                              <div key={key} className="px-5 py-2 pl-12 flex items-center gap-4">
                                <div className="w-36 flex-shrink-0">
                                  <p className="text-xs text-gray-600 dark:text-gray-400">{label}</p>
                                </div>
                                <TokenBar value={w[key] || 0} max={w.total || 1} color="bg-primary-300 dark:bg-primary-700" />
                                <div className="text-right flex-shrink-0 w-32">
                                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{fmtBytes(w[key] || 0)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })()}

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

