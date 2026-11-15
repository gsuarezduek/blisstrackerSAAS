import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { OverflowMenu } from '../../ui/OverflowMenu'
import {
  verdictMeta, VERDICT_OPTIONS, VERDICT_SOURCE_LABEL, pipelineMeta,
  shortHost, fmtNum,
} from './enlacesHelpers'

/**
 * La vista "Competencia": un dominio por fila, con la decisión de si podemos
 * conseguir un enlace de ahí.
 *
 * La unidad es el DOMINIO y no la página porque la decisión ("¿podemos conseguir
 * un enlace de este sitio?") se toma una vez por sitio — un export de Ahrefs de un
 * competidor son miles de filas de página para esa única decisión.
 *
 * El orden lo pone el backend: primero los dominios que enlazan a más páginas de
 * competidores, que es la señal de prioridad.
 */
export default function ProspectsTable({
  items, counts, filter, onFilter, onVerdict, onDelete, onReload,
}) {
  const [busyId, setBusyId] = useState(null)

  const total = (counts?.sin_evaluar ?? 0) + (counts?.conseguible ?? 0)
    + (counts?.no_conseguible ?? 0) + (counts?.no_vale_la_pena ?? 0) + (counts?.ya_lo_tenemos ?? 0)

  const chips = [
    { value: '',                label: 'Todos',           count: total },
    { value: 'sin_evaluar',     label: 'Sin evaluar',     count: counts?.sin_evaluar },
    { value: 'conseguible',     label: 'Conseguibles',    count: counts?.conseguible },
    { value: 'ya_lo_tenemos',   label: 'Ya lo tenemos',   count: counts?.ya_lo_tenemos },
    { value: 'no_conseguible',  label: 'No conseguibles', count: counts?.no_conseguible },
    { value: 'no_vale_la_pena', label: 'No vale la pena', count: counts?.no_vale_la_pena },
  ].filter(c => c.value === '' || c.value === filter || c.count > 0)

  async function run(id, fn) {
    setBusyId(id)
    try { await fn() } finally { setBusyId(null) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {chips.map(c => (
          <button key={c.value} onClick={() => onFilter(c.value)}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              filter === c.value
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
            {filter ? 'Ningún dominio en este estado.' : 'Todavía no hay dominios de la competencia cargados.'}
          </p>
          {!filter && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Exportá los backlinks de un competidor desde Ahrefs o Semrush e importalos acá: las filas se agrupan
              por sitio, porque la decisión se toma una vez por sitio y no por página.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
          {items.map(p => (
            <ProspectRow key={p.id} p={p} busy={busyId === p.id}
              onVerdict={(verdict, extra) => run(p.id, () => onVerdict(p, verdict, extra))}
              onDelete={() => run(p.id, () => onDelete(p))} />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          "Ya lo tenemos" lo resuelve solo el cruce de dominios con tus enlaces cargados — puede ser un enlace de
          otra página del mismo sitio. Un veredicto que corrijas a mano queda fijo: la clasificación con IA no lo pisa.
        </p>
      )}
    </div>
  )
}

function ProspectRow({ p, busy, onVerdict, onDelete }) {
  const [editing, setEditing] = useState(false)
  const meta = verdictMeta(p.effectiveVerdict)

  return (
    <div className="p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
      <span className={`shrink-0 px-2 py-0.5 text-[11px] font-semibold rounded-full border ${meta.chip}`} title={meta.help}>
        {meta.label}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.domain}</span>
          {p.exampleUrl && (
            <a href={p.exampleUrl} target="_blank" rel="noopener noreferrer"
              title="Abrir una página de ejemplo que enlaza al competidor"
              className="text-gray-300 hover:text-primary-500 dark:text-gray-600 dark:hover:text-primary-400 shrink-0">
              <ExternalLink size={13} />
            </a>
          )}
          {/* El candado distingue "lo decidimos nosotros" de "lo propuso la IA" */}
          {p.verdictLocked && (
            <span title="Veredicto corregido a mano: la clasificación con IA no lo cambia"
              className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">🔒</span>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
          {p.competitors?.length > 0
            ? <>Enlaza a {p.competitors.map(c => `${shortHost(c.domain)}${c.links > 1 ? ` (${c.links})` : ''}`).join(', ')}</>
            : 'Sin competidor atribuido'}
          {p.exampleAnchor && <> · «{p.exampleAnchor}»</>}
        </p>
        {/* La razón es la mitad del valor del veredicto: sin ella nadie sabe si confiar */}
        {p.verdictReason && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2"
            title={`${VERDICT_SOURCE_LABEL[p.verdictSource] || ''}: ${p.verdictReason}`}>
            {p.verdictReason}
          </p>
        )}
      </div>

      <div className="hidden sm:block shrink-0 w-12 text-right">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{p.linksToCompetitors || '—'}</span>
        <span className="block text-[10px] text-gray-400">enlaces</span>
      </div>

      <div className="hidden md:block shrink-0 w-12 text-right">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {p.domainRating != null ? Math.round(p.domainRating) : '—'}
        </span>
        <span className="block text-[10px] text-gray-400">DR</span>
      </div>

      <div className="hidden lg:block shrink-0 w-20 text-right">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {p.traffic != null ? fmtNum(p.traffic) : '—'}
        </span>
        <span className="block text-[10px] text-gray-400">tráfico</span>
      </div>

      {p.pipelineStatus !== 'sin_empezar' && (
        <span className={`hidden xl:inline shrink-0 px-2 py-0.5 text-[11px] font-medium rounded ${pipelineMeta(p.pipelineStatus).chip}`}>
          {pipelineMeta(p.pipelineStatus).label}
        </span>
      )}

      {editing ? (
        <select autoFocus disabled={busy} value=""
          onChange={e => { const v = e.target.value; setEditing(false); if (v) onVerdict(v) }}
          onBlur={() => setEditing(false)}
          className="shrink-0 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100">
          <option value="">Elegí…</option>
          {VERDICT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <OverflowMenu items={[
          { label: 'Decidir el veredicto', onClick: () => setEditing(true) },
          // Soltar el candado devuelve la fila a la cola de la clasificación con IA.
          ...(p.verdictLocked
            ? [{ label: 'Volver a "sin evaluar"', onClick: () => onVerdict(null, { resetVerdict: true }) }]
            : []),
          { label: 'Eliminar', onClick: onDelete, danger: true },
        ]} />
      )}
    </div>
  )
}
