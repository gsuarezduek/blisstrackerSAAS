import { BRANDS } from './networks/brands'
import { fmtNum, fmtK, engColor, engLabel, ENG_THRESHOLDS } from './networks/format'
import { AudienceCard } from './networks/ui'
import NetworkAccountHeader, { AccountBio } from './networks/AccountHeader'
import CrossProjectNetworkPanel from './networks/CrossProjectNetworkPanel'

// Piezas propias de la pestaña de Instagram. Lo genérico (formatos, gráfico,
// navegación por mes, encabezado de cuenta, vista de todos los clientes) vive en
// ./networks y se reexporta acá para no cambiar los imports de InstagramTab.
export { fmtNum, fmtK, subtractDays, todayAR, monthLabel, FOLLOWER_FILTERS } from './networks/format'
export { LineChart, MonthNav, KpiCard } from './networks/ui'

const BRAND = BRANDS.instagram

// Instagram tiene un engagement típico más bajo que el resto: umbrales 3% / 1%.
export const engagementColor = rate => engColor(rate, ENG_THRESHOLDS.instagram)
export const engagementLabel = rate => engLabel(rate, ENG_THRESHOLDS.instagram)

export function FollowersCard({ followersCount, mediaCount, monthlyGain }) {
  return (
    <AudienceCard className="col-span-2 sm:col-span-1" count={followersCount} monthlyGain={monthlyGain}
      sub={`${fmtNum(mediaCount)} publicaciones`} />
  )
}

export function AccountHeader({ metrics, integration, onDisconnect, disconnecting, onRefresh, refreshing }) {
  const isScrape = integration?.scopes === 'scrape' || metrics?.scraped
  const site = metrics?.website
  return (
    <NetworkAccountHeader brand={BRAND} integration={integration}
      avatarUrl={metrics?.profilePicUrl}
      name={metrics?.username ? `@${metrics.username}` : metrics?.name}
      subtitle={metrics?.username && metrics?.name ? metrics.name : null}
      link={site && { href: site.startsWith('http') ? site : `https://${site}`, label: `🌐 ${site}` }}
      dataAt={isScrape ? metrics?.lastScrapedAt : null}
      actions={isScrape && onRefresh ? [{ key: 'refresh', label: '↻ Actualizar', onClick: onRefresh, busy: refreshing }] : []}
      onDisconnect={onDisconnect} disconnecting={disconnecting}>
      <AccountBio>{metrics?.biography}</AccountBio>
    </NetworkAccountHeader>
  )
}

export function CrossProjectInstagramPanel({ onSelectProject }) {
  return (
    <CrossProjectNetworkPanel brand={BRAND} network="instagram" refreshable onSelectProject={onSelectProject}
      renderSecondary={p => (
        <>
          <span className="text-gray-400">{fmtK(p.followersCount)} seguidores</span>
          {p.engagementRate != null && <span className={engagementColor(p.engagementRate)}>{p.engagementRate.toFixed(2)}% eng.</span>}
          {p.avgLikes != null && <span className="text-gray-400">❤️ {fmtK(Math.round(p.avgLikes))}</span>}
          {p.postsCount != null && <span className="text-gray-400">{p.postsCount} posts</span>}
        </>
      )}
    />
  )
}

export function hourRange(h) {
  const end = (h + 3) % 24
  return `${String(h).padStart(2, '0')}:00 – ${String(end).padStart(2, '0')}:00`
}

// ── TOP del mes ───────────────────────────────────────────────────────────────

const RANK_META = [
  { medal: '🥇', label: 'Mejor publicación',  highlight: true  },
  { medal: '🥈', label: '2ª mejor del mes',   highlight: false },
  { medal: '🥉', label: '3ª mejor del mes',   highlight: false },
]

function TopPostCard({ post, medal, label, highlight }) {
  if (!post) return (
    <div className="bg-white dark:bg-gray-800 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col items-center justify-center gap-2 min-h-[160px]">
      <span className="text-2xl opacity-30">📭</span>
      <p className="text-xs text-gray-400 text-center">Sin más publicaciones este mes</p>
    </div>
  )

  const score = (post.likeCount ?? 0) + (post.commentsCount ?? 0)

  return (
    <a
      href={post.permalink ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={`bg-white dark:bg-gray-800 rounded-xl overflow-hidden flex flex-col group transition-colors ${
        highlight
          ? 'border-2 border-purple-400 dark:border-purple-500 shadow-md hover:border-purple-500 dark:hover:border-purple-400'
          : 'border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700'
      }`}
    >
      {/* Imagen */}
      <div className="relative aspect-square bg-gray-100 dark:bg-gray-700">
        {post.imgSrc ? (
          <img src={post.imgSrc} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-400" />
        )}
        <div className="absolute top-2 left-2 text-xl leading-none">{medal}</div>
        {post.mediaType === 'VIDEO'          && <div className="absolute top-2 right-2 bg-black/60 rounded px-1 text-white text-[10px]">▶</div>}
        {post.mediaType === 'CAROUSEL_ALBUM' && <div className="absolute top-2 right-2 bg-black/60 rounded px-1 text-white text-[10px]">❏</div>}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className={`text-[10px] font-semibold uppercase tracking-wide ${
          highlight ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500 dark:text-gray-400'
        }`}>
          {label}
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
          {post.likeCount     != null && <span>❤️ {fmtK(post.likeCount)}</span>}
          {post.commentsCount != null && <span>💬 {fmtK(post.commentsCount)}</span>}
          {score > 0 && (
            <span className="ml-auto text-[10px] text-gray-400">
              {fmtK(score)} interacciones
            </span>
          )}
        </div>
        {(post.reach != null || post.saved != null || post.shares != null) && (
          <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
            {post.reach  != null && <span>📡 {fmtK(post.reach)}</span>}
            {post.saved  != null && <span>🔖 {fmtK(post.saved)}</span>}
            {post.shares != null && <span>↗️ {fmtK(post.shares)}</span>}
          </div>
        )}
        {post.caption && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-tight">
            {post.caption}
          </p>
        )}
      </div>
    </a>
  )
}

// Publicación de mayor alcance del mes (requiere Insights).
export function ReachHighlight({ post }) {
  if (!post || post.reach == null) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800/50 rounded-xl p-5">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">📡 Publicación de mayor alcance</p>
      <a href={post.permalink ?? '#'} target="_blank" rel="noopener noreferrer" className="flex gap-4 group">
        <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 shrink-0">
          {post.imgSrc
            ? <img src={post.imgSrc} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" loading="lazy" />
            : <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-purple-600 dark:text-purple-400 leading-tight">{fmtNum(post.reach)} <span className="text-sm font-medium text-gray-500 dark:text-gray-400">cuentas alcanzadas</span></p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400 mt-1">
            {post.likeCount != null && <span>❤️ {fmtK(post.likeCount)}</span>}
            {post.commentsCount != null && <span>💬 {fmtK(post.commentsCount)}</span>}
            {post.saved  != null && <span>🔖 {fmtK(post.saved)}</span>}
            {post.shares != null && <span>↗️ {fmtK(post.shares)}</span>}
          </div>
          {post.caption && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1.5 leading-tight">{post.caption}</p>}
        </div>
      </a>
    </div>
  )
}

export function TopOfMonth({ topPosts, postsThisMonth, label, isPast = false }) {
  const list = Array.isArray(topPosts) ? topPosts : []

  const heading = label || new Date().toLocaleString('es-AR', { month: 'long', timeZone: 'America/Argentina/Buenos_Aires' })

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            🏆 Mejores publicaciones — {heading}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {postsThisMonth > 0
              ? `${postsThisMonth} publicación${postsThisMonth !== 1 ? 'es' : ''} ${isPast ? 'ese mes' : 'este mes'} · ranking por likes + comentarios`
              : (isPast ? 'Sin publicaciones ese mes' : 'Sin publicaciones en lo que va del mes')}
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          {isPast ? 'No hay publicaciones con datos de interacción de ese mes.' : 'Aún no hay publicaciones con datos de interacción este mes.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <TopPostCard
              key={list[i]?.id ?? `slot-${i}`}
              post={list[i] ?? null}
              medal={RANK_META[i].medal}
              label={RANK_META[i].label}
              highlight={RANK_META[i].highlight}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Insights de contenido ─────────────────────────────────────────────────────

export function ContentInsights({ byType, bestHour }) {
  const hasType = byType && byType.length > 0
  const maxAvg  = hasType ? byType[0].avgLikes : 1

  if (!hasType && !bestHour) return null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {hasType && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Rendimiento por tipo de contenido
          </p>
          <div className="space-y-3">
            {byType.map(t => (
              <div key={t.type} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 dark:text-gray-400 w-20 shrink-0">{t.label}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full bg-purple-500" style={{ width: `${(t.avgLikes / maxAvg) * 100}%` }} />
                </div>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-16 text-right shrink-0">
                  {fmtNum(t.avgLikes)} ❤️
                </span>
                <span className="text-xs text-gray-400 w-12 shrink-0">{t.count} posts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Mejor horario para publicar
        </p>
        {bestHour ? (
          <div className="flex items-start gap-3">
            <span className="text-3xl mt-0.5">🕐</span>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                {hourRange(bestHour.hour)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {fmtNum(Math.round(bestHour.avgLikes))} likes promedio · {bestHour.count} posts analizados
              </p>
              <p className="text-xs text-gray-400">Basado en las últimas publicaciones · Horario ART</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No hay suficientes publicaciones con datos de engagement para este análisis.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Sección de Stories (historias del mes) ─────────────────────────────────────

export function StoriesSection({ stories, isCurrentMonth, onCapture, capturing }) {
  const thumbs = (stories?.topStories?.length ? stories.topStories : stories?.recent) ?? []
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">📸 Stories del mes</p>
        {isCurrentMonth && (
          <button
            onClick={onCapture}
            disabled={capturing}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {capturing ? 'Capturando…' : '🔄 Capturar ahora'}
          </button>
        )}
      </div>

      {!stories || !stories.count ? (
        <div className="p-6 text-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {isCurrentMonth
              ? 'Todavía no se capturaron stories este mes. Se capturan automáticamente cada 6 horas; podés forzar una captura ahora.'
              : 'No se capturaron stories en este mes.'}
          </p>
        </div>
      ) : (
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StoryKpi label="Publicadas" value={fmtNum(stories.count)} />
            {stories.avgReach      != null && <StoryKpi label="Alcance prom." value={fmtK(stories.avgReach)} />}
            {stories.totalReach    != null && <StoryKpi label="Alcance total" value={fmtK(stories.totalReach)} />}
            {stories.avgViews      != null && <StoryKpi label="Vistas prom."  value={fmtK(stories.avgViews)} />}
            {stories.totalReplies  != null && <StoryKpi label="Respuestas"    value={fmtNum(stories.totalReplies)} />}
            {stories.retentionRate != null && <StoryKpi label="Retención"     value={`${stories.retentionRate}%`} />}
          </div>

          {thumbs.length > 0 && (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {thumbs.map(st => {
                const inner = (
                  <div className="relative w-20 h-36 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                    {st.imgSrc
                      ? <img src={st.imgSrc} alt="" className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full bg-gradient-to-br from-fuchsia-400 to-purple-400" />}
                    {(st.reach != null || st.replies != null) && (
                      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] flex items-center justify-center gap-2 py-0.5">
                        {st.reach   != null && <span>👁️ {fmtK(st.reach)}</span>}
                        {st.replies != null && st.replies > 0 && <span>💬 {fmtK(st.replies)}</span>}
                      </div>
                    )}
                  </div>
                )
                return st.permalink
                  ? <a key={st.id} href={st.permalink} target="_blank" rel="noopener noreferrer" className="hover:opacity-90 transition-opacity">{inner}</a>
                  : <div key={st.id}>{inner}</div>
              })}
            </div>
          )}

          {!stories.hasInsights && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Se registran las stories publicadas, pero las métricas de rendimiento (alcance, respuestas, retención) aún no están disponibles — requieren el permiso de insights de Meta.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function StoryKpi({ label, value }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-lg p-3">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-xl font-bold text-gray-900 dark:text-white">{value}</div>
    </div>
  )
}
