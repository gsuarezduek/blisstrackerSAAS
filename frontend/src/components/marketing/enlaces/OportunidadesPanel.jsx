import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { OverflowMenu } from '../../ui/OverflowMenu'
import { pipelineMeta, verdictMeta, fmtNum, fmtDateShort } from './enlacesHelpers'

// El orden del tablero es el del trabajo, no el alfabético. `descartado` va último
// porque es donde se archiva lo que se dejó de intentar.
const STAGES = ['sin_empezar', 'contactado', 'negociando', 'conseguido', 'descartado']

/**
 * La vista "Oportunidades": el pipeline de link building.
 *
 * No es otro recurso que Competencia — es el mismo `BacklinkProspect` con otro
 * filtro (`view=pipeline`) y otro agrupamiento. Lo que muestra es lo conseguible
 * MÁS todo lo que alguien ya empezó a trabajar, porque si alguien contacta un
 * dominio sin esperar el veredicto de la IA ese trabajo no puede desaparecer del
 * tablero.
 *
 * **Nada de esto se publica al cliente.** El pipeline, los costos y los
 * responsables son internos; el informe mensual sólo muestra enlaces conseguidos.
 */
export default function OportunidadesPanel({
  items, pipelineCounts, members, loading,
  onMove, onPatch, onTask, onPromote, onReload,
}) {
  const [busyId, setBusyId] = useState(null)

  const byStage = Object.fromEntries(STAGES.map(st => [st, []]))
  for (const p of items) (byStage[p.pipelineStatus] ?? byStage.sin_empezar).push(p)

  async function run(id, fn) {
    setBusyId(id)
    try { await fn() } finally { setBusyId(null) }
  }

  const activeCost = items
    .filter(p => p.pipelineStatus !== 'descartado' && p.cost)
    .reduce((sum, p) => sum + p.cost, 0)

  if (loading && !items.length) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">Cargando oportunidades…</p>
  }

  if (!items.length) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">Todavía no hay oportunidades.</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Cargá dominios en Competencia y clasificalos: los que queden "conseguible" aparecen acá para trabajarlos.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {activeCost > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Costo comprometido en lo que sigue abierto: <span className="font-semibold text-gray-700 dark:text-gray-200">${fmtNum(activeCost)}</span>
        </p>
      )}

      {STAGES.map(stage => {
        const rows = byStage[stage]
        // Una etapa vacía se oculta, salvo las dos del principio: ver "Sin empezar"
        // en cero es la señal de que no quedó nada sin tocar.
        if (!rows.length && stage !== 'sin_empezar' && stage !== 'conseguido') return null
        const meta = pipelineMeta(stage)
        return (
          <div key={stage} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
              <span className={`px-2 py-0.5 text-[11px] font-semibold rounded ${meta.chip}`}>{meta.label}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {rows.length}{pipelineCounts?.[stage] > rows.length && ` de ${pipelineCounts[stage]}`}
              </span>
            </div>

            {!rows.length ? (
              <p className="px-4 py-5 text-xs text-gray-400 dark:text-gray-500 text-center">
                {stage === 'conseguido' ? 'Todavía no se consiguió ninguno.' : 'Nada en esta etapa.'}
              </p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map(p => (
                  <Row key={p.id} p={p} members={members} busy={busyId === p.id}
                    onMove={st => run(p.id, () => onMove(p, st))}
                    onPatch={patch => run(p.id, () => onPatch(p, patch))}
                    onTask={() => onTask(p)}
                    onPromote={() => onPromote(p)} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Row({ p, members, busy, onMove, onPatch, onTask, onPromote }) {
  const [editing, setEditing] = useState(false)
  const won = p.pipelineStatus === 'conseguido'

  return (
    <div className="p-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{p.domain}</span>
            {p.exampleUrl && (
              <a href={p.exampleUrl} target="_blank" rel="noopener noreferrer" title="Abrir una página del sitio"
                className="text-gray-300 hover:text-primary-500 dark:text-gray-600 dark:hover:text-primary-400 shrink-0">
                <ExternalLink size={13} />
              </a>
            )}
            {/* Conseguido Y ya enlazándonos: el cruce lo confirmó contra el inventario */}
            {won && p.alreadyLinked && (
              <span title="El enlace está cargado en Nuestros enlaces"
                className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                enlace cargado
              </span>
            )}
            {p.taskId && (
              <span title="Hay una tarea creada para esta oportunidad"
                className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">· con tarea</span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
            {p.linksToCompetitors > 0 && <>{p.linksToCompetitors} enlace(s) a competidores · </>}
            DR {p.domainRating != null ? Math.round(p.domainRating) : '—'}
            {p.owner && <> · {p.owner.name}</>}
            {p.cost ? <> · ${fmtNum(p.cost)}</> : null}
            {p.dueDate && <> · para el {fmtDateShort(p.dueDate)}</>}
            {!p.verdictLocked && p.verdictSource === 'ai' && <> · {verdictMeta(p.verdict).label} por IA</>}
          </p>
          {p.pipelineNote && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{p.pipelineNote}</p>
          )}
        </div>

        <select value={p.pipelineStatus} disabled={busy} onChange={e => onMove(e.target.value)}
          className="shrink-0 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200">
          {STAGES.map(st => <option key={st} value={st}>{pipelineMeta(st).label}</option>)}
        </select>

        <OverflowMenu items={[
          { label: editing ? 'Cerrar detalles' : 'Responsable, costo y fecha', onClick: () => setEditing(v => !v) },
          { label: p.taskId ? 'Crear otra tarea' : 'Crear tarea', onClick: onTask },
          // Promover es lo que cierra el circuito: nace el Backlink y el cruce
          // marca el dominio como nuestro.
          ...(!won ? [{ label: 'Marcar como conseguido', onClick: onPromote }] : []),
        ]} />
      </div>

      {editing && (
        <PipelineDetails p={p} members={members} busy={busy}
          onSave={patch => { onPatch(patch); setEditing(false) }} />
      )}
    </div>
  )
}

/** Lo operativo de una oportunidad: quién la trabaja, cuánto cuesta y para cuándo. */
function PipelineDetails({ p, members, busy, onSave }) {
  const [form, setForm] = useState({
    ownerId:      p.ownerId ?? '',
    cost:         p.cost ?? '',
    dueDate:      p.dueDate ?? '',
    pipelineNote: p.pipelineNote ?? '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 grid grid-cols-1 sm:grid-cols-4 gap-2">
      <label className="block">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Responsable</span>
        <select value={form.ownerId} onChange={e => set('ownerId', e.target.value)}
          className="mt-0.5 w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100">
          <option value="">Sin asignar</option>
          {(members || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Costo</span>
        <input type="number" min="0" value={form.cost} onChange={e => set('cost', e.target.value)}
          placeholder="0"
          className="mt-0.5 w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100" />
      </label>
      <label className="block">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Para cuándo</span>
        <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)}
          className="mt-0.5 w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100" />
      </label>
      <label className="block">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Nota</span>
        <input value={form.pipelineNote} onChange={e => set('pipelineNote', e.target.value)}
          placeholder="Con quién hablar, qué piden…"
          className="mt-0.5 w-full px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-100" />
      </label>
      <div className="sm:col-span-4 flex justify-end">
        <button type="button" disabled={busy} onClick={() => onSave({
          ownerId:      form.ownerId || null,
          cost:         form.cost === '' ? null : form.cost,
          dueDate:      form.dueDate || null,
          pipelineNote: form.pipelineNote,
        })}
          className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors">
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
