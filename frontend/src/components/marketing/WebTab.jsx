import WebAnalyticsTab from './WebAnalyticsTab'
import WebPerformanceTab from './WebPerformanceTab'

// Pestaña "Web" de Marketing — despacha a uno de dos subtabs totalmente
// independientes (no comparten estado ni efectos entre sí, solo vivían juntos
// en un mismo archivo): Analytics (Google Analytics) y Performance (PageSpeed
// Insights). Ver WebAnalyticsTab.jsx / WebPerformanceTab.jsx.
export default function WebTab({ subtab = 'analytics', projectId, projects, onSelectProject }) {
  if (subtab === 'performance') {
    return <WebPerformanceTab projectId={projectId} projects={projects} onSelectProject={onSelectProject} />
  }
  return <WebAnalyticsTab projectId={projectId} onSelectProject={onSelectProject} />
}
