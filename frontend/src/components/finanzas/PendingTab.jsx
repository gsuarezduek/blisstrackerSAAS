import { useEffect, useState, useCallback } from 'react'
import api from '../../api/client'
import AiSummaryCard from './AiSummaryCard'
import WorkspaceNoteCard from './WorkspaceNoteCard'
import TasksList from './TasksList'
import ExtrasList from './ExtrasList'

// Pestaña Pendientes (sección 4.6): resumen IA + notas arriba, tareas (por
// reglas + manuales) y extras debajo. `onNavigate(task)` es opcional — lo usa
// Finanzas.jsx para saltar a la pestaña relacionada con el origen de la tarea.
export default function PendingTab({ items, onNavigate }) {
  const [tasks, setTasks] = useState(null)
  // Responsables asignables: no "todo el workspace" (useMembers()) sino solo
  // quienes tienen acceso al módulo Finanzas — admin/owner + el rol
  // configurado en Preferencias → Módulos → Finanzas (ver GET /finanzas/team,
  // mismo patrón que GET /ventas/team).
  const [members, setMembers] = useState([])

  const loadTasks = useCallback(async () => {
    const res = await api.get('/finanzas/tasks')
    setTasks(res.data)
  }, [])

  useEffect(() => { loadTasks() }, [loadTasks])
  useEffect(() => { api.get('/finanzas/team').then(res => setMembers(res.data)) }, [])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AiSummaryCard />
        <WorkspaceNoteCard />
      </div>

      {tasks === null ? (
        <p className="text-sm text-gray-400 text-center py-6">Cargando…</p>
      ) : (
        <TasksList tasks={tasks} members={members} onChanged={loadTasks} onNavigate={onNavigate} />
      )}

      <ExtrasList items={items} onChanged={loadTasks} />
    </div>
  )
}
