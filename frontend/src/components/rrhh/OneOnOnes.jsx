import { useState, useEffect, useMemo, useCallback } from 'react'
import api from '../../api/client'
import { Card, CardHeader, TextButton, Avatar, EmptyNote } from '../../pages/project-detail/ui'
import LoadingSpinner from '../LoadingSpinner'
import ConfirmModal from '../ConfirmModal'
import { matchesSearch } from '../../utils/textSearch'

// ─── 1on1 y acuerdos ──────────────────────────────────────────────────────────
// El registro de las conversaciones de seguimiento. A diferencia de las reuniones
// de proyecto y de la L10 de EOS, un 1on1 no tiene cronómetro ni crea tareas:
// esas cuentan tiempo porque se le factura al cliente, y acá lo que importa no es
// cuánto duró sino a qué se llegó.
//
// Los acuerdos son filas y no un párrafo de las notas porque lo que se hace en el
// 1on1 siguiente es repasarlos uno por uno y tildar los que se cumplieron.

const fmtDate = ymd => {
  if (!ymd) return ''
  const d = new Date(`${ymd}T12:00:00`)
  return isNaN(d) ? ymd : d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const todayYmd = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })

export default function OneOnOnes({ members = [], strikesMap = {}, initialUserId = null }) {
  const [rows, setRows] = useState([])
  const [state, setState] = useState('loading')   // loading | ready | error
  const [filterUser, setFilterUser] = useState(initialUserId ? String(initialUserId) : '')
  const [query, setQuery] = useState('')
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState(null)
  const [toDelete, setToDelete] = useState(null)

  const load = useCallback(() => {
    setState('loading')
    api.get('/admin/rrhh/one-on-ones', { params: { limit: 200 } })
      .then(({ data }) => { setRows(data); setState('ready') })
      .catch(() => setState('error'))
  }, [])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const q = query.trim()
    return rows.filter(r =>
      (!filterUser || String(r.userId) === filterUser) &&
      (!q || matchesSearch(r.user?.name, q) || matchesSearch(r.notes, q)))
  }, [rows, filterUser, query])

  // Acuerdos sin cumplir de 1on1 anteriores: es lo primero que se mira al sentarse.
  const openAgreements = useMemo(() => {
    const out = []
    for (const r of rows) {
      if (filterUser && String(r.userId) !== filterUser) continue
      for (const a of r.agreements ?? []) if (!a.done) out.push({ ...a, oneOnOne: r })
    }
    return out
  }, [rows, filterUser])

  async function toggleAgreement(oneOnOneId, agreementId, done) {
    // Optimista: tildar es la acción que más se repite y esperar el round-trip en
    // cada click hace que se sienta trabada. Si falla, se recarga.
    setRows(rs => rs.map(r => r.id !== oneOnOneId ? r : {
      ...r, agreements: r.agreements.map(a => a.id === agreementId ? { ...a, done } : a),
    }))
    try {
      await api.patch(`/admin/rrhh/one-on-ones/${oneOnOneId}/agreements/${agreementId}`, { done })
    } catch { load() }
  }

  async function remove() {
    if (!toDelete) return
    try { await api.delete(`/admin/rrhh/one-on-ones/${toDelete}`) } finally { setToDelete(null); load() }
  }

  if (state === 'loading') return <LoadingSpinner className="py-16" />
  if (state === 'error') {
    return (
      <Card className="px-4 py-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">No pudimos cargar los 1on1.</p>
        <TextButton className="mt-2" onClick={load}>Reintentar</TextButton>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <select value={filterUser} onChange={e => setFilterUser(e.target.value)} aria-label="Filtrar por persona"
          className="sm:w-56 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="">Todo el equipo</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en notas o personas"
          aria-label="Buscar"
          className="flex-1 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        <button type="button" onClick={() => setComposing(c => !c)}
          className="shrink-0 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors">
          {composing ? 'Cancelar' : '+ Registrar 1on1'}
        </button>
      </div>

      {composing && (
        <OneOnOneForm members={members} strikesMap={strikesMap} defaultUserId={filterUser}
          onCancel={() => setComposing(false)}
          onSaved={() => { setComposing(false); load() }} />
      )}

      {openAgreements.length > 0 && (
        <Card>
          <CardHeader title="Acuerdos pendientes" count={openAgreements.length} />
          <ul className="px-4 pb-4 space-y-2">
            {openAgreements.map(a => (
              <li key={a.id} className="flex items-start gap-2.5">
                <input type="checkbox" checked={false} onChange={() => toggleAgreement(a.oneOnOne.id, a.id, true)}
                  className="mt-0.5 accent-primary-600" aria-label={`Marcar cumplido: ${a.text}`} />
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200">{a.text}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {a.oneOnOne.user?.name} · 1on1 del {fmtDate(a.oneOnOne.date)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {visible.length === 0 ? (
        <Card><EmptyNote><span className="block py-8 text-center">
          {rows.length === 0 ? 'Todavía no se registró ningún 1on1.' : 'Ningún 1on1 coincide con el filtro.'}
        </span></EmptyNote></Card>
      ) : (
        <ul className="space-y-3">
          {visible.map(r => (
            <li key={r.id}>
              {editing === r.id ? (
                <OneOnOneForm members={members} strikesMap={strikesMap} existing={r}
                  onCancel={() => setEditing(null)}
                  onSaved={() => { setEditing(null); load() }} />
              ) : (
                <Card>
                  <div className="px-4 pt-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar user={r.user ?? {}} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.user?.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {fmtDate(r.date)}{r.leader ? ` · con ${r.leader.name}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <TextButton onClick={() => setEditing(r.id)}>Editar</TextButton>
                      <button type="button" onClick={() => setToDelete(r.id)}
                        className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors">Eliminar</button>
                    </div>
                  </div>

                  {r.strike && (
                    <p className="mx-4 mt-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 rounded-lg px-3 py-2">
                      Sobre la falta del {fmtDate(String(r.strike.createdAt).slice(0, 10))}: {r.strike.reason}
                    </p>
                  )}

                  {r.notes && (
                    <p className="px-4 mt-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{r.notes}</p>
                  )}

                  {(r.agreements ?? []).length > 0 && (
                    <ul className="px-4 mt-3 space-y-1.5">
                      {r.agreements.map(a => (
                        <li key={a.id} className="flex items-start gap-2.5">
                          <input type="checkbox" checked={a.done} onChange={e => toggleAgreement(r.id, a.id, e.target.checked)}
                            className="mt-0.5 accent-primary-600" aria-label={`Acuerdo cumplido: ${a.text}`} />
                          <span className={`text-sm ${a.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>{a.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="pb-4" />
                </Card>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={!!toDelete}
        title="Eliminar 1on1"
        message="Se borra la conversación y sus acuerdos. No se puede deshacer."
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}

// ── Alta y edición ────────────────────────────────────────────────────────────

function OneOnOneForm({ members, strikesMap, existing, defaultUserId = '', onSaved, onCancel }) {
  const [userId, setUserId] = useState(existing ? String(existing.userId) : String(defaultUserId || ''))
  const [date, setDate] = useState(existing?.date ?? todayYmd())
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [strikeId, setStrikeId] = useState(existing?.strikeId ? String(existing.strikeId) : '')
  const [lines, setLines] = useState(() => (existing?.agreements ?? []).map(a => ({ text: a.text, done: a.done })))
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Faltas activas de la persona elegida: son las que tiene sentido revisar.
  const strikes = useMemo(
    () => (strikesMap[Number(userId)] ?? []).filter(s => s.active),
    [strikesMap, userId],
  )

  function addLine() {
    const t = draft.trim()
    if (!t) return
    setLines(l => [...l, { text: t, done: false }])
    setDraft('')
  }

  async function save() {
    if (!userId) { setError('Elegí de quién es el 1on1'); return }
    setSaving(true); setError('')
    const body = { date, notes, agreements: lines }
    try {
      if (existing) await api.patch(`/admin/rrhh/one-on-ones/${existing.id}`, body)
      else await api.post('/admin/rrhh/one-on-ones', {
        ...body, userId: Number(userId), strikeId: strikeId ? Number(strikeId) : undefined,
      })
      onSaved?.()
    } catch (e) {
      setError(e.response?.data?.error || 'No pudimos guardar el 1on1.')
    } finally { setSaving(false) }
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Persona</label>
          <select value={userId} onChange={e => { setUserId(e.target.value); setStrikeId('') }} disabled={!!existing}
            className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Elegí una persona…</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
      </div>

      {!existing && strikes.length > 0 && (
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">¿Es por una falta? (opcional)</label>
          <select value={strikeId} onChange={e => setStrikeId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">No, es un 1on1 de seguimiento</option>
            {strikes.map(s => (
              <option key={s.id} value={s.id}>Falta {s.strikeNumber} · {s.reason.slice(0, 60)}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Notas</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
          placeholder="De qué hablaron."
          className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>

      <div>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Acuerdos</label>
        {lines.length > 0 && (
          <ul className="space-y-1.5 mb-2">
            {lines.map((l, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200">
                <span className="text-gray-300 dark:text-gray-600 mt-0.5">•</span>
                <span className="flex-1">{l.text}</span>
                <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                  className="text-gray-400 hover:text-red-500 text-xs" aria-label="Quitar acuerdo">×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLine() } }}
            placeholder="A qué se comprometió, en una línea"
            className="flex-1 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
          <button type="button" onClick={addLine} disabled={!draft.trim()}
            className="shrink-0 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">Agregar</button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:underline">Cancelar</button>
        <button type="button" onClick={save} disabled={saving}
          className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl px-4 py-2 transition-colors">
          {saving ? 'Guardando…' : existing ? 'Guardar cambios' : 'Registrar 1on1'}
        </button>
      </div>
    </Card>
  )
}
