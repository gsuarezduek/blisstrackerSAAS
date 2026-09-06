import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import axios from 'axios'
import DOMPurify from 'dompurify'
import BlissLogo from '../components/BlissLogo'
import '../components/situation-editor.css'

const API = import.meta.env.VITE_API_URL || ''

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Detalle público de un post (blisstracker.app/blog/:slug). Mismo criterio que
// Blog.jsx / ProposalPublic.jsx: axios crudo, sin JWT ni contexto de workspace.
export default function BlogPost() {
  const { slug } = useParams()
  const [post,    setPost]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    setError(false)
    window.scrollTo(0, 0)
    axios.get(`${API}/api/public/blog/${slug}`)
      .then(r => setPost(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-4xl mb-4">📄</p>
          <p className="text-lg font-semibold text-gray-800 mb-2">Artículo no encontrado</p>
          <Link to="/blog" className="text-sm text-primary-600 hover:underline">Volver al blog</Link>
        </div>
      </div>
    )
  }

  const url = `https://blisstracker.app/blog/${post.slug}`
  const imageUrl = post.hasCoverImage ? `${API}/api/public/blog-cover/${post.id}` : 'https://blisstracker.app/og-image.png'

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.metaDescription,
    image: imageUrl,
    datePublished: post.publishedAt,
    author: { '@type': 'Person', name: post.authorName },
    publisher: {
      '@type': 'Organization',
      name: 'BlissTracker',
      logo: { '@type': 'ImageObject', url: 'https://blisstracker.app/blisstracker_logo.svg' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      <Helmet>
        <title>{post.metaTitle} — BlissTracker</title>
        <meta name="description" content={post.metaDescription} />
        <link rel="canonical" href={url} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={url} />
        <meta property="og:title" content={post.metaTitle} />
        <meta property="og:description" content={post.metaDescription} />
        <meta property="og:image" content={imageUrl} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center">
            <BlissLogo variant="lockup" dark={false} className="h-8 w-auto" />
          </Link>
          <Link to="/blog" className="text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            ← Blog
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        {post.hasCoverImage && (
          <img src={imageUrl} alt="" className="w-full max-h-96 object-cover rounded-2xl mb-8" />
        )}
        <p className="text-sm text-gray-400 mb-3">{formatDate(post.publishedAt)} · {post.authorName}</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-8">{post.title}</h1>
        <div
          className="situation-content text-gray-700 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.contentHtml) }}
        />
      </article>
    </div>
  )
}
