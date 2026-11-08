import { useState, useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import api from '../api/client'
import { Icon } from './ui/Icon'
import { fmtCreatedAt } from '../utils/format'
import { avatarUrl } from '../utils/avatarUrl'

// Historial de los accesos del proyecto: qué pasó con cada credencial y quién lo
// hizo. Dos vistas porque responden preguntas distintas y los reveals son muchos
// más (uno por cada vez que alguien copia una contraseña): "Cambios" es el
// default — es lo que se viene a buscar cuando una credencial dejó de funcionar.
// Nunca hay valores acá: de una contraseña se registra QUE cambió, no a qué.
const TABS = [
  { key: 'changes', label: 'Cambios' },
  { key: 'reveals', label: 'Quién vio qué' },
]

const FIELD_LABELS = {
  account:  'la cuenta',
  username: 'el usuario',
  password: 'la contraseña',
  twofa:    'el 2FA',
  extra:    'el extra',
}

const DOT = {
  create: 'bg-green-500',
  update: 'bg-amber-500',
  delete: 'bg-red-500',
  reveal: 'bg-gray-300 dark:bg-gray-600',
}

const ART = 'America/Argentina/Buenos_Aires'

// "hoy · 14:32" / "12 oct · 14:32" — mismo formato corto de fecha que el resto
// de las tareas, con la hora, que en un historial es parte de la respuesta.
function fmtWhen(iso) {
  const time = new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: ART })
  return `${fmtCreatedAt(iso)} · ${time}`
}

function fullWhen(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: ART,
  })
}

function joinEs(parts) {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`
}

function logText(l) {
  const named = l.account ? ` «${l.account}»` : ''
  const of    = l.account ? ` de «${l.account}»` : ''
  switch (l.action) {
    case 'create': return `cargó el acceso${named}`
    case 'delete': return `eliminó el acceso${named}`
    case 'update': {
      const fields = l.fields.map(f => FIELD_LABELS[f] || f)
      return fields.length ? `cambió ${joinEs(fields)}${of}` : `editó el acceso${of}`
    }
    case 'reveal': return `vio ${FIELD_LABELS[l.field] || 'un dato'}${of}`
    default:       return `tocó el acceso${of}`
  }
}

// `reloadKey` lo sube el padre al guardar o borrar un acceso, para que el panel
// abierto refleje el cambio sin tener que cerrarlo y volver a abrirlo.
export default function ProjectAccessHistory({ projectId, reloadKey = 0 }) {
  const [open, setOpen]       = useState(false)
  const [type, setType]       = useState('changes')
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError('')
    api.get(`/projects/${projectId}/accesos/logs`, { params: { type } })
      .then(r => { if (active) setLogs(r.data) })
      .catch(() => { if (active) setError('No se pudo cargar el historial.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, type, projectId, reloadKey])

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      >
        <Icon as={ChevronRight} size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        Historial de cambios
      </button>

      {open && (
        <div className="mt-2.5">
          <div className="flex items-center gap-1 mb-2">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setType(t.key)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  type === t.key
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {loading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando…</p>}
          {error && !loading && <p className="text-sm text-red-500">{error}</p>}

          {!loading && !error && logs.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {type === 'changes'
                ? 'Todavía no se cargó ni se cambió ningún acceso.'
                : 'Nadie pidió ver una contraseña ni un 2FA por ahora.'}
            </p>
          )}

          {!loading && logs.length > 0 && (
            <ul className="space-y-1.5">
              {logs.map(l => (
                <li key={l.id} className="flex items-start gap-2 text-sm">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${DOT[l.action] || DOT.reveal}`} />
                  <img
                    src={avatarUrl(l.user?.avatar)}
                    alt=""
                    className="w-5 h-5 rounded-full flex-shrink-0 mt-px"
                  />
                  <span className="text-gray-600 dark:text-gray-300 min-w-0">
                    <span className="font-medium text-gray-800 dark:text-gray-100">{l.user?.name || 'Alguien'}</span>
                    {' '}{logText(l)}
                    {' '}
                    <span className="text-gray-400 dark:text-gray-500 whitespace-nowrap" title={fullWhen(l.createdAt)}>
                      — {fmtWhen(l.createdAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!loading && logs.length > 0 && type === 'changes' && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              El historial registra qué campo cambió, nunca los valores.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
