const OpenAI = require('openai')

// Cliente OpenAI único y compartido — hoy solo se usa para transcripción de audio
// (Whisper) en el prototipo de resumen automático de reuniones. Mismo criterio que
// lib/claude.js: importar siempre desde acá en vez de instanciar `new OpenAI()` suelto.
//
// A diferencia del SDK de Anthropic, el de OpenAI lanza en el constructor si falta la
// API key (no recién al llamarla) — por eso, igual que lib/stripe.js, acá queda en
// `null` sin la env var en vez de tirar abajo el arranque del server. Los callers deben
// chequear null antes de usarlo (ver transcribeMeetingTest en projectMeetings.controller.js).
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

module.exports = { openai }
