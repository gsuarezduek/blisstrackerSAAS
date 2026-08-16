import { avatarUrl } from '../../utils/avatarUrl'
import { roleColor } from '../../utils/roleColor'

// Pestaña "Tu equipo" del portal de cliente — dos secciones independientes,
// cada una condicional a su propio toggle (showTeam / showMeetings):
// quién trabaja en el proyecto (ProjectMember: foto/nombre/rol, sin
// email/teléfono) y el historial completo de reuniones con el cliente
// (fecha/título, nunca las notas internas). Se gatea a nivel ClientPortal.jsx
// (no se monta si ambas están vacías).

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
  return (
    <div className="flex items-baseline gap-2 py-2 px-3 rounded-lg hover:bg-gray-50">
      <span className="text-sm font-medium text-gray-700 shrink-0">{formatDate(meeting.date)}</span>
      {meeting.title && <span className="text-sm text-gray-500 truncate">{meeting.title}</span>}
    </div>
  )
}

export default function ClientTeamTab({ team = [], meetings = [] }) {
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = meetings.filter(m => m.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const past     = meetings.filter(m => m.date <  today).sort((a, b) => b.date.localeCompare(a.date))

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
