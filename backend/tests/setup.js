process.env.JWT_SECRET      = 'test-secret-key-for-jest'
process.env.NODE_ENV        = 'test'
process.env.RESEND_API_KEY  = 're_test_dummy_key_for_jest'
// lib/encryption.js (secret TOTP del 2FA, credenciales de proyecto) exige 64 hex.
process.env.ENCRYPTION_KEY  = '0'.repeat(64)

beforeEach(() => jest.clearAllMocks())
afterAll(() => jest.restoreAllMocks())
