import { useState, useEffect, useRef } from 'react'
import { useVoiceCall } from '../../context/VoiceCallContext'

// Menú de selección de micrófono/salida de audio para la sala de voz. La salida
// (setSinkId) no está soportada en Safari — supportsOutputSelection lo indica y esa
// sección directamente no se muestra ahí.
export default function VoiceDeviceMenu() {
  const { inputDeviceId, outputDeviceId, setAudioInputDevice, setAudioOutputDevice, supportsOutputSelection } = useVoiceCall() || {}
  const [open, setOpen] = useState(false)
  const [inputs, setInputs] = useState([])
  const [outputs, setOutputs] = useState([])
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    navigator.mediaDevices.enumerateDevices().then(devices => {
      setInputs(devices.filter(d => d.kind === 'audioinput'))
      setOutputs(devices.filter(d => d.kind === 'audiooutput'))
    }).catch(() => {})
  }, [open])

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Elegir micrófono / salida de audio"
        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        ⚙️
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-2.5 z-20 space-y-2.5">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Micrófono</p>
            <select
              value={inputDeviceId || ''}
              onChange={e => setAudioInputDevice(e.target.value || null)}
              className="w-full text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            >
              <option value="">Predeterminado</option>
              {inputs.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || 'Micrófono'}</option>
              ))}
            </select>
          </div>
          {supportsOutputSelection && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Salida de audio</p>
              <select
                value={outputDeviceId || ''}
                onChange={e => setAudioOutputDevice(e.target.value || null)}
                className="w-full text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              >
                <option value="">Predeterminado</option>
                {outputs.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || 'Parlante/auriculares'}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
