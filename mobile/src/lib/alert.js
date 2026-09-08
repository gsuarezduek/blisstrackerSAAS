// API imperativa con la misma firma que Alert.alert(title, message, buttons)
// de React Native, pero renderizada con AppAlertHost (estética de la app en
// vez del diálogo gris nativo del SO) — mismo patrón singleton que
// setUnauthorizedHandler en api/client.js: un módulo plano que delega a un
// handler registrado por el componente montado una vez en App.js.
//
// Nunca reemplaza el prompt biométrico real (Face ID/huella) — ese es del
// sistema operativo por diseño de seguridad y no se puede re-skinnear en
// ninguna app. Esto es solo para los Alert.alert que la propia app elige
// mostrar (confirmaciones, errores).
let handler = null

export function setAlertHandler(fn) {
  handler = fn
}

export function showAlert(title, message, buttons) {
  if (!handler) {
    console.warn('[Alert] AppAlertHost no está montado todavía:', title)
    return
  }
  handler({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] })
}
