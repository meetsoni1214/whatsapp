process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://event_chat:event_chat@localhost:5433/event_chat_test';
process.env.JWT_ACCESS_SECRET = 'phase-2-e2e-secret-isolated-from-production';
process.env.JWT_ACCESS_TTL_SECONDS = '900';
process.env.REFRESH_SESSION_TTL_DAYS = '30';
