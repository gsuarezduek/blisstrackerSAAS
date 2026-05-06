process.env.JWT_SECRET      = 'test-secret-key-for-jest'
process.env.NODE_ENV        = 'test'
process.env.RESEND_API_KEY  = 're_test_dummy_key_for_jest'

beforeEach(() => jest.clearAllMocks())
afterAll(() => jest.restoreAllMocks())
