// Marketing → Mailing. Todo es por proyecto (cada cliente tiene su remitente,
// sus bases y sus campañas); sin proyecto elegido se ve el resumen de todos.
import MailingSummary from './MailingSummary'
import CampaignsPanel from './CampaignsPanel'
import ContactsPanel from './ContactsPanel'
import MailingConfigPanel from './MailingConfigPanel'

export default function MailingTab({ sub, projectId, projects, onSelectProject, onNavigate }) {
  if (!projectId) return <MailingSummary projects={projects} onSelectProject={onSelectProject} />
  if (sub === 'bases') return <ContactsPanel projectId={projectId} />
  if (sub === 'configuracion') return <MailingConfigPanel projectId={projectId} />
  return <CampaignsPanel projectId={projectId} onNavigate={onNavigate} />
}
