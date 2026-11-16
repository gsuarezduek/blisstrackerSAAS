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
import OportunidadesPanel from './OportunidadesPanel'
import PromoteModal from './PromoteModal'
import CreateTaskModal from '../CreateTaskModal'
import PerfilPanel from './PerfilPanel'
import useBacklinkJob from './useBacklinkJob'

/**
 * Shell del sub "Enlaces" de GEO/SEO. Las 4 vistas llegan por `view` desde
 * Marketing.jsx (el selector segmentado lo pinta el nav, no este componente).
 *
 * Competencia y Oportunidades leen el MISMO recurso con distinto filtro: la
 * primera decide qué sitios valen la pena, la segunda trabaja los que sí.
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
  // Oportunidades: el pipeline. Mismo recurso, otro filtro y otro agrupamiento.
  const [pipeline, setPipeline] = useState([])
  const [pipelineCounts, setPipelineCounts] = useState({})
  const [members, setMembers] = useState([])
  const [promoting, setPromoting] = useState(null)
  const [taskFor, setTaskFor] = useState(null)

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

  // `view=pipeline` no es `verdict=conseguible`: trae lo conseguible MÁS lo que
  // alguien ya empezó a trabajar, y sin el filtro de `alreadyLinked` — si no, la
  // etapa "Conseguido" quedaría siempre vacía, porque al promover el cruce marca
  // el dominio como nuestro.
  const loadPipeline = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get(`/marketing/projects/${projectId}/backlinks/prospects`, {
        params: { view: 'pipeline', limit: 100 },
      })
      setPipeline(data.items || [])
      setPipelineCounts(data.pipelineCounts || {})
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudieron leer las oportunidades.')
    } finally { setLoading(false) }
  }, [projectId])

  // El equipo del proyecto, para el selector de responsable. Se pide una sola vez
  // al entrar al pipeline, que es la única vista que lo usa.
  useEffect(() => {
    if (view !== 'oportunidades' || !projectId || members.length) return
    api.get(`/projects/${projectId}/members`).then(r => setMembers(r.data || [])).catch(() => {})
  }, [view, projectId, members.length])

  useEffect(() => {
    if (view === 'perfil') loadProfile()
    else if (view === 'competencia') loadProspects()
    else if (view === 'oportunidades') loadPipeline()
    else if (view === 'nuestros') loadLinks()
  }, [view, loadLinks, loadProfile, loadProspects, loadPipeline])
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
      if (view === 'oportunidades') loadPipeline()
    },
  })

  // El de clasificación comparte el polling con el verificador (mismo modelo de
  // job), pero su endpoint y su cuerpo los resuelve el hook por `kind`.
  const classify = useBacklinkJob({
    projectId, kind: 'classify',
    onFinish: () => { if (view === 'competencia') loadProspects() },
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

  async function patchProspect(prospect, patch) {
    await api.patch(`/marketing/projects/${projectId}/backlinks/prospects/${prospect.id}`, patch)
    loadPipeline()
  }

  // La tarea queda VINCULADA al prospecto (`taskId`), así la fila puede decir "con
  // tarea" y no se crean tres veces la misma por olvido.
  async function linkTask(prospect, task) {
    if (!task?.id) return
    try {
      await api.patch(`/marketing/projects/${projectId}/backlinks/prospects/${prospect.id}`, { taskId: task.id })
    } catch { /* la tarea ya se creó: no vincularla no la pierde */ }
    loadPipeline()
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
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Pipeline de link building</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Los dominios conseguibles y todo lo que ya se está trabajando. Nada de esto se publica al cliente:
            el informe mensual sólo muestra los enlaces conseguidos.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
            <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        <OportunidadesPanel
          items={pipeline} pipelineCounts={pipelineCounts} members={members} loading={loading}
          onMove={(p, pipelineStatus) => patchProspect(p, { pipelineStatus })}
          onPatch={patchProspect}
          onTask={setTaskFor}
          onPromote={setPromoting}
        />

        {promoting && (
          <PromoteModal projectId={projectId} prospect={promoting}
            onClose={() => setPromoting(null)}
            onDone={() => { loadPipeline(); loadLinks() }} />
        )}
        {taskFor && (
          <CreateTaskModal
            projectId={projectId} projectName={selected?.name || ''}
            defaultDescription={`Link building - Conseguir enlace de ${taskFor.domain}`}
            onClose={() => setTaskFor(null)}
            onCreated={task => linkTask(taskFor, task)} />
        )}
      </div>
    )
  }

  if (view === 'competencia') {
    // Los conteos vienen del proyecto entero, no del filtro, así que el número del
    // botón es el real aunque estés mirando otra pestaña.
    const pendingVerdicts = prospectCounts?.sin_evaluar ?? 0
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
            {/* Gasta tokens del workspace, así que el botón dice cuántos dominios
                va a evaluar antes de apretarlo y se apaga si no hay ninguno. */}
            <button onClick={() => classify.start()} disabled={classify.busy || !pendingVerdicts}
              title={!pendingVerdicts ? 'No hay dominios sin evaluar' : `Usa IA para proponer un veredicto en ${pendingVerdicts} dominio(s)`}
              className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              {classify.busy ? 'Evaluando…' : `Clasificar con IA${pendingVerdicts ? ` (${pendingVerdicts})` : ''}`}
            </button>
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

        {classify.busy && (
          <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl p-3 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border-2 border-primary-500 border-t-transparent animate-spin shrink-0" />
            <p className="text-xs text-primary-700 dark:text-primary-300">{classify.job?.errorMsg || 'Iniciando…'}</p>
          </div>
        )}

        {classify.error && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
            <p className="text-xs text-amber-700 dark:text-amber-400">{classify.error}</p>
          </div>
        )}

        {classify.timedOut && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              La clasificación está tardando más de lo normal. Sigue corriendo en el servidor: volvé a entrar en unos minutos.
            </p>
          </div>
        )}

        {/* Se informan los dos números porque pueden no coincidir: un veredicto que
            alguien corrigió a mano mientras la corrida estaba en curso no se pisa. */}
        {!classify.busy && classify.job?.status === 'completed' && classify.job.checked > 0 && (
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Se evaluaron {classify.job.checked} dominio(s) y entraron {classify.job.changed ?? 0} veredicto(s).
              {classify.job.changed < classify.job.checked && ' Los que no entraron están corregidos a mano o ya los tenemos.'}
            </p>
          </div>
        )}

        {!classify.busy && classify.job?.status === 'failed' && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
            <p className="text-xs text-red-700 dark:text-red-400">{classify.job.errorMsg || 'La clasificación falló.'}</p>
          </div>
        )}

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
