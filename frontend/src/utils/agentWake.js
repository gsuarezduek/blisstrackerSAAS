// Interruptor de la UI del despertador de agentes — APAGADO (noviembre 2026).
//
// El despertador es el canal por el que BlissTracker invoca a un agente por la API de su
// proveedor cuando hay una novedad para él. Se apagó porque no se está usando y es el
// único canal que gasta plata del workspace sin que nadie lo pida en el momento: dejarlo
// como una opción más en la pantalla invita a prenderlo sin querer.
//
// Vive en su propio módulo porque lo miran tres pantallas (la config en Preferencias, el
// toggle de cada agente y la ficha del agente) y sus tests, y tener el flag en una de
// ellas hacía que las otras dependieran de un componente de Preferencias.
//
// La otra mitad del interruptor está en el backend
// (backend/src/services/agentWake.service.js → WAKE_ENABLED): sin ella, un agente que ya
// tenía `wakeEnabled: true` seguiría despertándose y facturando, sin ninguna pantalla
// donde verlo ni apagarlo. **Para volver a prenderlo hay que poner las DOS en `true`.**
//
// El código queda entero a propósito: funciona, está testeado y sus tests se vuelven a
// correr solos cuando este flag vuelva a `true`.
export const WAKE_UI_ENABLED = false
