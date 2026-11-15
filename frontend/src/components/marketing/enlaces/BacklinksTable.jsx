import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { OverflowMenu } from '../../ui/OverflowMenu'
import { statusMeta, typeMeta, shortHost, shortPath, fmtDateShort, ORIGIN_LABEL } from './enlacesHelpers'

/**
 * El inventario de enlaces. Una fila por página que nos enlaza, con el estado que
 * dejó la última verificación.
 *
 * El estado es lo primero que se lee porque es la pregunta de la vista ("¿sigue
 * vivo lo que conseguimos?"); el DR va al final porque es el dato que menos
 * cambia y el que muchas filas no tienen.
 */
export default function BacklinksTable({ items, counts, statusFilter, onStatusFilter, onEdit, onDelete, onChecks, onConfirmStatus }) {
  const [busyId, setBusyId] = useState(null)

  const chips = [
    { value: '',               label: 'Todos',         count: Object.values(counts || {}).reduce((a, b) => a + b, 0) },
    { value: 'activo',         label: 'Activos',       count: counts?.activo },
    { value: 'perdido',        label: 'Perdidos',      count: counts?.perdido },
    { value: 'roto',           label: 'Página rota',   count: counts?.roto },
    { value: 'redirigido',     label: 'Redirigidos',   count: counts?.redirigido },
    { value: 'sin_verificar',  label: 'Sin verificar', count: counts?.sin_verificar },
  ].filter(c => c.value === '' || c.value === statusFilter || c.count > 0)

  async function run(id, fn) {
    setBusyId(id)
    try { await fn() } finally { setBusyId(null) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {chips.map(c => (
          <button key={c.value} onClick={() => onStatusFilter(c.value)}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              statusFilter === c.value
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}>
            {c.label}{c.count != null && <span className="ml-1 opacity-70">{c.count}</span>}
          </button>
        ))}
      </div>

      {!items.length ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {statusFilter ? 'Ningún enlace en este estado.' : 'Todavía no hay enlaces cargados.'}
          </p>
          {!statusFilter && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Cargalos a mano, importá un CSV de Ahrefs o Semrush, o pedíselo a un agente de IA.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
          {items.map(l => {
            const st = statusMeta(l.status)
            const tp = typeMeta(l.linkType)
            return (
              <div key={l.id} className="p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                <span className={`shrink-0 px-2 py-0.5 text-[11px] font-semibold rounded-full border ${st.chip}`}>
                  {st.label}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{shortHost(l.sourceUrl)}</span>
                    <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()} title="Abrir la página que nos enlaza"
                      className="text-gray-300 hover:text-primary-500 dark:text-gray-600 dark:hover:text-primary-400 shrink-0">
                      <ExternalLink size={13} />
                    </a>
                    {l.statusLockedAt && (
                      <span title="Alguien confirmó este estado a mano: la verificación automática no lo cambia"
                        className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">🔒</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                    {shortPath(l.sourceUrl)}
                    {l.anchor && <> · «{l.anchor}»</>}
                  </p>
                </div>

                <span className={`hidden sm:inline shrink-0 px-2 py-0.5 text-[11px] font-medium rounded ${tp.chip}`} title={tp.help}>
                  {tp.label}
                </span>

                <div className="hidden md:block shrink-0 w-14 text-right">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {l.domainRating != null ? Math.round(l.domainRating) : '—'}
                  </span>
                  <span className="block text-[10px] text-gray-400">DR</span>
                </div>

                <div className="hidden lg:block shrink-0 w-28 text-right">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    {l.lastCheckedAt ? fmtDateShort(l.lastCheckedAt) : 'Sin chequear'}
                  </span>
                  <span className="block text-[10px] text-gray-400 truncate" title={ORIGIN_LABEL[l.source] || l.source}>
                    {ORIGIN_LABEL[l.source] || l.source}
                  </span>
                </div>

                <OverflowMenu items={[
                  { label: 'Ver historial de chequeos', onClick: () => onChecks(l) },
                  { label: 'Editar',                    onClick: () => onEdit(l) },
                  // La salida para los enlaces que un sitio pinta con JS: cheerio no
                  // los ve y el verificador los daría por perdidos para siempre.
                  ...(l.status !== 'activo'
                    ? [{ label: 'Lo verifiqué: está activo', onClick: () => run(l.id, () => onConfirmStatus(l, 'activo')) }]
                    : []),
                  ...(l.statusLockedAt
                    ? [{ label: 'Volver a verificar automático', onClick: () => run(l.id, () => onConfirmStatus(l, null)) }]
                    : []),
                  { label: 'Eliminar', onClick: () => run(l.id, () => onDelete(l)), danger: true },
                ]} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
