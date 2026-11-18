// Formulario público de suscripción de una base: prenderlo/apagarlo, doble
// opt-in, página de destino y el código para pegar en la web del cliente.
import { useState } from 'react'
import { Copy } from 'lucide-react'
import api from '../../../api/client'
import { Icon } from '../../ui/Icon'
import { Modal, Field, inputCls, btnPrimary, btnSecondary, ErrorNote, WarnNote, apiError } from './ui'

function snippet(url) {
  return `<form action="${url}" method="POST">
  <input type="email" name="email" placeholder="Tu email" required>
  <input type="text" name="nombre" placeholder="Tu nombre">
  <!-- Anti-spam: dejalo oculto y vacío -->
  <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px">
  <button type="submit">Suscribirme</button>
</form>`
}

export default function ListFormModal({ base, list, configActive, onClose, onChange }) {
  const [l, setL] = useState(list)
  const [successUrl, setSuccessUrl] = useState(list.formSuccessUrl || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  async function call(fn) {
    setBusy(true); setError('')
    try { const { data } = await fn(); setL(prev => ({ ...prev, ...data })); onChange?.() }
    catch (err) { setError(apiError(err)) }
    finally { setBusy(false) }
  }
  const toggleForm = () => call(() => api.post(`${base}/lists/${l.id}/form`, { enabled: !l.subscribeUrl }))
  const saveSettings = patch => call(() => api.patch(`${base}/lists/${l.id}`, patch))
  const copy = (text, key) => { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500) }

  return (
    <Modal wide title={`Formulario de suscripción — ${l.name}`} onClose={onClose}
      footer={<button className={btnPrimary} onClick={onClose}>Listo</button>}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {l.subscribeUrl ? 'El formulario está activo: quien se suscriba entra a esta base.' : 'Activalo para que la gente se suscriba a esta base desde la web del cliente.'}
          </p>
          <button className={l.subscribeUrl ? btnSecondary : btnPrimary} disabled={busy} onClick={toggleForm}>{l.subscribeUrl ? 'Desactivar' : 'Activar'}</button>
        </div>

        {l.subscribeUrl && (
          <>
            {!configActive && l.doubleOptIn && (
              <WarnNote>La configuración de envío no está verificada: con doble opt-in el formulario no puede mandar el mail de confirmación y va a rechazar las suscripciones.</WarnNote>
            )}
            <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" className="mt-0.5 rounded" checked={l.doubleOptIn} disabled={busy} onChange={e => saveSettings({ doubleOptIn: e.target.checked })} />
              <span>
                <b>Doble opt-in</b> (recomendado): la persona recibe un mail y queda suscripta recién cuando confirma.
                <span className="block text-xs text-gray-500">Evita bots y direcciones mal escritas, y es la prueba de consentimiento más fuerte. Quien se había dado de baja siempre tiene que confirmar.</span>
              </span>
            </label>
            <Field label="Página de destino después de suscribirse (opcional)" hint="Por ejemplo, una página de gracias en la web del cliente. Vacío = una página nuestra que dice que revise su mail.">
              <div className="flex gap-2">
                <input className={inputCls} placeholder="https://cliente.com/gracias" value={successUrl} onChange={e => setSuccessUrl(e.target.value)} />
                <button className={btnSecondary} disabled={busy || successUrl === (l.formSuccessUrl || '')} onClick={() => saveSettings({ formSuccessUrl: successUrl })}>Guardar</button>
              </div>
            </Field>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Código para pegar en la web</p>
                <button className={btnSecondary} onClick={() => copy(snippet(l.subscribeUrl), 'snippet')}><Icon as={Copy} size={13} /> {copied === 'snippet' ? 'Copiado' : 'Copiar'}</button>
              </div>
              <pre className="text-[11px] leading-snug bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 overflow-x-auto text-gray-700 dark:text-gray-300">{snippet(l.subscribeUrl)}</pre>
              <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">
                Se puede estilizar libremente; lo que importa son los <code>name</code> de los campos (<code>email</code>, <code>nombre</code>, <code>apellido</code>) y el campo oculto <code>website</code>.
                Para un form hecho a medida, también acepta un <code>fetch</code> con JSON a la misma URL y devuelve <code>{'{ ok, status }'}</code>.
              </p>
            </div>
          </>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </Modal>
  )
}
