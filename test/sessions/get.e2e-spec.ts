import request from 'supertest';
import orchestrator from '../orchestrator';

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

afterAll(async () => {
  await orchestrator.closeApp();
});

describe('GET /api/sessions', () => {
  describe('Anonymous user', () => {
    test('Without a session cookie', async () => {
      const response = await request(orchestrator.getHttpServer()).get(
        '/api/sessions',
      );

      expect(response.status).toBe(401);
    });
  });

  describe('Authenticated user', () => {
    test('Only lists sessions belonging to the caller', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();
      await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .get('/api/sessions')
        .set('Cookie', cookie);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
    });

    test('Logging in twice for the same user surfaces both sessions', async () => {
      const createdUser = await orchestrator.createUser();
      const firstLogin = await orchestrator.login({
        username: createdUser.username,
        password: createdUser.password,
      });
      await orchestrator.login({
        username: createdUser.username,
        password: createdUser.password,
      });
      const cookie = orchestrator.extractSessionCookie(firstLogin)!;

      const response = await request(orchestrator.getHttpServer())
        .get('/api/sessions')
        .set('Cookie', cookie);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });
  });
});

describe('GET /api/sessions/[id]', () => {
  describe('Anonymous user', () => {
    test('Without a session cookie', async () => {
      const response = await request(orchestrator.getHttpServer()).get(
        '/api/sessions/00000000-0000-4000-8000-000000000000',
      );

      expect(response.status).toBe(401);
    });
  });

  describe('Authenticated user', () => {
    // Known gap: findOne() never validates that `id` is a well-formed UUID
    // before handing it to TypeORM. Postgres then rejects the malformed
    // value at the driver level, which is an unhandled error that falls
    // through to the generic 500 handler — unlike the users routes, which
    // validate the id shape upfront and return a clean 400.
    test('With a malformed id (not a UUID) results in an unhandled 500 instead of 400', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .get('/api/sessions/notAValidUuid')
        .set('Cookie', cookie);

      expect(response.status).toBe(500);
    });

    // Known gap: findOne() returns `null` for a session that doesn't belong
    // to the caller (scoped by userId) instead of throwing a NotFound
    // exception, so the route never 404s. ClassSerializerInterceptor then
    // turns that `null` into an empty object on the wire, so the response
    // looks like "found an empty session" rather than "not found" — worse
    // than either a clean null or a 404. Not a data leak (no other user's
    // data comes back), but a confusing, inconsistent contract compared to
    // the equivalent users route.
    test('With another user session id returns 200 with an empty body instead of 404', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();
      const other = await orchestrator.createAuthenticatedUser();

      const otherSessions = await request(orchestrator.getHttpServer())
        .get('/api/sessions')
        .set('Cookie', other.cookie);
      const otherSessionId = otherSessions.body[0].id as string;

      const response = await request(orchestrator.getHttpServer())
        .get(`/api/sessions/${otherSessionId}`)
        .set('Cookie', cookie);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({});
    });

    test('With a well-formed but non-existent id returns 200 with an empty body', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .get('/api/sessions/00000000-0000-4000-8000-000000000000')
        .set('Cookie', cookie);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({});
    });

    // Information-disclosure finding: SessionEntity has no `@Exclude()` on
    // `tokenHash`, so it is serialized straight into the API response. It's
    // an HMAC hash rather than the raw bearer token, but internal
    // credential material still should never cross the API boundary.
    test('Own session payload exposes the internal tokenHash field', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const list = await request(orchestrator.getHttpServer())
        .get('/api/sessions')
        .set('Cookie', cookie);
      const sessionId = list.body[0].id as string;

      const response = await request(orchestrator.getHttpServer())
        .get(`/api/sessions/${sessionId}`)
        .set('Cookie', cookie);

      expect(response.status).toBe(200);
      expect(typeof response.body.tokenHash).toBe('string');
    });
  });

  describe('Success scenarios', () => {
    test('With their own session id', async () => {
      const { user, cookie } = await orchestrator.createAuthenticatedUser();

      const list = await request(orchestrator.getHttpServer())
        .get('/api/sessions')
        .set('Cookie', cookie);
      const sessionId = list.body[0].id as string;

      const response = await request(orchestrator.getHttpServer())
        .get(`/api/sessions/${sessionId}`)
        .set('Cookie', cookie);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(sessionId);
      expect(response.body.userId).toBe(user.id);
      expect(Date.parse(response.body.expires)).not.toBeNaN();
      expect(Date.parse(response.body.created)).not.toBeNaN();
      expect(Date.parse(response.body.updated)).not.toBeNaN();
    });
  });
});
