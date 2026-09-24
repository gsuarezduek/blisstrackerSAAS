import { useState } from 'react'
import { BLOCK_SPECS, BLOCK_ORDER } from './proposalDocSchema'

const input = 'w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'
const label = 'block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1'
const iconBtn = 'px-1.5 py-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent'

// Editor genérico de un valor según su `kind`. Recursivo: 'items' vuelve a usar FieldEditor
// para los campos de cada ítem (ej. services → items → bullets).
function FieldEditor({ spec, value, onChange }) {
  const { kind, label: lbl } = spec

  if (kind === 'area') {
    return (
      <div>
        <label className={label}>{lbl}</label>
        <textarea className={input} rows={3} value={value ?? ''} onChange={e => onChange(e.target.value)} />
      </div>
    )
  }

  if (kind === 'select') {
    return (
      <div>
        <label className={label}>{lbl}</label>
        <select className={input} value={value ?? spec.options[0][0]} onChange={e => onChange(e.target.value)}>
          {spec.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    )
  }

  if (kind === 'number') {
    return (
      <div>
        <label className={label}>{lbl}</label>
        <input type="number" className={input} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
      </div>
    )
  }

  if (kind === 'textlist') {
    const list = Array.isArray(value) ? value : []
    const set = (i, v) => onChange(list.map((x, j) => (j === i ? v : x)))
    return (
      <div>
        <label className={label}>{lbl}</label>
        <div className="space-y-1.5">
          {list.map((t, i) => (
            <div key={i} className="flex gap-1.5">
              <textarea className={input} rows={1} value={t} onChange={e => set(i, e.target.value)} />
              <button type="button" className={iconBtn} title="Quitar" onClick={() => onChange(list.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="text-xs font-medium text-primary-600 hover:text-primary-700" onClick={() => onChange([...list, ''])}>+ Agregar</button>
        </div>
      </div>
    )
  }

  if (kind === 'items') {
    const list = Array.isArray(value) ? value : []
    const setItem = (i, patch) => onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x)))
    const move = (i, d) => { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n) }
    return (
      <div>
        <label className={label}>{lbl}</label>
        <div className="space-y-2">
          {list.map((item, i) => (
            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 space-y-2 bg-gray-50/50 dark:bg-gray-900/20">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-400">{spec.itemLabel} {i + 1}</span>
                {!spec.fixedItems && (
                  <div className="flex">
                    <button type="button" className={iconBtn} disabled={i === 0} onClick={() => move(i, -1)} title="Subir">↑</button>
                    <button type="button" className={iconBtn} disabled={i === list.length - 1} onClick={() => move(i, 1)} title="Bajar">↓</button>
                    <button type="button" className={iconBtn} onClick={() => onChange(list.filter((_, j) => j !== i))} title="Quitar">×</button>
                  </div>
                )}
              </div>
              {spec.itemFields.map(sf => <FieldEditor key={sf.key} spec={sf} value={item[sf.key]} onChange={v => setItem(i, { [sf.key]: v })} />)}
            </div>
          ))}
          {!spec.fixedItems && (
            <button type="button" className="text-xs font-medium text-primary-600 hover:text-primary-700" onClick={() => onChange([...list, spec.blankItem()])}>+ Agregar {spec.itemLabel?.toLowerCase()}</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className={label}>{lbl}</label>
      <input className={input} value={value ?? ''} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function blockSummary(b) {
  return b.heading || b.subheading || b.label || b.quote || b.from || b.text || (b.paragraphs && b.paragraphs[0]) || ''
}

// Editor por bloques del documento de una propuesta: título/subtítulo/bajada + lista de
// bloques (editar campos, reordenar, quitar, agregar). Emite el doc completo en cada cambio.
export default function ProposalDocEditor({ doc, onChange }) {
  const [open, setOpen] = useState(() => new Set())
  const [adding, setAdding] = useState(false)
  const blocks = doc.blocks || []

  const setDoc = patch => onChange({ ...doc, ...patch })
  const setBlocks = next => setDoc({ blocks: next })
  const updateBlock = (i, patch) => setBlocks(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const move = (i, d) => { const n = [...blocks]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setBlocks(n) }
  const toggle = i => setOpen(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={label}>Subtítulo (bajo el título)</label><input className={input} value={doc.subtitle || ''} onChange={e => setDoc({ subtitle: e.target.value })} /></div>
        <div><label className={label}>Bajada</label><textarea className={input} rows={1} value={doc.lead || ''} onChange={e => setDoc({ lead: e.target.value })} /></div>
      </div>

      <div className="space-y-2">
        {blocks.map((b, i) => {
          const spec = BLOCK_SPECS[b.type]
          if (!spec) return null
          const isOpen = open.has(i)
          return (
            <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/30">
                <button type="button" onClick={() => toggle(i)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                  <span className="w-5 text-center text-gray-400">{spec.icon}</span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 shrink-0">{spec.label}</span>
                  <span className="text-xs text-gray-400 truncate">{blockSummary(b)}</span>
                </button>
                <div className="flex shrink-0">
                  <button type="button" className={iconBtn} disabled={i === 0} onClick={() => move(i, -1)} title="Subir">↑</button>
                  <button type="button" className={iconBtn} disabled={i === blocks.length - 1} onClick={() => move(i, 1)} title="Bajar">↓</button>
                  <button type="button" className={iconBtn} onClick={() => { if (window.confirm('¿Quitar este bloque de la propuesta?')) setBlocks(blocks.filter((_, j) => j !== i)) }} title="Quitar">×</button>
                </div>
              </div>
              {isOpen && (
                <div className="p-3 space-y-3">
                  {spec.hint && <p className="text-[11px] text-gray-400">{spec.hint}</p>}
                  {spec.fields.map(fs => <FieldEditor key={fs.key} spec={fs} value={b[fs.key]} onChange={v => updateBlock(i, { [fs.key]: v })} />)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div>
        {adding ? (
          <div className="flex flex-wrap gap-2 p-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl">
            {BLOCK_ORDER.map(t => (
              <button key={t} type="button" onClick={() => { setBlocks([...blocks, BLOCK_SPECS[t].blank()]); setOpen(s => new Set(s).add(blocks.length)); setAdding(false) }}
                className="px-3 py-1 rounded-full text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-primary-500 hover:text-primary-600">
                {BLOCK_SPECS[t].icon} {BLOCK_SPECS[t].label}
              </button>
            ))}
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-1 text-xs text-gray-400">Cancelar</button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="text-xs font-medium text-primary-600 hover:text-primary-700 border border-dashed border-primary-300 dark:border-primary-700 rounded-full px-3 py-1">+ Agregar bloque</button>
        )}
      </div>
    </div>
  )
}
