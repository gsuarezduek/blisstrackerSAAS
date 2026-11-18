// Verificación de firmas de Amazon SNS (sin dependencias). SNS firma cada mensaje
// con un certificado que publica en su propio dominio; validar la firma es lo que
// impide que cualquiera nos mande "este contacto rebotó" y nos haga suprimir
// direcciones válidas. https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
const crypto = require('crypto')
const axios = require('axios')

// Solo certificados y URLs de confirmación servidos por SNS mismo. Si esto
// aceptara cualquier host, el atacante firmaría con su propio certificado.
const SNS_HOST_RE = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/

const certCache = new Map()

function isSnsUrl(u, { pem = false } = {}) {
  try {
    const url = new URL(u)
    if (url.protocol !== 'https:' || !SNS_HOST_RE.test(url.hostname)) return false
    return pem ? url.pathname.endsWith('.pem') : true
  } catch { return false }
}

const FIELDS = {
  Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
  SubscriptionConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
  UnsubscribeConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
}

/** El texto que SNS firmó: pares "Clave\nValor\n" en orden fijo (Subject solo si viene). */
function stringToSign(msg) {
  const keys = FIELDS[msg.Type]
  if (!keys) return null
  return keys.filter(k => msg[k] !== undefined && msg[k] !== null).map(k => `${k}\n${msg[k]}\n`).join('')
}

async function fetchCert(url, fetcher) {
  if (certCache.has(url)) return certCache.get(url)
  const { data } = await fetcher(url)
  const pem = String(data)
  if (!pem.includes('-----BEGIN ')) throw new Error('Certificado de SNS inválido')
  certCache.set(url, pem)
  return pem
}

const defaultFetcher = url => axios.get(url, { timeout: 5000, responseType: 'text', maxRedirects: 0 })

/**
 * @returns {Promise<boolean>} true si la firma es válida.
 * `fetcher` se inyecta en los tests (para no salir a internet).
 */
async function verifySnsMessage(msg, { fetcher = defaultFetcher } = {}) {
  if (!msg || typeof msg !== 'object') return false
  if (!isSnsUrl(msg.SigningCertURL || msg.SigningCertUrl, { pem: true })) return false
  const text = stringToSign(msg)
  if (!text || !msg.Signature) return false
  const algo = String(msg.SignatureVersion) === '2' ? 'RSA-SHA256' : 'RSA-SHA1'
  try {
    const cert = await fetchCert(msg.SigningCertURL || msg.SigningCertUrl, fetcher)
    return crypto.verify(algo, Buffer.from(text, 'utf8'), cert, Buffer.from(msg.Signature, 'base64'))
  } catch {
    return false
  }
}

module.exports = { verifySnsMessage, isSnsUrl, stringToSign, _certCache: certCache }
