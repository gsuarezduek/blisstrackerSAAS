import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import axios from 'axios'
import BlissLogo from '../components/BlissLogo'

const API = import.meta.env.VITE_API_URL || ''

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Listado público del blog (blisstracker.app/blog). Sin auth, sin JWT — mismo
// criterio que ProposalPublic.jsx: axios crudo contra VITE_API_URL, no el
// client autenticado (esta página no tiene ningún contexto de workspace).
export default function Blog() {
  const [posts,   setPosts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    setLoading(true)
    axios.get(`${API}/api/public/blog`)
      .then(r => setPosts(r.data.posts))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      <Helmet>
        <title>Blog — BlissTracker</title>
        <meta name="description" content="Artículos sobre gestión de agencias, marketing y productividad de equipos." />
        <link rel="canonical" href="https://blisstracker.app/blog" />
        <meta property="og:url" content="https://blisstracker.app/blog" />
        <meta property="og:title" content="Blog — BlissTracker" />
        <meta property="og:description" content="Artículos sobre gestión de agencias, marketing y productividad de equipos." />
      </Helmet>

      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center">
            <BlissLogo variant="lockup" dark={false} className="h-8 w-auto" />
          </Link>
          <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            Volver al inicio
          </Link>
        </div>
      </nav>

      <header className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-10 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-4">Blog</h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto">
          Ideas y aprendizajes sobre gestión de agencias, marketing y productividad de equipos.
        </p>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-24">
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <p className="text-center text-gray-400 py-20">No se pudieron cargar los artículos.</p>
        )}

        {!loading && !error && posts.length === 0 && (
          <p className="text-center text-gray-400 py-20">Todavía no hay artículos publicados.</p>
        )}

        {!loading && !error && posts.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-8">
            {posts.map(post => (
              <Link
                key={post.id}
                to={`/blog/${post.slug}`}
                className="group block rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all overflow-hidden"
              >
                {post.hasCoverImage ? (
                  <img
                    src={`${API}/api/public/blog-cover/${post.id}`}
                    alt=""
                    className="w-full h-48 object-cover"
                  />
                ) : (
                  <div className="w-full h-48 bg-gradient-to-br from-primary-50 to-orange-100" />
                )}
                <div className="p-5">
                  <p className="text-xs text-gray-400 mb-2">{formatDate(post.publishedAt)} · {post.authorName}</p>
                  <h2 className="text-lg font-bold text-gray-900 group-hover:text-primary-600 transition-colors mb-1.5">
                    {post.title}
                  </h2>
                  <p className="text-sm text-gray-500 line-clamp-2">{post.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
