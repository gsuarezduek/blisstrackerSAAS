import { useState, useMemo } from 'react'
import { WIKI_CATEGORIES, ALL_ARTICLES, findArticle, WIKI_LAST_UPDATED } from '../../data/wikiContent'
import { renderWikiMarkdown } from './wikiMarkdown'

const MODULE_LABELS = { marketing: 'Módulo Marketing', eos: 'Módulo EOS' }

function AudienceBadge({ audience }) {
  if (audience !== 'admin') return null
  return (
    <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
      Admin
    </span>
  )
}

function ModuleBadge({ module }) {
  if (!module) return null
  return (
    <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
      {MODULE_LABELS[module] || module}
    </span>
  )
}

// ── Vista de un artículo ─────────────────────────────────────────────────────
function ArticleView({ article, onSelect }) {
  const related = (article.related || []).map(findArticle).filter(Boolean)

  return (
    <article className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 sm:p-7">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs text-gray-400 dark:text-gray-500">{article.categoryIcon} {article.categoryLabel}</span>
      </div>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-snug">{article.title}</h2>
        <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
          <AudienceBadge audience={article.audience} />
          <ModuleBadge module={article.module} />
        </div>
      </div>
      {article.summary && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">{article.summary}</p>
      )}

      <div className="mt-5">{renderWikiMarkdown(article.body)}</div>

      {/* Parámetros */}
      {Array.isArray(article.params) && article.params.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Parámetros</p>
          <div className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
            {article.params.map((p, i) => (
              <div key={i} className="flex flex-col sm:flex-row gap-1 sm:gap-3 px-4 py-2.5 bg-gray-50/60 dark:bg-gray-700/30">
                <code className="text-xs font-mono text-primary-700 dark:text-primary-300 sm:w-56 flex-shrink-0">{p.name}</code>
                <span className="text-sm text-gray-600 dark:text-gray-400">{p.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sugerencias para empezar */}
      {Array.isArray(article.tips) && article.tips.length > 0 && (
        <div className="mt-6 rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-100 dark:border-amber-800/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-2">💡 Para empezar</p>
          <ul className="space-y-1.5">
            {article.tips.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                <span className="text-amber-500 flex-shrink-0 mt-0.5">→</span>{t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Relacionados */}
      {related.length > 0 && (
        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Relacionado</p>
          <div className="flex flex-wrap gap-2">
            {related.map(r => (
              <button
                key={r.id}
                onClick={() => onSelect(r.id)}
                className="inline-flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-lg px-3 py-1.5 transition-colors"
              >
                {r.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  )
}

// ── Navegación lateral (categorías → artículos) ──────────────────────────────
function WikiNav({ activeId, onSelect }) {
  return (
    <nav className="space-y-4">
      {WIKI_CATEGORIES.map(cat => (
        <div key={cat.id}>
          <p className="px-2 mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {cat.icon} {cat.label}
          </p>
          <div className="space-y-0.5">
            {cat.articles.map(a => {
              const isActive = a.id === activeId
              return (
                <button
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  className={`w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/40'
                  }`}
                >
                  <span className="min-w-0 truncate">{a.title}</span>
                  {a.audience === 'admin' && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" title="Solo admins" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

// ── Tab principal ────────────────────────────────────────────────────────────
export default function WikiTab({ articleId, onSelect }) {
  const [query, setQuery] = useState('')
  const [navOpen, setNavOpen] = useState(false)

  const active = useMemo(
    () => findArticle(articleId) || ALL_ARTICLES[0],
    [articleId]
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return ALL_ARTICLES.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.body.toLowerCase().includes(q) ||
      a.categoryLabel.toLowerCase().includes(q)
    )
  }, [query])

  function select(id) {
    setQuery('')
    setNavOpen(false)
    onSelect(id)
  }

  return (
    <div>
      {/* Última actualización del Wiki (referencia para el equipo) */}
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        Última actualización del Wiki:{' '}
        <span className="font-medium text-gray-500 dark:text-gray-400">
          {new Date(WIKI_LAST_UPDATED + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </p>

      {/* Buscador */}
      <div className="relative mb-5 max-w-xl">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
          className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar en el Wiki…"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-400"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
            aria-label="Limpiar búsqueda"
          >
            ✕
          </button>
        )}
      </div>

      {/* Resultados de búsqueda */}
      {results !== null ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
            {results.length} resultado{results.length !== 1 ? 's' : ''} para "{query}"
          </p>
          {results.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">
              No encontramos nada. Probá con otras palabras.
            </p>
          )}
          {results.map(a => (
            <button
              key={a.id}
              onClick={() => select(a.id)}
              className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 dark:text-gray-500">{a.categoryIcon} {a.categoryLabel}</span>
                <AudienceBadge audience={a.audience} />
                <ModuleBadge module={a.module} />
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">{a.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{a.summary}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Toggle de navegación en mobile */}
          <button
            onClick={() => setNavOpen(o => !o)}
            className="lg:hidden flex items-center justify-between w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            <span>{navOpen ? 'Ocultar' : 'Ver'} índice del Wiki</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
              className={`w-4 h-4 transition-transform ${navOpen ? 'rotate-180' : ''}`}>
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Sidebar */}
          <aside className={`${navOpen ? 'block' : 'hidden'} lg:block lg:w-64 flex-shrink-0`}>
            <div className="lg:sticky lg:top-6">
              <WikiNav activeId={active.id} onSelect={select} />
            </div>
          </aside>

          {/* Artículo */}
          <div className="flex-1 min-w-0">
            <ArticleView article={active} onSelect={select} />
          </div>
        </div>
      )}
    </div>
  )
}
