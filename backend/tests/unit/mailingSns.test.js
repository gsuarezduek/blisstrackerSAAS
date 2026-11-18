// Firmas de Amazon SNS (rebotes/quejas de SES): sin esto, cualquiera podría
// mandarnos "este contacto rebotó" y hacernos suprimir direcciones válidas.
const crypto = require('crypto')
const { verifySnsMessage, isSnsUrl, stringToSign, _certCache } = require('../../src/lib/snsVerify')
const sesProvider = require('../../src/services/mailing/providers/ses')

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = publicKey.export({ type: 'spki', format: 'pem' })
const CERT_URL = 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem'
const fetcher = jest.fn(async () => ({ data: PEM }))

function sign(msg, version = '1') {
  const m = { ...msg, SignatureVersion: version, SigningCertURL: CERT_URL }
  m.Signature = crypto.sign(version === '2' ? 'RSA-SHA256' : 'RSA-SHA1', Buffer.from(stringToSign(m)), privateKey).toString('base64')
  return m
}

const notification = {
  Type: 'Notification', MessageId: 'm1', TopicArn: 'arn:aws:sns:us-east-1:123:mail',
  Message: JSON.stringify({ notificationType: 'Bounce', mail: { messageId: 'ses-1' }, bounce: { bounceType: 'Permanent' } }),
  Timestamp: '2026-11-18T12:00:00.000Z',
}

beforeEach(() => _certCache.clear())

describe('verifySnsMessage', () => {
  it('acepta un mensaje firmado (v1 SHA1 y v2 SHA256)', async () => {
    expect(await verifySnsMessage(sign(notification, '1'), { fetcher })).toBe(true)
    expect(await verifySnsMessage(sign(notification, '2'), { fetcher })).toBe(true)
  })

  it('rechaza un mensaje alterado después de firmar', async () => {
    const m = sign(notification)
    m.Message = m.Message.replace('Permanent', 'Transient')
    expect(await verifySnsMessage(m, { fetcher })).toBe(false)
  })

  it('no baja certificados que no sean de SNS (el atacante firmaría con el suyo)', async () => {
    const m = { ...sign(notification), SigningCertURL: 'https://evil.com/cert.pem' }
    expect(await verifySnsMessage(m, { fetcher })).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('la confirmación de suscripción firma también Token y SubscribeURL', () => {
    const text = stringToSign({ Type: 'SubscriptionConfirmation', Message: 'x', MessageId: 'm', SubscribeURL: 'u', Timestamp: 't', Token: 'k', TopicArn: 'a' })
    expect(text).toBe('Message\nx\nMessageId\nm\nSubscribeURL\nu\nTimestamp\nt\nToken\nk\nTopicArn\na\nType\nSubscriptionConfirmation\n')
  })
})

describe('isSnsUrl', () => {
  it('solo https en el dominio de SNS', () => {
    expect(isSnsUrl('https://sns.sa-east-1.amazonaws.com/?Action=ConfirmSubscription')).toBe(true)
    expect(isSnsUrl('http://sns.us-east-1.amazonaws.com/x')).toBe(false)
    expect(isSnsUrl('https://sns.us-east-1.amazonaws.com.evil.com/x')).toBe(false)
    expect(isSnsUrl('https://sns.us-east-1.amazonaws.com/x', { pem: true })).toBe(false)
  })
})

describe('ses.classify', () => {
  it('credenciales o cuenta pausada invalidan la config; throttling se reintenta', () => {
    expect(sesProvider.classify({ name: 'AccessDeniedException', $metadata: { httpStatusCode: 403 } })).toMatchObject({ fatal: true })
    expect(sesProvider.classify({ name: 'SendingPausedException', $metadata: { httpStatusCode: 400 } })).toMatchObject({ fatal: true })
    expect(sesProvider.classify({ name: 'TooManyRequestsException', $metadata: { httpStatusCode: 429 } })).toMatchObject({ retryable: true })
    expect(sesProvider.classify({ name: 'BadRequestException', $metadata: { httpStatusCode: 400 } })).toEqual({ retryable: false, fatal: false })
  })
})
