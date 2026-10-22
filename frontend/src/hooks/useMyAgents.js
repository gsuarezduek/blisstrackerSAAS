import { useState, useEffect } from 'react'
import api from '../api/client'

// Mis agentes de IA = mis McpToken activos (Preferencias → Agentes IA); el `label`
// es el nombre del agente. Cache a nivel módulo, como useRoles: se pide una vez por
// sesión. Preferencias llama a invalidateMyAgents() al generar/revocar un token.
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
      cachePromise = api.get('/mcp-tokens').then(r => {
        cache = r.data.filter(t => !t.revokedAt)
        return cache
      }).catch(() => { cachePromise = null })
    }
    cachePromise.then(data => { if (data) setAgents(data) }).catch(() => {})
  }, [])

  return agents
}
