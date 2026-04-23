const crypto = require('crypto')

const ALGORITHM  = 'aes-256-gcm'
const IV_LENGTH  = 12  // bytes (recomendado para GCM)
const TAG_LENGTH = 16  // bytes del auth tag GCM

function getKey() {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY debe ser una cadena hexadecimal de 64 caracteres (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Cifra un string. Devuelve "iv:tag:ciphertext" en hex.
 * @param {string} plaintext
 * @returns {string|null}
 */
function encrypt(plaintext) {
  if (!plaintext) return null
  const key    = getKey()
  const iv     = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

/**
 * Descifra el formato "iv:tag:ciphertext".
 * @param {string} encoded
 * @returns {string|null}
 */
function decrypt(encoded) {
  if (!encoded) return null
  const parts = encoded.split(':')
  if (parts.length !== 3) throw new Error('Formato de token cifrado inválido')
  const [ivHex, tagHex, cipherHex] = parts
  const key        = getKey()
  const iv         = Buffer.from(ivHex, 'hex')
  const tag        = Buffer.from(tagHex, 'hex')
  const ciphertext = Buffer.from(cipherHex, 'hex')
  const decipher   = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8')
}

module.exports = { encrypt, decrypt }
