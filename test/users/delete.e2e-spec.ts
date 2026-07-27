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

describe('DELETE /api/users/[id]', () => {
  describe('Anonymous user', () => {
    test('Without a session cookie', async () => {
      const targetUser = await orchestrator.createUser();

      const response = await request(orchestrator.getHttpServer()).delete(
        `/api/users/${targetUser.id}`,
      );

      expect(response.status).toBe(401);
    });
  });

  describe('Authenticated user', () => {
    test('With a malformed id (not a UUID)', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .delete('/api/users/notAValidUuid')
        .set('Cookie', cookie);

      expect(response.status).toBe(400);
    });

    test('With a well-formed but non-existent id', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .delete('/api/users/00000000-0000-4000-8000-000000000000')
        .set('Cookie', cookie);

      expect(response.status).toBe(404);
    });

    // Critical IDOR / broken access control: remove() never checks that the
    // caller owns the target id, so any authenticated user can permanently
    // delete an account that isn't theirs.
    test('Can delete another user account with no ownership check (IDOR)', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();
      const victim = await orchestrator.createUser();

      const response = await request(orchestrator.getHttpServer())
        .delete(`/api/users/${victim.id}`)
        .set('Cookie', cookie);

      expect(response.status).toBe(204);

      const victimLoginAttempt = await orchestrator.login({
        username: victim.username,
        password: victim.password,
      });
      expect(victimLoginAttempt.status).toBe(401);
    });
  });

  describe('Success scenarios', () => {
    test('Deleting own account', async () => {
      const { user, cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .delete(`/api/users/${user.id}`)
        .set('Cookie', cookie);

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});

      // The FK on sessions is ON DELETE CASCADE, so the very cookie used to
      // authenticate this request must stop working right away.
      const nextRequestWithSameCookie = await request(
        orchestrator.getHttpServer(),
      )
        .get('/api/users')
        .set('Cookie', cookie);

      expect(nextRequestWithSameCookie.status).toBe(401);
    });
  });
});
