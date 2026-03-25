import { useState } from 'react'
import api from '../api/client'

export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('SUGGESTION')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!message.trim()) return
    setLoading(true)
    try {
      await api.post('/feedback', { type, message })
      setSent(true)
      setTimeout(() => {
        setSent(false)
        setOpen(false)
        setMessage('')
        setType('SUGGESTION')
      }, 2000)
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    if (loading) return
    setOpen(false)
    setMessage('')
    setType('SUGGESTION')
    setSent(false)
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        title="Enviar sugerencia o reportar error"
        className="fixed bottom-6 right-6 z-40 bg-primary-600 hover:bg-primary-700 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-all hover:scale-110"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 006 21.75a6.721 6.721 0 003.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 01-.814 1.686.75.75 0 00.44 1.223 5.99 5.99 0 00-.003 0zm3.196-5.984a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H8.75a.75.75 0 01-.75-.75v-.008zm2.996 0a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008zm2.996 0a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:justify-end sm:pr-6 sm:pb-20">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/20" onClick={handleClose} />

          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm mx-4 sm:mx-0 p-5 z-10">
            {sent ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-green-600">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="font-semibold text-gray-800 dark:text-gray-200">¡Gracias por tu mensaje!</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">Tu feedback fue enviado al equipo de administración.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Enviar feedback</h3>
                  <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Type selector */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setType('SUGGESTION')}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                        type === 'SUGGESTION'
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      💡 Sugerencia
                    </button>
                    <button
                      type="button"
                      onClick={() => setType('BUG')}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                        type === 'BUG'
                          ? 'bg-red-50 border-red-300 text-red-700'
                          : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      🐛 Error
                    </button>
                  </div>

                  {/* Message */}
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder={type === 'BUG' ? 'Describí el error que encontraste...' : 'Escribí tu sugerencia...'}
                    rows={4}
                    className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />

                  <button
                    type="submit"
                    disabled={loading || !message.trim()}
                    className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl py-2.5 text-sm transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Enviando...' : 'Enviar'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
