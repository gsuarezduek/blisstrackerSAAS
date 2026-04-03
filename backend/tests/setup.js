process.env.JWT_SECRET = 'test-secret-key-for-jest'
process.env.NODE_ENV = 'test'

beforeEach(() => jest.clearAllMocks())
afterAll(() => jest.restoreAllMocks())
