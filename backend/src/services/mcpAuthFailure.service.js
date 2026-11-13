/**
 * Registro y aviso de los intentos de autenticación de MCP rechazados.
 *
 * Antes, un 401 de /api/mcp no dejaba rastro en ningún lado: ni log, ni fila, ni
 * contador. Diagnosticar "mi agente dice Connection closed" obligaba a reconstruir
 * el incidente desde los logs HTTP del proxy, porque el cliente MCP muestra el 401
 * del handshake como una caída de conexión y no como un problema de credencial.
 *
 * OJO con la identidad — es lo que define qué se puede avisar y qué no:
 *   - 'revoked'       el token existe y está revocado → hay fila, hay dueño → se avisa por mail.
 *   - 'unknown_token' el valor no coincide con ningún hash → NO hay fila, ni usuario, ni
 *                     workspace. Es anónimo: no hay a quién mandarle el mail ni en qué
 *                     Preferencias mostrarlo. Queda en el log del servidor y en esta tabla.
 *   - 'no_token'      ni siquiera vino el header. Igual de anónimo.
 */
const prisma = require('../lib/prisma')
const { sendMcpTokenRevokedNotice } = require('./email/accountEmails')

// Cuántas veces tiene que insistir un conector con un token REVOCADO antes de que le
// escribamos al dueño. No es 1 a propósito: el primer rechazo después de revocar a
// propósito es lo esperado. Que siga insistiendo es lo que significa "quedó algo mal
// configurado del otro lado".
const REVOKED_NOTICE_AFTER = 3

// Un aviso por token por día como mucho: el conector reintenta cada ~40 segundos y sin
// esto serían ~2000 mails diarios por agente roto.
const NOTICE_COOLDOWN_MS = 24 * 60 * 60 * 1000

// Cuántos de los primeros intentos de un origen se loguean, y cada cuántos después.
// El estado completo vive en la fila (`attempts`/`lastAt`) y en la UI: el log es la señal
// de que algo está pasando, no el registro. Sin esto un solo conector mal configurado
// escribe cientos de líneas por día y tapa los errores de verdad.
const LOG_FIRST = 3
const LOG_EVERY = 50

// Los primeros intentos son los informativos (cuándo arrancó el problema); después
// alcanza con una confirmación periódica de que sigue vivo.
function shouldLog(attempts) {
  return attempts <= LOG_FIRST || attempts % LOG_EVERY === 0
}

// Nunca el token: los primeros caracteres de su sha256. No permite reconstruirlo y
// alcanza para distinguir "siempre manda el mismo valor equivocado" (config vieja) de
// "manda uno distinto cada vez" (algo lo está generando mal).
function hashPrefixOf(tokenHash) {
  return tokenHash ? tokenHash.slice(0, 12) : null
}

function shortUa(req) {
  const ua = req.headers['user-agent']
  return ua ? String(ua).slice(0, 120) : null
}

/**
 * Registra un rechazo y, si corresponde, avisa por mail. Best-effort: nunca lanza ni
 * demora la respuesta — quien llama no hace await.
 *
 * @param {object} req
 * @param {{ reason: 'no_token'|'unknown_token'|'revoked', tokenHash?: string, row?: object }} info
 */
async function recordFailure(req, { reason, tokenHash, row, error }) {
  const prefix = hashPrefixOf(tokenHash)
  const ip = req.ip || null
  const userAgent = shortUa(req)

  // Si lo que falló fue la base, escribir la fila también fallaría — y además no es un
  // rechazo de credencial, así que no corresponde contarlo como tal. Sólo se grita.
  if (reason === 'db_error') {
    console.error(
      `[mcpAuth] NO se pudo verificar el token (la base no respondió) · token ${prefix || '—'} · ` +
      `ip ${ip || '—'} · ${error?.message || 'sin detalle'}`
    )
    return
  }

  // Agrupa los reintentos del mismo origen en UNA fila. Sin token no hay hash que
  // agrupar, así que cae a la IP.
  const fingerprint = prefix ? `h:${prefix}` : `n:${ip || 'desconocida'}`

  const identity = row
    ? { tokenId: row.id, workspaceId: row.workspaceId, userId: row.userId }
    : { tokenId: null, workspaceId: null, userId: null }

  const rec = await prisma.mcpAuthFailure.upsert({
    where: { fingerprint },
    update: { attempts: { increment: 1 }, lastAt: new Date(), reason, ip, userAgent, ...identity },
    create: { fingerprint, reason, hashPrefix: prefix, ip, userAgent, ...identity },
  })

  // console.log y no console.warn: en Railway todo lo que sale por stderr se clasifica
  // como error, y un conector mal configurado pintaba de rojo el panel entero.
  if (shouldLog(rec.attempts)) {
    console.log(
      `[mcpAuth] rechazado (${reason}) · token ${prefix || '—'} · ip ${ip || '—'} · ` +
      `ua ${userAgent || '—'} · intento #${rec.attempts}` +
      (row ? ` · agente "${row.label || 'sin nombre'}" (#${row.id})` : '')
    )
  }

  if (reason === 'revoked' && row) await maybeNotifyOwner(row, rec)
}

async function maybeNotifyOwner(row, rec) {
  if (rec.attempts < REVOKED_NOTICE_AFTER) return
  if (row.revokedNoticeAt && Date.now() - new Date(row.revokedNoticeAt).getTime() < NOTICE_COOLDOWN_MS) return

  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { email: true, name: true },
  })
  if (!user?.email) return

  // Se sella ANTES de mandar: dos requests del mismo bucle de reintentos entran casi
  // a la vez y si no, los dos pasarían el cooldown y saldrían dos mails.
  await prisma.mcpToken.update({ where: { id: row.id }, data: { revokedNoticeAt: new Date() } })

  await sendMcpTokenRevokedNotice(user.email, user.name, {
    label: row.label,
    attempts: rec.attempts,
    workspaceId: row.workspaceId,
    slug: row.workspace?.slug,
  })
}

// No bloquea la respuesta del 401 ni la rompe si la DB falla.
function recordFailureAsync(req, info) {
  recordFailure(req, info).catch(err => console.error('[mcpAuth] no se pudo registrar el rechazo:', err.message))
}

module.exports = { recordFailure, recordFailureAsync, REVOKED_NOTICE_AFTER, NOTICE_COOLDOWN_MS, LOG_FIRST, LOG_EVERY }
