import DOMPurify from 'dompurify'
import RichTextEditor from '../RichTextEditor'
import SocialIcon from './SocialIcon'
import {
  fmt, fmtDuration, monthLabel, monthShort, ScoreRing, BarChart, LineChart, SectionCard, GroupHeader,
  KpiGrid, BestInstagramPost, StoriesBlock, BestAd, BestTikTokVideo, BestYouTubeVideo,
  BestLinkedinPost, BestFacebookPost, LinkedinAudience, CompetitorComparison,
} from './ReportViewerParts'

const AI_LABELS = {
  chatgpt: 'ChatGPT', gemini: 'Gemini', claude: 'Claude',
  grok: 'Grok', metaAi: 'Meta AI', perplexity: 'Perplexity', copilot: 'Copilot',
}

// ── "Agregar info" por grupo (bloque editorial, WYSIWYG) ──────────────────────
// Va debajo del título del grupo y arriba de las tarjetas. Reutiliza los campos
// analysis.context* ya guardados. `contextEditing` agrupa el estado de edición
// (compartido entre los 4 grupos) que vive en el shell (ReportViewer.jsx).
function ContextNote({ sectionKey, analysisKey, contextValue, canEdit, contextEditing }) {
  const { editingContext, setEditingContext, contextDraft, setContextDraft, savingContext, onSave } = contextEditing
  if (!contextValue && !canEdit) return null
  const isEditing = editingContext === sectionKey
  const isHtml = typeof contextValue === 'string' && contextValue.trim().startsWith('<')

  if (isEditing) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 no-print space-y-3">
        <RichTextEditor defaultContent={contextValue} onChange={setContextDraft} minHeight={120} />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => { setEditingContext(null); setContextDraft('') }}
            className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(analysisKey)}
            disabled={savingContext}
            className="px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {savingContext ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    )
  }

  // Con contenido: bloque de info + acciones de admin
  if (contextValue) {
    return (
      <div className="bg-primary-50/60 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 rounded-2xl px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          {isHtml ? (
            <div className="situation-content text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(contextValue) }} />
          ) : (
            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line flex-1 min-w-0">{contextValue}</p>
          )}
          {canEdit && (
            <div className="no-print flex items-center gap-2 shrink-0">
              <button onClick={() => { setContextDraft(contextValue); setEditingContext(sectionKey) }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">✏️ Editar</button>
              <button onClick={() => onSave(analysisKey, '')} className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">🗑</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Vacío + admin: botón para agregar
  return (
    <button
      onClick={() => { setContextDraft(''); setEditingContext(sectionKey) }}
      className="no-print w-full text-left text-xs text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 transition-colors"
    >
      ➕ Agregar información a esta sección
    </button>
  )
}

// ── 2. Redes Sociales ──────────────────────────────────────────────────────────
export function RRSSSection({ s, contextRRSS, canEdit, contextEditing }) {
  const hasRRSS = !!(s.instagram || s.tiktok || s.youtube || s.linkedin || s.facebook)
  if (!hasRRSS) return null

  return (
    <>
      <GroupHeader title="Redes Sociales" groupKeys={['instagram', 'tiktok', 'youtube', 'linkedin', 'facebook', 'competitors']} />
      <ContextNote sectionKey="rrss" analysisKey="contextRRSS" contextValue={contextRRSS} canEdit={canEdit} contextEditing={contextEditing} />
      <div className={`grid gap-5 ${[s.instagram, s.tiktok, s.youtube, s.linkedin, s.facebook].filter(Boolean).length >= 2 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
        {s.instagram && (
          <SectionCard title="Instagram" icon={<SocialIcon network="instagram" className="w-5 h-5" />} sectionKey="instagram">
            <KpiGrid items={[
              { label: 'Seguidores',   value: fmt(s.instagram.followersCount), delta: s.instagram.deltaFollowers },
              { label: 'Engagement',  value: s.instagram.engagementRate != null ? `${s.instagram.engagementRate.toFixed(2)}%` : '—', delta: s.instagram.deltaEngagement },
              { label: 'Avg. likes',  value: fmt(s.instagram.avgLikes, 0) },
              { label: 'Posts / mes', value: fmt(s.instagram.postsCount) },
              ...(s.instagram.reach != null ? [{ label: 'Alcance', value: fmt(s.instagram.reach), delta: s.instagram.deltaReach }] : []),
              ...(s.instagram.totalSaved != null ? [{ label: 'Guardados', value: fmt(s.instagram.totalSaved) }] : []),
              ...(s.instagram.totalShares != null ? [{ label: 'Compartidos', value: fmt(s.instagram.totalShares) }] : []),
            ]} />
            {s.instagram.bestPost && <BestInstagramPost post={s.instagram.bestPost} />}
            {s.instagram.bestByReach && s.instagram.bestByReach.id !== s.instagram.bestPost?.id && (
              <BestInstagramPost post={s.instagram.bestByReach} label="Mayor alcance del mes" medal="📡" />
            )}
            <StoriesBlock stories={s.instagram.stories} />
            {s.instagram._fallbackMonth && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center">
                {s.instagram._fallbackMonth === 'live'
                  ? '⚡ Datos en tiempo real (aún no hay snapshot del mes anterior)'
                  : `📅 Datos más recientes disponibles: ${monthLabel(s.instagram._fallbackMonth)}`
                }
              </p>
            )}
          </SectionCard>
        )}

        {s.tiktok && (
          <SectionCard title="TikTok" icon={<SocialIcon network="tiktok" className="w-5 h-5" />} sectionKey="tiktok">
            <KpiGrid items={[
              { label: 'Seguidores',   value: fmt(s.tiktok.followersCount), delta: s.tiktok.deltaFollowers },
              { label: 'Engagement',  value: s.tiktok.engagementRate != null ? `${s.tiktok.engagementRate.toFixed(2)}%` : '—', delta: s.tiktok.deltaEngagement },
              { label: 'Avg. views',  value: fmt(s.tiktok.avgViews, 0) },
              { label: 'Posts / mes', value: fmt(s.tiktok.postsThisMonth) },
            ]} />
            {s.tiktok.bestVideo && <BestTikTokVideo video={s.tiktok.bestVideo} />}
            {s.tiktok._fallbackMonth && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center">
                {s.tiktok._fallbackMonth === 'live'
                  ? '⚡ Datos en tiempo real (aún no hay snapshot del mes anterior)'
                  : `📅 Datos más recientes disponibles: ${monthLabel(s.tiktok._fallbackMonth)}`
                }
              </p>
            )}
          </SectionCard>
        )}

        {s.youtube && (
          <SectionCard title="YouTube" icon={<SocialIcon network="youtube" className="w-5 h-5" />} sectionKey="youtube">
            <KpiGrid items={[
              { label: 'Suscriptores',  value: fmt(s.youtube.subscriberCount), delta: s.youtube.deltaSubscribers },
              { label: 'Vistas del mes', value: fmt(s.youtube.monthViews, 0) },
              { label: 'Videos / mes',  value: fmt(s.youtube.videosThisMonth) },
              { label: 'Engagement',   value: s.youtube.engagementRate != null ? `${s.youtube.engagementRate.toFixed(2)}%` : '—' },
              ...(s.youtube.shortsThisMonth != null || s.youtube.longsThisMonth != null
                ? [{ label: 'Largos / Shorts', value: `${s.youtube.longsThisMonth ?? 0} / ${s.youtube.shortsThisMonth ?? 0}` }] : []),
              ...(s.youtube.avgViews != null ? [{ label: 'Avg. views', value: fmt(s.youtube.avgViews, 0) }] : []),
            ]} />
            {s.youtube.bestVideo && <BestYouTubeVideo video={s.youtube.bestVideo} />}
            {s.youtube._fallbackMonth && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center">
                {s.youtube._fallbackMonth === 'live'
                  ? '⚡ Datos en tiempo real (aún no hay snapshot del mes anterior)'
                  : `📅 Datos más recientes disponibles: ${monthLabel(s.youtube._fallbackMonth)}`
                }
              </p>
            )}
          </SectionCard>
        )}

        {s.linkedin && (
          <SectionCard title="LinkedIn" icon={<SocialIcon network="linkedin" className="w-5 h-5" />} sectionKey="linkedin">
            <KpiGrid items={[
              { label: 'Seguidores',   value: fmt(s.linkedin.followersCount), delta: s.linkedin.deltaFollowers },
              { label: 'Engagement',  value: s.linkedin.engagementRate != null ? `${s.linkedin.engagementRate.toFixed(2)}%` : '—', delta: s.linkedin.deltaEngagement },
              { label: 'Posts / mes', value: fmt(s.linkedin.postsThisMonth) },
              ...(s.linkedin.impressions != null ? [{ label: 'Impresiones', value: fmt(s.linkedin.impressions), delta: s.linkedin.deltaImpressions }] : []),
              ...(s.linkedin.clicks      != null ? [{ label: 'Clics',       value: fmt(s.linkedin.clicks) }] : []),
              ...(s.linkedin.ctr         != null ? [{ label: 'CTR',         value: `${s.linkedin.ctr.toFixed(2)}%` }] : []),
            ]} />
            {s.linkedin.topPosts?.[0] && <BestLinkedinPost post={s.linkedin.topPosts[0]} />}
            <LinkedinAudience demographics={s.linkedin.demographics} />
            {s.linkedin._fallbackMonth && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center">
                {s.linkedin._fallbackMonth === 'live'
                  ? '⚡ Datos en tiempo real (aún no hay snapshot del mes anterior)'
                  : `📅 Datos más recientes disponibles: ${monthLabel(s.linkedin._fallbackMonth)}`
                }
              </p>
            )}
          </SectionCard>
        )}

        {s.facebook && (
          <SectionCard title="Facebook" icon={<SocialIcon network="facebook" className="w-5 h-5" />} sectionKey="facebook">
            <KpiGrid items={[
              { label: 'Seguidores',   value: fmt(s.facebook.followersCount), delta: s.facebook.deltaFollowers },
              { label: 'Engagement',  value: s.facebook.engagementRate != null ? `${s.facebook.engagementRate.toFixed(2)}%` : '—', delta: s.facebook.deltaEngagement },
              { label: 'Posts / mes', value: fmt(s.facebook.postsThisMonth) },
              ...(s.facebook.reach       != null ? [{ label: 'Alcance',     value: fmt(s.facebook.reach), delta: s.facebook.deltaReach }] : []),
              ...(s.facebook.impressions != null ? [{ label: 'Impresiones', value: fmt(s.facebook.impressions) }] : []),
            ]} />
            {s.facebook.topPosts?.[0] && <BestFacebookPost post={s.facebook.topPosts[0]} />}
            {s.facebook._fallbackMonth && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 text-center">
                {s.facebook._fallbackMonth === 'live'
                  ? '⚡ Datos en tiempo real (aún no hay snapshot del mes anterior)'
                  : `📅 Datos más recientes disponibles: ${monthLabel(s.facebook._fallbackMonth)}`
                }
              </p>
            )}
          </SectionCard>
        )}
      </div>
      {s.competitors && <CompetitorComparison data={s.competitors} />}
    </>
  )
}

// ── 3. Publicidad ────────────────────────────────────────────────────────────
export function PublicidadSection({ s, contextPublicidad, canEdit, contextEditing }) {
  const hasAds = !!(s.metaAds || s.googleAds)
  if (!hasAds) return null

  return (
    <>
      <GroupHeader title="Publicidad" groupKeys={['metaAds', 'googleAds']} />
      <ContextNote sectionKey="publicidad" analysisKey="contextPublicidad" contextValue={contextPublicidad} canEdit={canEdit} contextEditing={contextEditing} />
      <div className={`grid gap-5 ${s.metaAds && s.googleAds ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
        {s.metaAds && (
          <SectionCard title="Meta Ads" icon="📣" sectionKey="metaAds">
            <KpiGrid items={[
              { label: 'Inversión',    value: s.metaAds.spend != null ? `$${fmt(s.metaAds.spend)}` : '—' },
              ...(s.metaAds.reach != null && s.metaAds.reach > 0 ? [{ label: 'Alcance', value: fmt(s.metaAds.reach) }] : []),
              { label: 'Impresiones', value: fmt(s.metaAds.impressions) },
              { label: 'Clics',       value: fmt(s.metaAds.clicks) },
              { label: 'CTR',         value: s.metaAds.ctr != null ? `${Number(s.metaAds.ctr).toFixed(2)}%` : '—' },
            ]} />
            <BestAd ad={s.metaAds.topAds?.[0]} accent="blue" />
          </SectionCard>
        )}
        {s.googleAds && (
          <SectionCard title="Google Ads" icon="🅖" sectionKey="googleAds">
            <KpiGrid items={[
              { label: 'Inversión',    value: s.googleAds.cost != null ? `$${fmt(s.googleAds.cost)}` : '—' },
              { label: 'Impresiones', value: fmt(s.googleAds.impressions) },
              { label: 'Clics',       value: fmt(s.googleAds.clicks) },
              { label: 'CTR',         value: s.googleAds.ctr != null ? `${Number(s.googleAds.ctr).toFixed(2)}%` : '—' },
              ...(s.googleAds.conversions != null && s.googleAds.conversions > 0 ? [{ label: 'Conversiones', value: fmt(s.googleAds.conversions) }] : []),
            ]} />
            <BestAd ad={s.googleAds.topAds?.[0]} accent="green" />
          </SectionCard>
        )}
      </div>
    </>
  )
}

// ── 4. SEO y GEO ──────────────────────────────────────────────────────────────
export function SeoGeoSection({ s, contextSEO, canEdit, contextEditing }) {
  const aiTrafficEntries = (() => {
    const entries = Object.entries(s.analytics?.aiTraffic || {}).sort(([, a], [, b]) => b - a)
    return entries.length > 0 ? entries : null
  })()

  const hasSeoGeo = !!(s.keywords || s.seo || s.geo || aiTrafficEntries)
  if (!hasSeoGeo) return null

  return (
    <>
      <GroupHeader title="SEO y GEO" groupKeys={['keywords', 'seo', 'geo']} />
      <ContextNote sectionKey="seo" analysisKey="contextSEO" contextValue={contextSEO} canEdit={canEdit} contextEditing={contextEditing} />

      {/* Keywords */}
      {s.keywords && (
        <SectionCard title="Posicionamiento SEO — Keywords objetivo" icon="🔑" sectionKey="keywords">
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2 mb-4">
            Cómo posicionan las keywords que elegimos seguir, y su variación mes a mes.
          </p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{s.keywords.avgPosition}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Posición promedio</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{s.keywords.count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Keywords rastreadas</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-green-600 dark:text-green-400">+{s.keywords.improved?.length ?? 0}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Mejoraron</p>
            </div>
          </div>

          {s.keywords.table?.length > 0 && (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Keyword</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Posición</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Cambio</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Clics</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Impresiones</th>
                  </tr>
                </thead>
                <tbody>
                  {s.keywords.table.slice(0, 15).map((kw, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                      <td className="py-1.5 text-gray-700 dark:text-gray-300">{kw.query}</td>
                      <td className="py-1.5 text-right font-semibold text-gray-900 dark:text-white">{kw.position != null ? Number(kw.position).toFixed(1) : '—'}</td>
                      <td className="py-1.5 text-right">
                        {kw.delta != null
                          ? <span className={kw.delta > 0 ? 'text-green-600' : kw.delta < 0 ? 'text-red-500' : 'text-gray-400'}>
                              {kw.delta > 0 ? `↑${Number(kw.delta).toFixed(1)}` : kw.delta < 0 ? `↓${Math.abs(Number(kw.delta)).toFixed(1)}` : '—'}
                            </span>
                          : <span className="text-gray-400">—</span>
                        }
                      </td>
                      <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(kw.clicks)}</td>
                      <td className="py-1.5 text-right text-gray-500 dark:text-gray-500">{kw.impressions != null ? fmt(kw.impressions) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* SEO — Search Console */}
      {s.seo && (
        <SectionCard title="Rendimiento del sitio — Search Console" icon="🔍" sectionKey="seo">
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2 mb-4">
            Tráfico orgánico total del sitio y las consultas y páginas que más visitas traen.
          </p>
          <KpiGrid items={[
            { label: 'Clicks orgánicos', value: fmt(s.seo.clicks),      delta: s.seo.delta?.clicks },
            { label: 'Impresiones',      value: fmt(s.seo.impressions), delta: s.seo.delta?.impressions },
            { label: 'CTR promedio',     value: s.seo.ctr != null ? `${(s.seo.ctr * 100).toFixed(2)}%` : '—' },
            { label: 'Posición media',   value: s.seo.avgPosition != null ? String(s.seo.avgPosition) : '—',
              delta: s.seo.delta?.avgPosition != null ? s.seo.delta.avgPosition : undefined,
              invertDelta: true,
            },
          ]} />

          {s.seo.topQueries?.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Top consultas</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Consulta</th>
                      <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Clics</th>
                      <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Impres.</th>
                      <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">CTR</th>
                      <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Posición</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.seo.topQueries.map((q, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                        <td className="py-1.5 text-gray-700 dark:text-gray-300 max-w-[180px] truncate">{q.query}</td>
                        <td className="py-1.5 text-right font-semibold text-gray-900 dark:text-white">{fmt(q.clicks)}</td>
                        <td className="py-1.5 text-right text-gray-500 dark:text-gray-500">{fmt(q.impressions)}</td>
                        <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{q.ctr != null ? `${(q.ctr * 100).toFixed(1)}%` : '—'}</td>
                        <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{q.position != null ? Number(q.position).toFixed(1) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {s.seo.topPages?.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Top páginas</p>
              <div className="space-y-1.5">
                {s.seo.topPages.map((p, i) => {
                  let label = p.page || ''
                  try { label = new URL(p.page).pathname } catch { /* keep original */ }
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400 dark:text-gray-500 w-4 text-right shrink-0">{i + 1}.</span>
                      <span className="flex-1 text-gray-700 dark:text-gray-300 truncate">{label}</span>
                      <span className="text-gray-500 dark:text-gray-400 shrink-0">{fmt(p.clicks)} clics</span>
                      <span className="text-gray-400 dark:text-gray-500 shrink-0">pos. {p.position != null ? Number(p.position).toFixed(1) : '—'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* GEO */}
      {s.geo && (
        <SectionCard title="Presencia en IAs (GEO)" icon="🌐" sectionKey="geo">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="shrink-0 flex flex-col items-center gap-1">
              <ScoreRing score={s.geo.score} band={s.geo.band} />
              {s.geo.date && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {new Date(s.geo.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { label: 'Citabilidad',        key: 'citability' },
                { label: 'Autoridad de marca',  key: 'brandAuthority' },
                { label: 'E-E-A-T',             key: 'eeat' },
                { label: 'Técnico',             key: 'technical' },
                { label: 'Plataformas',         key: 'platforms' },
                { label: 'Schema',              key: 'schema' },
              ].filter(c => s.geo.components[c.key] != null).map(c => {
                const val = s.geo.components[c.key]
                const col = val >= 86 ? '#3b82f6' : val >= 68 ? '#22c55e' : val >= 36 ? '#eab308' : '#ef4444'
                return (
                  <div key={c.key} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{c.label}</span>
                      <span className="text-xs font-bold text-gray-900 dark:text-white ml-1">{Math.round(val)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${val}%`, backgroundColor: col }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {s.geo.history && s.geo.history.length >= 2 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Evolución del score</p>
              <LineChart
                points={s.geo.history.map(h => ({
                  label: new Date(h.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }),
                  value: h.score,
                }))}
                color="#3b82f6"
                height={70}
              />
            </div>
          )}
        </SectionCard>
      )}

      {/* Tráfico desde IAs */}
      {aiTrafficEntries && (
        <SectionCard title="Sesiones referidas desde IAs" icon="🤖">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {aiTrafficEntries.map(([key, sessions]) => (
              <div key={key} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                <p className="text-xl font-bold text-gray-900 dark:text-white">{fmt(sessions)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{AI_LABELS[key] ?? key}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 text-right mt-3">
            Total: <strong className="text-gray-600 dark:text-gray-300">{fmt(aiTrafficEntries.reduce((acc, [, v]) => acc + v, 0))} sesiones</strong> desde IAs este mes
          </p>
        </SectionCard>
      )}
    </>
  )
}

// ── 5. Sitio web ──────────────────────────────────────────────────────────────
export function SitioWebSection({ s, contextSitio, brandPrimary, brandSecondary, canEdit, contextEditing }) {
  // Canales de tráfico para el chart
  const channels = (() => {
    try {
      const ch = s.analytics?.topChannels || []
      return ch.map(c => ({ label: c.channel || c.channelGroup || c.sessionDefaultChannelGroup || '', value: c.sessions || 0 }))
        .filter(c => c.value > 0)
    } catch { return [] }
  })()

  // Evolución (sesiones + nuevos usuarios)
  const evolutionPoints = (() => {
    if (!s.evolution || s.evolution.length < 2) return null
    return s.evolution.map(snap => ({
      label: monthShort(snap.month),
      value: snap.sessions ?? 0,
    }))
  })()

  const evolutionNewUsers = (() => {
    if (!s.evolution || s.evolution.length < 2) return null
    return s.evolution.map(snap => ({
      label: monthShort(snap.month),
      value: snap.newUsers ?? 0,
    }))
  })()

  const hasSitio = !!(s.analytics || evolutionPoints || s.performance)
  if (!hasSitio) return null

  return (
    <>
      <GroupHeader title="Sitio web" groupKeys={['analytics', 'performance']} />
      <ContextNote sectionKey="sitio" analysisKey="contextSitio" contextValue={contextSitio} canEdit={canEdit} contextEditing={contextEditing} />

      {/* Analytics GA4 */}
      {s.analytics && (
        <SectionCard title="Analytics web" icon="📊" sectionKey="analytics">
          <KpiGrid items={[
            { label: 'Sesiones',        value: fmt(s.analytics.sessions),    delta: s.analytics.delta?.sessions },
            { label: 'Usuarios nuevos', value: fmt(s.analytics.newUsers),    delta: s.analytics.delta?.newUsers },
            { label: 'Páginas vistas',  value: fmt(s.analytics.pageviews),   delta: s.analytics.delta?.pageviews },
            { label: 'Conversiones',    value: fmt(s.analytics.conversions), delta: s.analytics.delta?.conversions },
            { label: 'Tasa de rebote',  value: `${s.analytics.bounceRate != null ? (s.analytics.bounceRate * 100).toFixed(1) : '—'}%`, invertDelta: true },
            { label: 'Duración media',  value: fmtDuration(s.analytics.avgDuration) },
          ]} />

          {/* Canales de tráfico */}
          {channels.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Canales de tráfico</p>
              <BarChart items={channels} color={brandPrimary} />
            </div>
          )}

          {/* Fuentes de tráfico */}
          {s.analytics.topSources?.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Fuentes de tráfico</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Fuente</th>
                      <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Medium</th>
                      <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Sesiones</th>
                      <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.analytics.topSources.map((src, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                        <td className="py-1.5 font-medium text-gray-700 dark:text-gray-300">{src.source || '(direct)'}</td>
                        <td className="py-1.5 text-gray-500 dark:text-gray-400">{src.medium || '—'}</td>
                        <td className="py-1.5 text-right text-gray-700 dark:text-gray-300">{fmt(src.sessions)}</td>
                        <td className="py-1.5 text-right text-gray-400">{src.pct != null ? `${src.pct}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top páginas */}
          {s.analytics.topPages?.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Top páginas</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium w-6">#</th>
                      <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Página</th>
                      <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Vistas</th>
                      <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Sesiones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.analytics.topPages.map((page, i) => (
                      <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                        <td className="py-1.5 text-gray-400">{i + 1}</td>
                        <td className="py-1.5 pr-3">
                          <p className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[220px]">{page.path}</p>
                          {page.title && page.title !== page.path && (
                            <p className="text-gray-400 dark:text-gray-500 truncate max-w-[220px]">{page.title}</p>
                          )}
                        </td>
                        <td className="py-1.5 text-right font-medium text-gray-700 dark:text-gray-300">{fmt(page.pageviews)}</td>
                        <td className="py-1.5 text-right text-gray-500 dark:text-gray-400">{fmt(page.sessions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Evolución multi-mes (hasta 6 meses, sesiones + usuarios nuevos) */}
      {evolutionPoints && (
        <SectionCard title="Evolución web" icon="📈">
          {/* Leyenda */}
          {evolutionNewUsers && (
            <div className="flex items-center gap-4 mb-3">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: brandPrimary }} />
                <span className="text-xs text-gray-500 dark:text-gray-400">Sesiones</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: brandSecondary }} />
                <span className="text-xs text-gray-500 dark:text-gray-400">Usuarios nuevos</span>
              </div>
            </div>
          )}
          <LineChart
            points={evolutionPoints}
            color={brandPrimary}
            height={80}
            secondPoints={evolutionNewUsers}
            secondColor={brandSecondary}
          />

          {/* Tabla mes a mes */}
          {s.evolution?.length >= 2 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left pb-2 text-gray-500 dark:text-gray-400 font-medium">Mes</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Sesiones</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Nuevos</th>
                    <th className="text-right pb-2 text-gray-500 dark:text-gray-400 font-medium">Conversiones</th>
                  </tr>
                </thead>
                <tbody>
                  {[...s.evolution].reverse().map((snap, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                      <td className="py-1.5 text-gray-600 dark:text-gray-400 capitalize">{monthLabel(snap.month)}</td>
                      <td className="py-1.5 text-right font-medium text-gray-900 dark:text-white">{fmt(snap.sessions)}</td>
                      <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(snap.newUsers)}</td>
                      <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(snap.conversions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* Performance */}
      {s.performance && (
        <SectionCard title="Performance web" icon="⚡" sectionKey="performance">
          {/* Scores móvil / desktop */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            {s.performance.mobile && (
              <div className="text-center bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                <p className={`text-4xl font-bold ${
                  s.performance.mobile.score >= 90 ? 'text-green-600' :
                  s.performance.mobile.score >= 50 ? 'text-yellow-600' : 'text-red-600'
                }`}>{s.performance.mobile.score}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">📱 Móvil</p>
                <p className="text-xs font-medium mt-0.5 text-gray-400 dark:text-gray-500">
                  {s.performance.mobile.score >= 90 ? 'Excelente' : s.performance.mobile.score >= 50 ? 'Necesita mejoras' : 'Deficiente'}
                </p>
              </div>
            )}
            {s.performance.desktop && (
              <div className="text-center bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                <p className={`text-4xl font-bold ${
                  s.performance.desktop.score >= 90 ? 'text-green-600' :
                  s.performance.desktop.score >= 50 ? 'text-yellow-600' : 'text-red-600'
                }`}>{s.performance.desktop.score}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">🖥️ Desktop</p>
                <p className="text-xs font-medium mt-0.5 text-gray-400 dark:text-gray-500">
                  {s.performance.desktop.score >= 90 ? 'Excelente' : s.performance.desktop.score >= 50 ? 'Necesita mejoras' : 'Deficiente'}
                </p>
              </div>
            )}
          </div>

          {/* Core Web Vitals */}
          {(() => {
            const mm = s.performance.mobile?.metrics  || {}
            const dm = s.performance.desktop?.metrics || {}
            const cwv = [
              { label: 'LCP',         desc: 'Largest Contentful Paint', mobile: mm.lcp != null ? `${(Number(mm.lcp)/1000).toFixed(1)}s` : null, desktop: dm.lcp != null ? `${(Number(dm.lcp)/1000).toFixed(1)}s` : null, good: v => parseFloat(v) <= 2.5, warn: v => parseFloat(v) <= 4.0 },
              { label: 'CLS',         desc: 'Cumulative Layout Shift',  mobile: mm.cls != null ? Number(mm.cls).toFixed(3) : null,                desktop: dm.cls != null ? Number(dm.cls).toFixed(3) : null,                good: v => parseFloat(v) <= 0.1, warn: v => parseFloat(v) <= 0.25 },
              { label: 'FCP',         desc: 'First Contentful Paint',   mobile: mm.fcp != null ? `${(Number(mm.fcp)/1000).toFixed(1)}s` : null, desktop: dm.fcp != null ? `${(Number(dm.fcp)/1000).toFixed(1)}s` : null, good: v => parseFloat(v) <= 1.8, warn: v => parseFloat(v) <= 3.0 },
              { label: 'TBT',         desc: 'Total Blocking Time',      mobile: mm.tbt != null ? `${Math.round(Number(mm.tbt))}ms` : null,       desktop: dm.tbt != null ? `${Math.round(Number(dm.tbt))}ms` : null,       good: v => parseInt(v) <= 200,  warn: v => parseInt(v) <= 600 },
              { label: 'Speed Index', desc: 'Speed Index',              mobile: mm.speedIndex != null ? `${(Number(mm.speedIndex)/1000).toFixed(1)}s` : null, desktop: dm.speedIndex != null ? `${(Number(dm.speedIndex)/1000).toFixed(1)}s` : null, good: v => parseFloat(v) <= 3.4, warn: v => parseFloat(v) <= 5.8 },
              { label: 'TTI',         desc: 'Time to Interactive',      mobile: mm.tti != null ? `${(Number(mm.tti)/1000).toFixed(1)}s` : null, desktop: dm.tti != null ? `${(Number(dm.tti)/1000).toFixed(1)}s` : null, good: v => parseFloat(v) <= 3.8, warn: v => parseFloat(v) <= 7.3 },
            ].filter(v => v.mobile || v.desktop)

            if (cwv.length === 0) return null
            return (
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Core Web Vitals</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {cwv.map((v, i) => {
                    const val = v.mobile || v.desktop
                    const colorClass = !val ? 'text-gray-400'
                      : v.good(val) ? 'text-green-600 dark:text-green-400'
                      : v.warn(val) ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-red-600 dark:text-red-400'
                    return (
                      <div key={i} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 text-center">
                        <p className={`text-base font-bold ${colorClass}`}>{val ?? '—'}</p>
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{v.label}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{v.desc}</p>
                        {v.mobile && v.desktop && v.mobile !== v.desktop && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            📱 {v.mobile} · 🖥️ {v.desktop}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </SectionCard>
      )}
    </>
  )
}
