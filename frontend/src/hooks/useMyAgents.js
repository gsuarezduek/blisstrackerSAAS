import { useState, useEffect } from 'react'
import api from '../api/client'

// Mis agentes de IA. Sale de /agents?mine=true (la ENTIDAD) y no de /mcp-tokens (la
// CREDENCIAL): lo único que necesitan sus cuatro consumidores es id, nombre y color para
// poblar un selector o preguntar "¿tengo agentes?", y /mcp-tokens devuelve además el
// `webhookSecret` de cada uno — se estaba trayendo a la memoria del browser en cada
// sesión sin que nadie lo usara.
//
// Cache a nivel módulo, como useRoles: se pide una vez por sesión. Preferencias llama a
// invalidateMyAgents() al generar, editar o revocar un agente.
let cache = null
let cachePromise = null

export function invalidateMyAgents() {
  cache = null
  cachePromise = null
}

// Nombre visible de un agente (los tokens sin label quedan como "Agente #id").
// `declaredName`: el que declaró el propio agente vía MCP (`agentName`), para
// distinguir varios agentes que comparten un token → "grokbot · Ventas". Mismo
// criterio que formatAgentName de backend/src/lib/agentTasks.js.
export function agentName(agent, declaredName) {
  const declared = typeof declaredName === 'string' ? declaredName.trim() : ''
  if (!agent) return declared || 'tu agente'
  const base = agent.label?.trim() || `Agente #${agent.id}`
  return declared && declared !== base ? `${base} · ${declared}` : base
}

export default function useMyAgents() {
  const [agents, setAgents] = useState(cache || [])

  useEffect(() => {
    if (cache) { setAgents(cache); return }
    if (!cachePromise) {
      // El endpoint ya excluye los revocados (un agente dado de baja no es parte del
      // equipo), así que acá no hace falta filtrar.
      cachePromise = api.get('/agents', { params: { mine: true } }).then(r => {
        cache = r.data
        return cache
      }).catch(() => { cachePromise = null })
    }
    cachePromise.then(data => { if (data) setAgents(data) }).catch(() => {})
  }, [])

  return agents
}
