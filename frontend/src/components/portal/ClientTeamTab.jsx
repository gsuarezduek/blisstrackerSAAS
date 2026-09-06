import { useState } from 'react'
import DOMPurify from 'dompurify'
import { avatarUrl } from '../../utils/avatarUrl'
import { roleColor } from '../../utils/roleColor'
import '../situation-editor.css'

// Pestaña "Tu equipo" del portal de cliente — dos secciones independientes,
// cada una condicional a su propio toggle (showTeam / showMeetings):
// quién trabaja en el proyecto (ProjectMember: foto/nombre/rol, sin
// email/teléfono) y el historial completo de reuniones con el cliente
// (fecha/título, notas si el equipo tomó, y los to-dos con su estado y
// responsable — son reuniones type:'client', el cliente ya estuvo
// presente). Se gatea a nivel ClientPortal.jsx (no se monta si ambas
// están vacías).

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function TeamMemberCard({ member }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3">
      <img
        src={avatarUrl(member.avatar)}
        alt={member.name}
        className="w-12 h-12 rounded-full object-cover shrink-0 border border-gray-100"
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{member.name}</p>
        {member.roleLabel && (
          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${roleColor(member.roleLabel)}`}>
            {member.roleLabel}
          </span>
        )}
      </div>
    </div>
  )
}

function MeetingRow({ meeting }) {
  const [open, setOpen] = useState(false)
  const hasNotes = !!(meeting.notes && meeting.notes.trim())
  const todos = meeting.todos || []
  const hasDetails = hasNotes || todos.length > 0

  return (
    <div className="py-2 px-3">
      <button
        type="button"
        onClick={() => hasDetails && setOpen(v => !v)}
        className={`w-full flex items-baseline gap-2 rounded-lg px-0 py-1 text-left ${hasDetails ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'}`}
      >
        <span className="text-sm font-medium text-gray-700 shrink-0">{formatDate(meeting.date)}</span>
        {meeting.title && <span className="text-sm text-gray-500 truncate">{meeting.title}</span>}
        {hasDetails && (
          <span className="ml-auto text-xs font-medium text-primary-600 shrink-0">{open ? 'Ocultar detalle ▲' : 'Ver detalle ▾'}</span>
        )}
      </button>
      {hasDetails && open && (
        <div className="mt-2 mb-1 px-3 py-2 bg-gray-50 rounded-lg space-y-3">
          {hasNotes && (
            <div
              className="situation-content text-sm text-gray-600"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(meeting.notes) }}
            />
          )}
          {todos.length > 0 && (
            <ul className="space-y-1">
              {todos.map(t => (
                <li key={t.id} className="flex items-start gap-2 text-sm">
                  <span className={t.done ? 'text-green-600' : 'text-gray-300'}>{t.done ? '✓' : '○'}</span>
                  <span className={t.done ? 'text-gray-400 line-through' : 'text-gray-700'}>{t.title}</span>
                  {t.ownerName && <span className="text-gray-400 text-xs shrink-0">— {t.ownerName}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default function ClientTeamTab({ team = [], meetings = [], today }) {
  // "Hoy" ya cuenta como sucedida (las reuniones se suelen cargar el mismo
  // día que se tienen, o después) — solo lo estrictamente posterior es
  // "próxima" de verdad. `today` viene del backend (timezone del workspace),
  // nunca se calcula acá para no depender de la zona horaria del navegador.
  const upcoming = meetings.filter(m => m.date > today).sort((a, b) => a.date.localeCompare(b.date))
  const past     = meetings.filter(m => m.date <= today).sort((a, b) => b.date.localeCompare(a.date))

  if (team.length === 0 && meetings.length === 0) return null

  return (
    <div className="space-y-6">
      {team.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Tu equipo</h3>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {team.map(m => <TeamMemberCard key={m.id} member={m} />)}
          </div>
        </div>
      )}

      {meetings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Reuniones</h3>
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {upcoming.length > 0 && (
              <div className="px-3 pt-3 pb-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-1">Próximas</p>
                {upcoming.map((m, i) => <MeetingRow key={`up-${i}`} meeting={m} />)}
              </div>
            )}
            {past.length > 0 && (
              <div className="px-3 pt-3 pb-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 mb-1">Anteriores</p>
                {past.map((m, i) => <MeetingRow key={`past-${i}`} meeting={m} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
