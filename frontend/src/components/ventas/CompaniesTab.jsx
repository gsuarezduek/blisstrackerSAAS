import { useState, useEffect, useCallback } from 'react'
import api from '../../api/client'
import LoadingSpinner from '../LoadingSpinner'
import ConfirmModal from '../ConfirmModal'
import EmptyState from '../EmptyState'
import CompanyModal from './CompanyModal'
import ContactModal from './ContactModal'

const input = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

export default function CompaniesTab({ onDataChange }) {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)      // companyId con contactos abiertos
  const [contacts, setContacts] = useState([])
  const [companyModal, setCompanyModal] = useState(null) // { } nueva | { company } editar | null
  const [contactModal, setContactModal] = useState(null) // { companyId } | { contact, companyId } | null
  const [companyToDelete, setCompanyToDelete] = useState(null) // { id, name } | null
  const [deletingCompany, setDeletingCompany] = useState(false)

  const load = useCallback(async () => {
    const { data } = await api.get(`/ventas/companies${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`)
    setCompanies(data)
    setLoading(false)
  }, [search])

  useEffect(() => { load() }, [load])

  async function loadContacts(companyId) {
    if (expanded === companyId) { setExpanded(null); return }
    const { data } = await api.get(`/ventas/contacts?companyId=${companyId}`)
    setContacts(data)
    setExpanded(companyId)
  }

  async function deleteCompany() {
    if (!companyToDelete) return
    setDeletingCompany(true)
    try {
      await api.delete(`/ventas/companies/${companyToDelete.id}`)
      load(); onDataChange?.()
    } finally {
      setDeletingCompany(false)
      setCompanyToDelete(null)
    }
  }
  async function deleteContact(id) {
    if (!window.confirm('¿Eliminar el contacto?')) return
    await api.delete(`/ventas/contacts/${id}`)
    loadContacts(expanded); load()
  }

  function afterCompany() { setCompanyModal(null); load(); onDataChange?.() }
  function afterContact()  { setContactModal(null); if (expanded) { api.get(`/ventas/contacts?companyId=${expanded}`).then(({ data }) => setContacts(data)) } load() }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input className={`${input} flex-1`} placeholder="Buscar empresa…" value={search} onChange={e => setSearch(e.target.value)} />
        <button onClick={() => setCompanyModal({})} className="bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl px-4 py-2 text-sm shrink-0">+ Nueva empresa</button>
      </div>

      {companies.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl">
          <EmptyState icon="🏢" message="No hay empresas cargadas." />
        </div>
      ) : (
        <div className="space-y-3">
          {companies.map(c => (
            <div key={c.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-4 p-4">
                <button onClick={() => loadContacts(c.id)} className="flex-1 text-left min-w-0">
                  <div className="font-medium text-gray-900 dark:text-white truncate">{c.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {c.industry ? `${c.industry} · ` : ''}{c._count?.contacts ?? 0} contacto(s) · {c._count?.leads ?? 0} lead(s)
                  </div>
                </button>
                <div className="flex gap-2 shrink-0 text-sm">
                  <button onClick={() => setCompanyModal({ company: c })} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Editar</button>
                  <button onClick={() => setCompanyToDelete({ id: c.id, name: c.name })} className="text-red-400 hover:text-red-600">Eliminar</button>
                </div>
              </div>

              {expanded === c.id && (
                <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contactos</span>
                    <button onClick={() => setContactModal({ companyId: c.id })} className="text-xs text-primary-600 hover:underline">+ Agregar contacto</button>
                  </div>
                  {contacts.length === 0 ? (
                    <p className="text-sm text-gray-400">Sin contactos.</p>
                  ) : (
                    <ul className="space-y-1">
                      {contacts.map(ct => (
                        <li key={ct.id} className="flex items-center justify-between text-sm py-1">
                          <span className="text-gray-800 dark:text-gray-200">
                            {ct.name}{ct.title ? <span className="text-gray-400"> · {ct.title}</span> : ''}
                            {ct.email ? <span className="text-gray-400"> · {ct.email}</span> : ''}
                            {ct.phone ? <span className="text-gray-400"> · {ct.phone}</span> : ''}
                          </span>
                          <span className="flex gap-2 shrink-0">
                            <button onClick={() => setContactModal({ contact: ct, companyId: c.id })} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Editar</button>
                            <button onClick={() => deleteContact(ct.id)} className="text-red-400 hover:text-red-600">Eliminar</button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {companyModal && <CompanyModal company={companyModal.company} onClose={() => setCompanyModal(null)} onSaved={afterCompany} />}
      {contactModal && <ContactModal contact={contactModal.contact} companyId={contactModal.companyId} onClose={() => setContactModal(null)} onSaved={afterContact} />}

      <ConfirmModal
        open={!!companyToDelete}
        title="Eliminar empresa"
        message={`Se eliminarán sus contactos y leads${companyToDelete?.name ? ` de "${companyToDelete.name}"` : ''}.`}
        loading={deletingCompany}
        onConfirm={deleteCompany}
        onCancel={() => setCompanyToDelete(null)}
      />
    </div>
  )
}
