// Preferencia de micrófono/salida de audio para canales de voz, persistida por
// usuario en localStorage (mismo patrón try/catch que chatSound.js). `null` =
// dispositivo predeterminado del sistema.
export const SUPPORTS_OUTPUT_SELECTION =
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

const inputKey = (userId) => `bliss_voice_input_device_${userId}`
const outputKey = (userId) => `bliss_voice_output_device_${userId}`

function getPref(key) {
  try {
    return localStorage.getItem(key) || null
  } catch {
    return null
  }
}

function setPref(key, deviceId) {
  try {
    if (deviceId) localStorage.setItem(key, deviceId)
    else localStorage.removeItem(key)
  } catch {
    // ignorar (private browsing / storage lleno)
  }
}

export const getAudioInputPref = (userId) => (userId ? getPref(inputKey(userId)) : null)
export const setAudioInputPref = (userId, deviceId) => userId && setPref(inputKey(userId), deviceId)
export const getAudioOutputPref = (userId) => (userId ? getPref(outputKey(userId)) : null)
export const setAudioOutputPref = (userId, deviceId) => userId && setPref(outputKey(userId), deviceId)
