import { useState, useEffect } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../../components/LoadingSpinner'
import { StatusBadge, StatCard, OverviewCard, OverviewSkeleton, fmtTokens, fmtCost } from './shared'

export function SectionOverview({ stats, workspaces, loading, onNavigate, onSelectWorkspace }) {
  const [billing, setBilling]   = useState(null)
  const [tokens,  setTokens]    = useState(null)
  const [unread,  setUnread]    = useState(null)

  useEffect(() => {
    api.get('/superadmin/billing').then(r => setBilling(r.data)).catch(() => {})
    api.get('/superadmin/ai-tokens?period=30d').then(r => setTokens(r.data)).catch(() => {})
    api.get('/superadmin/feedback').then(r => setUnread(r.data.filter(f => !f.read).length)).catch(() => {})
  }, [])

  const recent = [...workspaces]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Stats globales */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Workspaces" value={stats.totalWorkspaces} />
          <StatCard
            label="Activos"
            value={(stats.byStatus?.active || 0) + (stats.byStatus?.trialing || 0)}
            sub={`${stats.byStatus?.trialing || 0} en trial`}
          />
          <StatCard label="Usuarios" value={stats.totalUsers} />
          <StatCard label="Tareas creadas" value={stats.totalTasks?.toLocaleString()} />
        </div>
      )}

      {/* Resúmenes clickables */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Billing */}
        <OverviewCard title="Billing" onClick={() => onNavigate('billing')}>
          {billing ? (
            <>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                ${billing.mrr.toLocaleString()}
                <span className="text-sm font-normal text-gray-400 dark:text-gray-500"> MRR</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                <span>{billing.activeCount} activos</span>
                <span>{billing.trialingCount} trial</span>
                {billing.pastDueCount > 0 && <span className="text-red-500 dark:text-red-400">{billing.pastDueCount} pago pendiente</span>}
                {billing.trialingSoon > 0 && <span className="text-amber-500 dark:text-amber-400">{billing.trialingSoon} vencen ≤7d</span>}
              </div>
            </>
          ) : <OverviewSkeleton />}
        </OverviewCard>

        {/* IA & Tokens */}
        <OverviewCard title="IA & Tokens" onClick={() => onNavigate('ai-tokens')}>
          {tokens ? (
            <>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmtTokens(tokens.totalTokens)}</p>
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                <p>{fmtCost(tokens.estimatedCostUsd)} · últimos 30 días</p>
                <p className="truncate">Top: {tokens.byWorkspace?.[0]?.name ?? '—'}</p>
              </div>
            </>
          ) : <OverviewSkeleton />}
        </OverviewCard>

        {/* Feedback */}
        <OverviewCard title="Feedback" onClick={() => onNavigate('feedback')}>
          {unread != null ? (
            <>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {unread}
                <span className="text-sm font-normal text-gray-400 dark:text-gray-500"> sin leer</span>
              </p>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {unread === 0 ? 'Todo al día' : 'Requiere revisión'}
              </p>
            </>
          ) : <OverviewSkeleton />}
        </OverviewCard>
      </div>

      {/* Altas recientes */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Altas recientes</h2>
          <button
            onClick={() => onNavigate('workspaces')}
            className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
          >
            Ver todos →
          </button>
        </div>
        {loading ? (
          <LoadingSpinner size="sm" className="py-8" />
        ) : recent.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No hay workspaces.</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {recent.map(w => (
              <div key={w.id}
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                onClick={() => onSelectWorkspace(w)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{w.name}</p>
                  <StatusBadge status={w.status} />
                </div>
                <p className="text-xs text-gray-400 flex-shrink-0 ml-4">
                  {new Date(w.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Workspaces: lista completa de tenants con búsqueda.
