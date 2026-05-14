import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import api from '../../api/client'

// ═══════════════════════════════════════════════════════════════════════════════
// Constantes de estado
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS = {
  not_started: {
    label: 'Sin documentar',
    short: 'Sin doc.',
    dot:   'bg-gray-300 dark:bg-gray-600',
    badge: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
    ring:  'border-gray-200 dark:border-gray-700',
  },
  documented: {
    label: 'Documentado',
    short: 'Doc.',
    dot:   'bg-amber-400',
    badge: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    ring:  'border-amber-200 dark:border-amber-800',
  },
  followed: {
    label: 'Seguido por todos',
    short: 'FBA ✓',
    dot:   'bg-green-500',
    badge: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    ring:  'border-green-200 dark:border-green-800',
  },
}

// ═══════════════════════════════════════════════════════════════════════════════
// Markdown — renderer inline (negrita, cursiva) + bloques (lista, párrafos)
// ═══════════════════════════════════════════════════════════════════════════════

function parseInline(text) {
  // Divide en tokens **negrita**, *cursiva*, y texto plano
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

function renderMarkdown(text) {
  if (!text?.trim()) return null
  const lines   = text.split('\n')
  const result  = []
  let listBuf   = []

  const flushList = () => {
    if (!listBuf.length) return
    result.push(
      <ul key={result.length} className="list-disc list-inside space-y-0.5 pl-1">
        {listBuf.map((item, i) => (
          <li key={i} className="text-xs text-gray-600 dark:text-gray-400">{parseInline(item)}</li>
        ))}
      </ul>
    )
    listBuf = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('- ')) {
      listBuf.push(line.slice(2))
    } else {
      flushList()
      if (line.trim() === '') {
        if (i < lines.length - 1) result.push(<div key={result.length} className="h-1" />)
      } else {
        result.push(
          <p key={result.length} className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            {parseInline(line)}
          </p>
        )
      }
    }
  }
  flushList()
  return result.length > 0 ? <div className="space-y-1">{result}</div> : null
}

// ═══════════════════════════════════════════════════════════════════════════════
// Textarea que crece automáticamente con el contenido (sin scroll interno)
// ═══════════════════════════════════════════════════════════════════════════════

function AutoResizeTextarea({ value, onChange, onBlur, onKeyDown, placeholder, className }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    if (!ref.current) return
    ref.current.style.height = 'auto'
    ref.current.style.height = `${ref.current.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      rows={1}
      className={`${className} resize-none overflow-hidden`}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Exportar proceso a PDF / vista de impresión (nueva ventana)
// ═══════════════════════════════════════════════════════════════════════════════

function mdToHtml(text) {
  if (!text?.trim()) return ''

  function inlineToHtml(t) {
    return t
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
  }

  const lines    = text.split('\n')
  const parts    = []
  let   listBuf  = []

  const flushList = () => {
    if (!listBuf.length) return
    parts.push(`<ul>${listBuf.map(l => `<li>${inlineToHtml(l)}</li>`).join('')}</ul>`)
    listBuf = []
  }

  for (const line of lines) {
    if (line.startsWith('- ')) {
      listBuf.push(line.slice(2))
    } else {
      flushList()
      parts.push(line.trim() === '' ? '<br>' : `<p>${inlineToHtml(line)}</p>`)
    }
  }
  flushList()
  return parts.join('\n')
}

function printProcess(process, roles) {
  const STATUS_LABELS = {
    not_started: 'Sin documentar',
    documented:  'Documentado',
    followed:    'Seguido por todos',
  }
  const roleLabel = process.ownerRole
    ? (roles.find(r => r.name === process.ownerRole)?.label ?? process.ownerRole)
    : null
  const steps = [...process.steps].sort((a, b) => a.order - b.order)

  const stepsHtml = steps.length === 0
    ? '<p style="color:#888;font-style:italic;margin:0">Sin pasos documentados.</p>'
    : steps.map((s, i) => `
        <div class="step">
          <div class="step-num">${i + 1}</div>
          <div class="step-body">
            <div class="step-title">${s.title}</div>
            ${s.description ? `<div class="step-desc">${mdToHtml(s.description)}</div>` : ''}
          </div>
        </div>`).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${process.name}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
           margin: 0; padding: 48px 56px; color: #111; font-size: 14px; line-height: 1.5; }
    .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { margin: 0 0 6px; font-size: 24px; }
    .meta { color: #6b7280; font-size: 13px; display: flex; gap: 16px; flex-wrap: wrap; }
    .badge { display: inline-flex; align-items: center; gap: 5px; font-weight: 500; color: #374151; }
    .description { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
                   padding: 12px 16px; margin-bottom: 28px; color: #374151; font-size: 13px; }
    .section-title { font-size: 10px; font-weight: 700; letter-spacing: .09em;
                     text-transform: uppercase; color: #9ca3af; margin-bottom: 12px; }
    .step { display: flex; gap: 14px; padding: 12px 0; border-bottom: 1px solid #f3f4f6; }
    .step:last-child { border-bottom: none; }
    .step-num { font-size: 11px; font-weight: 700; color: #d1d5db; width: 22px;
                text-align: right; flex-shrink: 0; padding-top: 2px; }
    .step-title { font-weight: 500; font-size: 14px; color: #111827; }
    .step-desc { margin-top: 5px; font-size: 12px; color: #6b7280; }
    .step-desc p { margin: 2px 0; }
    .step-desc ul { margin: 4px 0; padding-left: 18px; }
    .step-desc li { margin: 2px 0; }
    .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb;
              font-size: 11px; color: #9ca3af; text-align: right; }
    @media print {
      body { padding: 24px 32px; }
      .no-print { display: none !important; }
    }
    .print-btn { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 28px;
                 padding: 8px 16px; background: #111827; color: #fff; border: none;
                 border-radius: 8px; font-size: 13px; cursor: pointer; font-family: inherit; }
    .print-btn:hover { background: #1f2937; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  <div class="header">
    <h1>${process.name}</h1>
    <div class="meta">
      ${roleLabel ? `<span class="badge">👤 ${roleLabel}</span>` : ''}
      <span class="badge">Estado: ${STATUS_LABELS[process.status] ?? process.status}</span>
      <span class="badge">${steps.length} paso${steps.length !== 1 ? 's' : ''}</span>
    </div>
  </div>
  ${process.description ? `<div class="description">${process.description}</div>` : ''}
  <div class="section-title">Pasos del proceso</div>
  ${stepsHtml}
  <div class="footer no-print">Generado desde BlissTracker · ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=820,height=700,scrollbars=yes')
  if (!win) return
  win.document.write(html)
  win.document.close()
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI primitivos
// ═══════════════════════════════════════════════════════════════════════════════

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-5">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel}  className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium">Eliminar</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Modal crear / editar proceso
// ═══════════════════════════════════════════════════════════════════════════════

function ProcessModal({ process, roles, onSave, onClose, saving }) {
  const [name,      setName]      = useState(process?.name      ?? '')
  const [ownerRole, setOwnerRole] = useState(process?.ownerRole ?? '')
  const isNew = !process?.id

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {isNew ? 'Nuevo proceso' : 'Editar proceso'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del proceso</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={200}
              placeholder="Ej: RRHH, Ventas, Operaciones, Finanzas…"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol responsable</label>
            <select value={ownerRole} onChange={e => setOwnerRole(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="">Sin asignar</option>
              {roles.map(r => <option key={r.name} value={r.name}>{r.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
          <button
            onClick={() => onSave({ name: name.trim(), ownerRole: ownerRole || null })}
            disabled={!name.trim() || saving}
            className="flex-1 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Lista lateral de procesos
// ═══════════════════════════════════════════════════════════════════════════════

function ProcessList({ processes, roles, selectedId, onSelect, onAdd, onEdit, onDelete, onMoveProcess }) {
  const [confirm, setConfirm] = useState(null)

  // Ordenar sólo por order — el usuario controla el orden manualmente
  const sorted = [...processes].sort((a, b) => a.order - b.order)

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Procesos</span>
        <button onClick={onAdd}
          className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300">
          + Agregar
        </button>
      </div>

      {/* Progress summary */}
      {processes.length > 0 && (
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
          {Object.entries(STATUS).map(([k, v]) => {
            const count = processes.filter(p => p.status === k).length
            return (
              <div key={k} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                <span className="text-xs text-gray-500 dark:text-gray-400">{count}</span>
              </div>
            )
          })}
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            {processes.filter(p => p.status === 'followed').length}/{processes.length} FBA
          </span>
        </div>
      )}

      {/* Items */}
      {sorted.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">Sin procesos todavía</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {sorted.map((p, idx) => {
            const roleLabel = p.ownerRole ? (roles.find(r => r.name === p.ownerRole)?.label ?? p.ownerRole) : null
            const st        = STATUS[p.status]
            const isSelected = p.id === selectedId
            const isFirst    = idx === 0
            const isLast     = idx === sorted.length - 1

            return (
              <li key={p.id}>
                <button
                  onClick={() => onSelect(p.id)}
                  className={`group w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                    isSelected
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                  }`}
                >
                  {/* Status dot */}
                  <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${st.dot}`} />

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary-700 dark:text-primary-300' : 'text-gray-800 dark:text-gray-200'}`}>
                      {p.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {roleLabel ? (
                        <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[90px]">{roleLabel}</span>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-600 italic">Sin rol asignado</span>
                      )}
                      <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{p.steps.length} paso{p.steps.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  {/* Acciones: reorden + editar + eliminar */}
                  <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); onMoveProcess(p.id, 'up') }}
                      disabled={isFirst}
                      title="Subir"
                      className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 text-xs leading-none">▲</button>
                    <button
                      onClick={e => { e.stopPropagation(); onMoveProcess(p.id, 'down') }}
                      disabled={isLast}
                      title="Bajar"
                      className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 text-xs leading-none">▼</button>
                    <button
                      onClick={e => { e.stopPropagation(); onEdit(p) }}
                      title="Editar"
                      className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs leading-none mt-1">✎</button>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirm(p.id) }}
                      title="Eliminar"
                      className="p-0.5 text-gray-400 hover:text-red-500 text-xs leading-none">✕</button>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {confirm && (
        <ConfirmModal
          message="¿Eliminás este proceso? Se borrarán también todos sus pasos."
          onConfirm={() => { onDelete(confirm); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Toolbar de formato para descripciones (markdown)
// ═══════════════════════════════════════════════════════════════════════════════

function FormatToolbar({ textareaRef, value, onChange }) {
  function wrap(marker) {
    const el = textareaRef.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    const selected = value.slice(start, end) || 'texto'
    const newText  = value.slice(0, start) + marker + selected + marker + value.slice(end)
    onChange(newText)
    setTimeout(() => {
      el.focus()
      const cursor = start + marker.length + selected.length + marker.length
      el.setSelectionRange(cursor, cursor)
    }, 0)
  }

  function insertList() {
    const el = textareaRef.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    const selected = value.slice(start, end)
    const lines    = selected
      ? selected.split('\n').map(l => (l.startsWith('- ') ? l : '- ' + l)).join('\n')
      : '- elemento'
    const newText  = value.slice(0, start) + lines + value.slice(end)
    onChange(newText)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + lines.length, start + lines.length)
    }, 0)
  }

  const btnCls = 'px-1.5 py-0.5 text-xs rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors select-none'

  return (
    <div className="flex gap-0.5 px-1 pb-1">
      <button type="button" onMouseDown={e => { e.preventDefault(); wrap('**') }}
        title="Negrita" className={`${btnCls} font-bold`}>B</button>
      <button type="button" onMouseDown={e => { e.preventDefault(); wrap('*') }}
        title="Cursiva" className={`${btnCls} italic`}>I</button>
      <button type="button" onMouseDown={e => { e.preventDefault(); insertList() }}
        title="Lista" className={btnCls}>• Lista</button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Paso individual (editable inline, auto-save, rich text en descripción)
// ═══════════════════════════════════════════════════════════════════════════════

function StepItem({ step, isFirst, isLast, onUpdate, onDelete, onMoveUp, onMoveDown }) {
  const [title,       setTitle]       = useState(step.title)
  const [desc,        setDesc]        = useState(step.description ?? '')
  const [showDesc,    setShowDesc]    = useState(!!step.description)
  const [editingDesc, setEditingDesc] = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const descRef    = useRef(null)
  const titleDirty = useRef(false)
  const descDirty  = useRef(false)

  // Sincronizar si el paso cambia desde afuera (ej: reordenamiento)
  useEffect(() => {
    setTitle(step.title)
    setDesc(step.description ?? '')
    titleDirty.current = false
    descDirty.current  = false
  }, [step.id])

  function handleTitleChange(val) {
    setTitle(val)
    titleDirty.current = true
  }

  function commitTitle() {
    if (titleDirty.current && title.trim()) {
      titleDirty.current = false
      onUpdate(step.id, { title: title.trim() })
    }
  }

  function handleDescChange(val) {
    setDesc(val)
    descDirty.current = true
  }

  function commitDesc() {
    if (descDirty.current) {
      descDirty.current = false
      onUpdate(step.id, { description: desc.trim() || null })
    }
  }

  function toggleDesc() {
    setShowDesc(v => {
      if (!v) setEditingDesc(false)
      return !v
    })
  }

  function startEditDesc() {
    setShowDesc(true)
    setEditingDesc(true)
    setTimeout(() => descRef.current?.focus(), 0)
  }

  function blurDesc() {
    setEditingDesc(false)
    commitDesc()
    if (!desc.trim()) setShowDesc(false)
  }

  return (
    <div className="group flex items-start gap-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
      {/* Número */}
      <span className="text-xs font-bold text-gray-300 dark:text-gray-600 w-5 pt-1.5 text-right shrink-0 select-none">
        {step.order + 1}
      </span>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <AutoResizeTextarea
          value={title}
          onChange={handleTitleChange}
          onBlur={commitTitle}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitTitle() } }}
          placeholder="Título del paso…"
          className="w-full text-sm text-gray-800 dark:text-gray-200 bg-transparent border-none outline-none focus:bg-gray-50 dark:focus:bg-gray-700/50 rounded px-1.5 py-0.5 -mx-1.5 transition-colors leading-snug"
        />

        {/* Toggle descripción */}
        <button
          onClick={showDesc && !desc.trim() ? toggleDesc : (showDesc ? toggleDesc : startEditDesc)}
          className="text-xs text-gray-400 dark:text-gray-600 hover:text-primary-500 dark:hover:text-primary-400 mt-0.5 ml-1 transition-colors">
          {showDesc ? '▲ descripción' : (desc ? '▼ descripción' : '+ descripción')}
        </button>

        {/* Descripción: vista renderizada o editor */}
        {showDesc && !editingDesc && (
          <div
            onClick={startEditDesc}
            className="mt-1.5 min-h-[1.75rem] cursor-text rounded-lg px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            {desc.trim()
              ? renderMarkdown(desc)
              : <span className="text-xs text-gray-400 dark:text-gray-500 italic">Clic para agregar descripción…</span>
            }
          </div>
        )}

        {showDesc && editingDesc && (
          <div className="mt-1.5 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-primary-400 bg-gray-50 dark:bg-gray-700/50">
            <FormatToolbar textareaRef={descRef} value={desc} onChange={handleDescChange} />
            <textarea
              ref={descRef}
              value={desc}
              onChange={e => handleDescChange(e.target.value)}
              onBlur={blurDesc}
              rows={3}
              placeholder="Descripción del paso… (quién lo hace, cuándo, cómo)"
              className="w-full px-2.5 pb-2 text-xs text-gray-600 dark:text-gray-400 bg-transparent resize-none outline-none"
            />
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
        <button onClick={onMoveUp}   disabled={isFirst} title="Subir"
          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 text-xs transition-colors leading-none">▲</button>
        <button onClick={onMoveDown} disabled={isLast}  title="Bajar"
          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 text-xs transition-colors leading-none">▼</button>
        <button onClick={() => setConfirmDel(true)} title="Eliminar"
          className="p-1 text-gray-400 hover:text-red-500 text-xs transition-colors leading-none">✕</button>
      </div>

      {confirmDel && (
        <ConfirmModal
          message="¿Eliminás este paso?"
          onConfirm={() => onDelete(step.id)}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Panel de detalle del proceso seleccionado
// ═══════════════════════════════════════════════════════════════════════════════

function ProcessDetail({ process, roles, onUpdate, onStepCreate, onStepUpdate, onStepDelete, onStepMove, onEdit }) {
  const [desc,       setDesc]       = useState(process.description ?? '')
  const [newStep,    setNewStep]    = useState('')
  const [addingStep, setAddingStep] = useState(false)
  const newStepRef = useRef(null)
  const descDirty  = useRef(false)

  // Resetear al cambiar de proceso
  useEffect(() => {
    setDesc(process.description ?? '')
    descDirty.current = false
  }, [process.id])

  function handleDescChange(val) {
    setDesc(val)
    descDirty.current = true
  }

  function commitDesc() {
    if (descDirty.current) {
      descDirty.current = false
      onUpdate(process.id, { description: desc.trim() || null })
    }
  }

  function handleStatusChange(status) {
    onUpdate(process.id, { status })
  }

  async function handleAddStep() {
    if (!newStep.trim()) return
    setAddingStep(true)
    await onStepCreate(process.id, newStep.trim())
    setNewStep('')
    setAddingStep(false)
    newStepRef.current?.focus()
  }

  const steps    = [...process.steps].sort((a, b) => a.order - b.order)
  const roleLabel = process.ownerRole
    ? (roles.find(r => r.name === process.ownerRole)?.label ?? process.ownerRole)
    : null
  const st = STATUS[process.status]

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
      {/* Header del proceso */}
      <div className={`border-b-2 ${st.ring} px-6 py-4`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
              {process.name}
            </h3>
            {roleLabel ? (
              <span className="inline-flex items-center gap-1.5 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-gray-400">
                  <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" />
                </svg>
                {roleLabel}
              </span>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 block italic">Sin rol asignado</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Selector de estado */}
            <select
              value={process.status}
              onChange={e => handleStatusChange(e.target.value)}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-400 ${st.badge} ${st.ring}`}>
              {Object.entries(STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            {/* Botón imprimir / exportar PDF */}
            <button onClick={() => printProcess(process, roles)}
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Imprimir / Exportar PDF">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.241l.305 1.984A1.75 1.75 0 0 1 14.084 19H5.915a1.75 1.75 0 0 1-1.73-2.016L4.49 15H4.25A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.749-.107 1.126-.153V2.75Zm4.5 13.5h1l-.307-2H9.807l-.307 2Zm1.997 0h.258l.527-3.44A.75.75 0 0 0 11.54 12H8.46a.75.75 0 0 0-.743.81L8.244 16.25h.258Zm-5.99-10.337c.966-.099 1.94-.17 2.923-.213L8.25 5.25a.75.75 0 0 1 .75.75v.313l.5-.063L10 5.25a.75.75 0 0 1 .75.75v.25l.5.063V6a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v.245c.984.043 1.96.114 2.925.213A.75.75 0 0 0 16.5 5.5v-2.75a.25.25 0 0 0-.25-.25h-6.5a.25.25 0 0 0-.25.25V5.5a.75.75 0 0 0-.743.663Z" clipRule="evenodd" />
              </svg>
            </button>
            {/* Botón editar nombre/rol */}
            <button onClick={() => onEdit(process)}
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Editar nombre y rol">✎</button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Descripción general */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Descripción general
          </label>
          <textarea
            value={desc}
            onChange={e => handleDescChange(e.target.value)}
            onBlur={commitDesc}
            rows={3}
            placeholder="Describí el propósito de este proceso, cuándo aplica y qué resultado produce…"
            className="w-full px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 transition-colors placeholder-gray-400"
          />
        </div>

        {/* Pasos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Pasos del proceso
            </label>
            <span className="text-xs text-gray-400 dark:text-gray-500">{steps.length} paso{steps.length !== 1 ? 's' : ''}</span>
          </div>

          {steps.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic py-3 text-center">
              Sin pasos documentados. Agregá el primero abajo.
            </p>
          )}

          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {steps.map((step, idx) => (
              <StepItem
                key={step.id}
                step={step}
                isFirst={idx === 0}
                isLast={idx === steps.length - 1}
                onUpdate={(stepId, data) => onStepUpdate(process.id, stepId, data)}
                onDelete={stepId => onStepDelete(process.id, stepId)}
                onMoveUp={() => onStepMove(process.id, step.id, 'up')}
                onMoveDown={() => onStepMove(process.id, step.id, 'down')}
              />
            ))}
          </div>

          {/* Agregar paso */}
          <div className="flex gap-2 mt-3">
            <input
              ref={newStepRef}
              type="text"
              value={newStep}
              onChange={e => setNewStep(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddStep() }}
              placeholder="Agregar paso… (Enter para guardar)"
              className="flex-1 px-3 py-2 text-sm border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent transition-colors"
            />
            <button onClick={handleAddStep} disabled={!newStep.trim() || addingStep}
              className="px-3 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium disabled:opacity-40 transition-colors">
              {addingStep ? '…' : '+'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ProcesosTab — componente principal
// ═══════════════════════════════════════════════════════════════════════════════

export default function ProcesosTab() {
  const [roles,      setRoles]      = useState([])
  const [processes,  setProcesses]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [modal,      setModal]      = useState(null)   // { mode: 'add'|'edit', process? }
  const [saving,     setSaving]     = useState(false)

  useEffect(() => {
    api.get('/eos/processes')
      .then(res => {
        setRoles(res.data.roles)
        setProcesses(res.data.processes)
        if (res.data.processes.length > 0) setSelectedId(res.data.processes[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const selectedProcess = processes.find(p => p.id === selectedId) ?? null

  // ── CRUD procesos

  async function handleSaveProcess(data) {
    setSaving(true)
    try {
      if (modal.mode === 'add') {
        const res = await api.post('/eos/processes', data)
        setProcesses(prev => [...prev, res.data])
        setSelectedId(res.data.id)
      } else {
        const res = await api.patch(`/eos/processes/${modal.process.id}`, data)
        setProcesses(prev => prev.map(p => p.id === modal.process.id ? { ...p, ...res.data } : p))
      }
      setModal(null)
    } finally { setSaving(false) }
  }

  const handleUpdateProcess = useCallback(async (id, data) => {
    const res = await api.patch(`/eos/processes/${id}`, data)
    setProcesses(prev => prev.map(p => p.id === id ? { ...p, ...res.data } : p))
  }, [])

  async function handleDeleteProcess(id) {
    await api.delete(`/eos/processes/${id}`)
    setProcesses(prev => {
      const next = prev.filter(p => p.id !== id)
      if (selectedId === id) setSelectedId(next[0]?.id ?? null)
      return next
    })
  }

  // Reordenar procesos en la lista lateral
  const handleProcessMove = useCallback(async (processId, direction) => {
    const sorted = [...processes].sort((a, b) => a.order - b.order)
    const idx    = sorted.findIndex(p => p.id === processId)
    const swap   = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= sorted.length) return

    const [a, b]   = [sorted[idx], sorted[swap]]
    const [ao, bo] = [a.order, b.order]

    // Actualizar localmente de inmediato
    setProcesses(prev => prev.map(p => {
      if (p.id === a.id) return { ...p, order: bo }
      if (p.id === b.id) return { ...p, order: ao }
      return p
    }))

    // Persistir
    await Promise.all([
      api.patch(`/eos/processes/${a.id}`, { order: bo }),
      api.patch(`/eos/processes/${b.id}`, { order: ao }),
    ])
  }, [processes])

  // ── CRUD pasos

  const handleStepCreate = useCallback(async (processId, title) => {
    const res = await api.post(`/eos/processes/${processId}/steps`, { title })
    setProcesses(prev => prev.map(p =>
      p.id === processId ? { ...p, steps: [...p.steps, res.data] } : p
    ))
  }, [])

  const handleStepUpdate = useCallback(async (processId, stepId, data) => {
    const res = await api.patch(`/eos/processes/${processId}/steps/${stepId}`, data)
    setProcesses(prev => prev.map(p =>
      p.id === processId
        ? { ...p, steps: p.steps.map(s => s.id === stepId ? { ...s, ...res.data } : s) }
        : p
    ))
  }, [])

  const handleStepDelete = useCallback(async (processId, stepId) => {
    await api.delete(`/eos/processes/${processId}/steps/${stepId}`)
    setProcesses(prev => prev.map(p =>
      p.id === processId
        ? { ...p, steps: p.steps.filter(s => s.id !== stepId).map((s, i) => ({ ...s, order: i })) }
        : p
    ))
  }, [])

  const handleStepMove = useCallback(async (processId, stepId, direction) => {
    const proc  = processes.find(p => p.id === processId)
    if (!proc)  return
    const steps = [...proc.steps].sort((a, b) => a.order - b.order)
    const idx   = steps.findIndex(s => s.id === stepId)
    const swap  = direction === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= steps.length) return

    const [a, b] = [steps[idx], steps[swap]]
    const [ao, bo] = [a.order, b.order]

    setProcesses(prev => prev.map(p =>
      p.id === processId
        ? { ...p, steps: p.steps.map(s => {
              if (s.id === a.id) return { ...s, order: bo }
              if (s.id === b.id) return { ...s, order: ao }
              return s
            }) }
        : p
    ))

    await Promise.all([
      api.patch(`/eos/processes/${processId}/steps/${a.id}`, { order: bo }),
      api.patch(`/eos/processes/${processId}/steps/${b.id}`, { order: ao }),
    ])
  }, [processes])

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="space-y-5">
      {/* Info del concepto */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-6 py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Procesos</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Identificá, documentá y estandarizá los 6–10 procesos centrales del negocio para que <strong className="text-gray-700 dark:text-gray-300">todos los sigan</strong>.
            </p>
          </div>
          {/* Leyenda de estados */}
          <div className="flex flex-wrap gap-3">
            {Object.entries(STATUS).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${v.dot}`} />
                <span className="text-xs text-gray-500 dark:text-gray-400">{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Estado vacío total */}
      {processes.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <p className="text-3xl mb-3">⚙️</p>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sin procesos documentados</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
            Los procesos centrales son los 6–10 que, si todos los siguen correctamente, hacen que el negocio funcione bien. Comenzá agregando el primero.
          </p>
          <button onClick={() => setModal({ mode: 'add' })}
            className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors">
            + Agregar primer proceso
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Lista */}
          <div className="lg:col-span-1">
            <ProcessList
              processes={processes}
              roles={roles}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAdd={() => setModal({ mode: 'add' })}
              onEdit={p => setModal({ mode: 'edit', process: p })}
              onDelete={handleDeleteProcess}
              onMoveProcess={handleProcessMove}
            />
          </div>

          {/* Detalle */}
          <div className="lg:col-span-2">
            {selectedProcess ? (
              <ProcessDetail
                key={selectedProcess.id}
                process={selectedProcess}
                roles={roles}
                onUpdate={handleUpdateProcess}
                onStepCreate={handleStepCreate}
                onStepUpdate={handleStepUpdate}
                onStepDelete={handleStepDelete}
                onStepMove={handleStepMove}
                onEdit={p => setModal({ mode: 'edit', process: p })}
              />
            ) : (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl flex items-center justify-center py-16">
                <p className="text-sm text-gray-400 dark:text-gray-500">Seleccioná un proceso para ver o editar su contenido</p>
              </div>
            )}
          </div>
        </div>
      )}

      {modal && (
        <ProcessModal
          process={modal.mode === 'edit' ? modal.process : null}
          roles={roles}
          onSave={handleSaveProcess}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}
    </div>
  )
}
