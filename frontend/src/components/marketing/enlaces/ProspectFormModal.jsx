import { useState } from 'react'
import api from '../../../api/client'
import { VERDICT_OPTIONS } from './enlacesHelpers'

/**
 * Alta manual de un dominio de competencia.
 *
 * Pide el dominio y, opcionalmente, de qué competidor salió: sin esa atribución el
 * prospecto queda cargado igual (es el caso de "este sitio me lo recomendaron"),
 * pero con ella la tabla puede mostrar la evidencia de por qué vale la pena.
 *
 * No hay campo para "Ya lo tenemos": eso lo resuelve solo el cruce de dominios
 * contra los enlaces cargados, y dejarlo escribir a mano permitiría una fila que
 * afirma que tenemos un enlace que nadie cargó.
 */
export default function ProspectFormModal({ projectId, onClose, onSaved }) {
  const [form, setForm] = useState({
    domain: '', competitorDomain: '', domainRating: '', traffic: '',
    exampleUrl: '', verdict: '', pipelineNote: '',
  })
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post(`/marketing/projects/${projectId}/backlinks/prospects`, {
        domain:           form.domain,
        competitorDomain: form.competitorDomain || undefined,
        domainRating:     form.domainRating || null,
        traffic:          form.traffic || null,
        exampleUrl:       form.exampleUrl || null,
        // `links: 1` es la evidencia mínima: alguien vio UNA página de ese sitio
        // enlazando al competidor. Sin esto la fila quedaría con la atribución
        // puesta y el contador en cero, que se lee como "no enlaza a nadie".
        links:            form.competitorDomain ? 1 : 0,
        verdict:          form.verdict || undefined,
        pipelineNote:     form.pipelineNote || null,
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el dominio.')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">

        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Agregar un dominio de competencia</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            La unidad es el sitio, no la página: la decisión de si podemos conseguir un enlace se toma una vez por sitio.
          </p>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Dominio *</span>
          <input required value={form.domain} onChange={e => set('domain', e.target.value)}
            placeholder="diario.com"
            className="mt-1 w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100" />
          <span className="text-[11px] text-gray-400 dark:text-gray-500">Podés pegar una URL completa: se guarda sólo el dominio.</span>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">¿A qué competidor enlaza?</span>
          <input value={form.competitorDomain} onChange={e => set('competitorDomain', e.target.value)}
            placeholder="competidor.com (opcional)"
            className="mt-1 w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">DR / DA</span>
            <input type="number" min="0" max="100" value={form.domainRating} onChange={e => set('domainRating', e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Tráfico estimado</span>
            <input type="number" min="0" value={form.traffic} onChange={e => set('traffic', e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100" />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Página de ejemplo</span>
          <input value={form.exampleUrl} onChange={e => set('exampleUrl', e.target.value)}
            placeholder="https://diario.com/la-nota-donde-lo-vi"
            className="mt-1 w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100" />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Veredicto</span>
            <select value={form.verdict} onChange={e => set('verdict', e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100">
              <option value="">Dejarlo sin evaluar</option>
              {VERDICT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">Si lo decidís acá, la IA no lo va a cambiar.</span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Nota</span>
            <input value={form.pipelineNote} onChange={e => set('pipelineNote', e.target.value)}
              placeholder="Con quién hablar, qué piden…"
              className="mt-1 w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-100" />
          </label>
        </div>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={busy || !form.domain.trim()}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors">
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
