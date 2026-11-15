import { useState, useEffect, useCallback } from 'react'
import { Link2 } from 'lucide-react'
import api from '../../../api/client'
import { Icon } from '../../ui/Icon'
import BacklinksTable from './BacklinksTable'
import BacklinkFormModal from './BacklinkFormModal'
import BacklinkChecksModal from './BacklinkChecksModal'
import BacklinkImportModal from './BacklinkImportModal'
import ProspectsTable from './ProspectsTable'
import ProspectFormModal from './ProspectFormModal'
import PerfilPanel from './PerfilPanel'
import useBacklinkJob from './useBacklinkJob'

/**
 * Shell del sub "Enlaces" de GEO/SEO. Las 4 vistas llegan por `view` desde
 * Marketing.jsx (el selector segmentado lo pinta el nav, no este componente).
 *
 * Oportunidades llega en una fase posterior; su lugar ya está marcado para que la
 * navegación no tenga agujeros.
 */
export default function EnlacesTab({ projectId, projects, view = 'nuestros' }) {
  const [items,   setItems]   = useState([])
  const [counts,  setCounts]  = useState({})
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [status,  setStatus]  = useState('')
  const [formLink, setFormLink] = useState(null)   // {} = alta, fila = edición
  const [checksLink, setChecksLink] = useState(null)
  const [importing, setImporting] = useState(null) // 'own' | 'prospects'
  // Competencia: el mismo recurso que Oportunidades, con otro filtro y otro orden.
  const [prospects, setProspects] = useState([])
  const [prospectCounts, setProspectCounts] = useState({})
  const [verdictFilter, setVerdictFilter] = useState('')
  const [addingProspect, setAddingProspect] = useState(false)

  const selected = projects?.find(p => String(p.id) === String(projectId))


  const loadLinks = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/backlinks`, { params: { status: status || undefined } })
      setItems(data.items || [])
      setCounts(data.counts || {})
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudieron leer los enlaces.')
    } finally { setLoading(false) }
  }, [projectId, status])

  const loadProfile = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/backlinks/profile`)
      setProfile(data)
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo leer el perfil.')
    } finally { setLoading(false) }
  }, [projectId])

  const loadProspects = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/backlinks/prospects`, {
        params: { verdict: verdictFilter || undefined },
      })
      setProspects(data.items || [])
      setProspectCounts(data.counts || {})
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudieron leer los dominios de la competencia.')
    } finally { setLoading(false) }
  }, [projectId, verdictFilter])

  useEffect(() => {
    if (view === 'perfil') loadProfile()
    else if (view === 'competencia') loadProspects()
    else if (view === 'nuestros') loadLinks()
  }, [view, loadLinks, loadProfile, loadProspects])
  // Al terminar la verificación se recarga la lista: los estados que cambiaron son
  // justamente lo que la persona abrió esta pantalla para ver.
  const verify = useBacklinkJob({
    projectId, kind: 'verify',
    onFinish: () => {
      loadLinks()
      if (view === 'perfil') loadProfile()
      // Un enlace que se perdió le devuelve el dominio a la competencia: el cruce
      // corre en el backend al terminar el job, así que la tabla cambió.
      if (view === 'competencia') loadProspects()
    },
  })

  async function removeLink(link) {
    if (!window.confirm(`¿Eliminar el enlace de ${link.sourceDomain}? Se borra también su historial de chequeos.`)) return
    await api.delete(`/marketing/projects/${projectId}/backlinks/${link.id}`)
    loadLinks()
  }

  // Confirmar el estado a mano sella `statusLockedAt` en el backend; mandar null
  // lo libera y el enlace vuelve a la verificación automática.
  async function confirmStatus(link, newStatus) {
    const body = newStatus ? { status: newStatus } : { unlockStatus: true }
    await api.patch(`/marketing/projects/${projectId}/backlinks/${link.id}`, body)
    loadLinks()
  }

  // Un veredicto escrito acá sella el candado en el backend y la clasificación con
  // IA deja de pisarlo; `resetVerdict` lo libera y la fila vuelve a su cola.
  async function saveVerdict(prospect, verdict, extra = {}) {
    await api.patch(`/marketing/projects/${projectId}/backlinks/prospects/${prospect.id}`,
      verdict ? { verdict } : extra)
    loadProspects()
  }

  async function removeProspect(prospect) {
    if (!window.confirm(`¿Eliminar ${prospect.domain} de la lista de competencia?`)) return
    await api.delete(`/marketing/projects/${projectId}/backlinks/prospects/${prospect.id}`)
    loadProspects()
  }

  if (!projectId) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 text-center">
        <div className="mb-3"><Icon as={Link2} size={32} className="inline-block text-gray-300 dark:text-gray-600" /></div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Enlaces (backlinks)</h3>
        <p className="text-sm text-gray-400 dark:text-gray-500 max-w-md mx-auto">
          Elegí un proyecto para registrar los enlaces conseguidos, vigilar si siguen vivos y comparar el perfil contra lo que dice Ahrefs o Semrush.
        </p>
      </div>
    )
  }

  if (view === 'perfil') {
    return <PerfilPanel projectId={projectId} profile={profile} loading={loading && !profile} onReload={loadProfile} />
  }

  if (view === 'oportunidades') {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Acá va a vivir el pipeline de link building: los dominios conseguibles, con responsable y estado.
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          En construcción. Por ahora los conseguibles se ven en Competencia, filtrando por ese veredicto.
        </p>
      </div>
    )
  }

  if (view === 'competencia') {
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Dominios que enlazan a la competencia</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Un sitio por fila. Los que ya nos enlazan se marcan solos: el resto es por dónde empezar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setImporting('prospects')}
              className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Importar CSV
            </button>
            <button onClick={() => setAddingProspect(true)}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors">
              + Agregar dominio
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
            <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {loading && !prospects.length ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Cargando dominios…</p>
        ) : (
          <ProspectsTable
            items={prospects} counts={prospectCounts}
            filter={verdictFilter} onFilter={setVerdictFilter}
            onVerdict={saveVerdict} onDelete={removeProspect}
          />
        )}

        {addingProspect && (
          <ProspectFormModal projectId={projectId}
            onClose={() => setAddingProspect(false)} onSaved={loadProspects} />
        )}
        {importing && (
          <BacklinkImportModal projectId={projectId} target={importing}
            onClose={() => setImporting(null)} onImported={loadProspects} />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Enlaces que apuntan a {selected?.name || 'este proyecto'}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Lo que cargás acá se verifica solo todos los lunes: si un enlace se cae, te enterás.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => verify.start()} disabled={verify.busy}
            className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
            {verify.busy ? 'Verificando…' : 'Verificar enlaces'}
          </button>
          <button onClick={() => setImporting('own')}
            className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Importar CSV
          </button>
          <button onClick={() => setFormLink({})}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl transition-colors">
            + Agregar enlace
          </button>
        </div>
      </div>

      {/* Progreso en vivo: el job escribe cada paso en errorMsg mientras corre */}
      {verify.busy && (
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl p-3 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-primary-500 border-t-transparent animate-spin shrink-0" />
          <p className="text-xs text-primary-700 dark:text-primary-300">{verify.job?.errorMsg || 'Iniciando…'}</p>
        </div>
      )}

      {verify.error && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400">{verify.error}</p>
        </div>
      )}

      {verify.timedOut && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            La verificación está tardando más de lo normal. Sigue corriendo en el servidor: volvé a entrar en unos minutos para ver el resultado.
          </p>
        </div>
      )}

      {/* El resultado de la última corrida, con lo perdido primero: es la razón de ser de la pantalla */}
      {!verify.busy && verify.job?.status === 'completed' && verify.job.checked > 0 && (
        <div className={`rounded-xl p-3 border ${verify.job.lost > 0
          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'}`}>
          <p className={`text-xs ${verify.job.lost > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
            {verify.job.lost > 0
              ? `Se perdieron ${verify.job.lost} enlace(s) de los ${verify.job.checked} verificados.`
              : `${verify.job.checked} enlace(s) verificados, ninguno perdido.`}
            {verify.job.changed > 0 && ` ${verify.job.changed} cambiaron de estado.`}
          </p>
        </div>
      )}

      {!verify.busy && verify.job?.status === 'failed' && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <p className="text-xs text-red-700 dark:text-red-400">{verify.job.errorMsg || 'La verificación falló.'}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {loading && !items.length ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Cargando enlaces…</p>
      ) : (
        <BacklinksTable
          items={items} counts={counts} statusFilter={status}
          onStatusFilter={setStatus}
          onEdit={setFormLink} onDelete={removeLink} onChecks={setChecksLink}
          onConfirmStatus={confirmStatus}
        />
      )}

      {formLink && (
        <BacklinkFormModal projectId={projectId} link={formLink.id ? formLink : null}
          onClose={() => setFormLink(null)} onSaved={loadLinks} />
      )}
      {checksLink && (
        <BacklinkChecksModal projectId={projectId} link={checksLink} onClose={() => setChecksLink(null)} />
      )}
      {importing && (
        <BacklinkImportModal projectId={projectId} target={importing}
          onClose={() => setImporting(null)} onImported={loadLinks} />
      )}
    </div>
  )
}
