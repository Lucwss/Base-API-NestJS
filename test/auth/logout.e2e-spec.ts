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

describe('POST /api/auth/logout', () => {
  describe('Anonymous user', () => {
    test('Without a session cookie', async () => {
      const response = await request(orchestrator.getHttpServer()).post(
        '/api/auth/logout',
      );

      expect(response.status).toBe(401);
    });

    test('With a garbage/forged cookie value', async () => {
      const response = await request(orchestrator.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', 'sid=this-token-does-not-exist');

      expect(response.status).toBe(401);
    });

    test('With an already expired session', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();
      await orchestrator.expireSession(cookie);

      const response = await request(orchestrator.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie);

      expect(response.status).toBe(401);
    });
  });

  describe('Authenticated user', () => {
    test('Logs out successfully and clears the cookie', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ message: 'Logged out successfully' });

      const rawSetCookie = (
        response.headers['set-cookie'] as unknown as string[]
      ).find((value) => value.startsWith('sid='))!;
      expect(rawSetCookie).toMatch(/sid=;/);
    });

    // Security-relevant: the session must be invalidated server-side, not
    // just cleared client-side, otherwise a stolen cookie stays usable
    // forever even after the legitimate user "logs out".
    test('The session token cannot be reused after logout', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      await request(orchestrator.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie);

      const reusedCookieResponse = await request(orchestrator.getHttpServer())
        .get('/api/users')
        .set('Cookie', cookie);

      expect(reusedCookieResponse.status).toBe(401);
      expect(reusedCookieResponse.body).toMatchObject({
        message: 'Session expired or invalid',
      });
    });

    test('Logging out twice with the same cookie fails the second time', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const firstLogout = await request(orchestrator.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie);
      const secondLogout = await request(orchestrator.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie);

      expect(firstLogout.status).toBe(201);
      expect(secondLogout.status).toBe(401);
    });

    test('Logging out of one session does not affect a second session for the same user', async () => {
      const createdUser = await orchestrator.createUser();
      const firstLogin = await orchestrator.login({
        username: createdUser.username,
        password: createdUser.password,
      });
      const secondLogin = await orchestrator.login({
        username: createdUser.username,
        password: createdUser.password,
      });
      const firstCookie = orchestrator.extractSessionCookie(firstLogin)!;
      const secondCookie = orchestrator.extractSessionCookie(secondLogin)!;

      await request(orchestrator.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', firstCookie);

      const secondStillValid = await request(orchestrator.getHttpServer())
        .get('/api/users')
        .set('Cookie', secondCookie);

      expect(secondStillValid.status).toBe(200);
    });
  });
});
