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

describe('DELETE /api/sessions/[id]', () => {
  describe('Anonymous user', () => {
    test('Without a session cookie', async () => {
      const response = await request(orchestrator.getHttpServer()).delete(
        '/api/sessions/00000000-0000-4000-8000-000000000000',
      );

      expect(response.status).toBe(401);
    });
  });

  describe('Authenticated user', () => {
    // Known gap: remove() builds a raw delete({ id, userId }) call, and
    // Postgres rejects the malformed id at the driver level before the
    // WHERE clause can filter anything out. Same class of bug as the GET
    // route: no upfront UUID validation, so it surfaces as a 500.
    test('With a malformed id (not a UUID) results in an unhandled 500', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .delete('/api/sessions/notAValidUuid')
        .set('Cookie', cookie);

      expect(response.status).toBe(500);
    });

    test('With a well-formed but non-existent id is a silent no-op', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .delete('/api/sessions/00000000-0000-4000-8000-000000000000')
        .set('Cookie', cookie);

      expect(response.status).toBe(200);
    });

    // Unlike the users routes, this one is IDOR-safe: delete() is scoped by
    // (id, userId), so targeting another user's session id changes nothing.
    test('Cannot delete another user session (safely scoped)', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();
      const victim = await orchestrator.createAuthenticatedUser();

      const victimSessions = await request(orchestrator.getHttpServer())
        .get('/api/sessions')
        .set('Cookie', victim.cookie);
      const victimSessionId = victimSessions.body[0].id as string;

      const response = await request(orchestrator.getHttpServer())
        .delete(`/api/sessions/${victimSessionId}`)
        .set('Cookie', cookie);

      // Silent no-op either way (200), so the only way to prove the victim's
      // session survived is to actually use it afterwards.
      expect(response.status).toBe(200);

      const victimStillWorks = await request(orchestrator.getHttpServer())
        .get('/api/users')
        .set('Cookie', victim.cookie);
      expect(victimStillWorks.status).toBe(200);
    });
  });

  describe('Success scenarios', () => {
    test('Deleting their own session', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const list = await request(orchestrator.getHttpServer())
        .get('/api/sessions')
        .set('Cookie', cookie);
      const sessionId = list.body[0].id as string;

      const response = await request(orchestrator.getHttpServer())
        .delete(`/api/sessions/${sessionId}`)
        .set('Cookie', cookie);

      expect(response.status).toBe(200);

      // The very cookie used to authenticate this delete request should now
      // be invalid, since it pointed at the session that was just removed.
      const nextRequestWithSameCookie = await request(
        orchestrator.getHttpServer(),
      )
        .get('/api/sessions')
        .set('Cookie', cookie);

      expect(nextRequestWithSameCookie.status).toBe(401);
    });

    test('Deleting one session leaves other sessions of the same user intact', async () => {
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

      const list = await request(orchestrator.getHttpServer())
        .get('/api/sessions')
        .set('Cookie', firstCookie);
      const sessionToDelete = list.body[0].id as string;

      await request(orchestrator.getHttpServer())
        .delete(`/api/sessions/${sessionToDelete}`)
        .set('Cookie', firstCookie);

      const remaining = await request(orchestrator.getHttpServer())
        .get('/api/sessions')
        .set('Cookie', secondCookie);

      expect(remaining.status).toBe(200);
      expect(remaining.body).toHaveLength(1);
    });
  });
});
