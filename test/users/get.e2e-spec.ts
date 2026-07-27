import request from 'supertest';
import { validate as uuidValidate } from 'uuid';
import orchestrator from '../orchestrator';

beforeAll(async () => {
  await orchestrator.waitForAllServices();
  await orchestrator.clearDatabase();
  await orchestrator.runPendingMigrations();
});

afterAll(async () => {
  await orchestrator.closeApp();
});

describe('GET /api/users', () => {
  describe('Anonymous user', () => {
    test('Without a session cookie', async () => {
      const response = await request(orchestrator.getHttpServer()).get(
        '/api/users',
      );

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: 'Authentication required',
        action: 'Log in to access this resource',
      });
    });

    test('With a garbage/forged cookie value', async () => {
      const response = await request(orchestrator.getHttpServer())
        .get('/api/users')
        .set('Cookie', 'sid=this-token-does-not-exist');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: 'Session expired or invalid',
        action: 'Log in again',
      });
    });

    test('With an expired session', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();
      await orchestrator.expireSession(cookie);

      const response = await request(orchestrator.getHttpServer())
        .get('/api/users')
        .set('Cookie', cookie);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: 'Session expired or invalid',
        action: 'Log in again',
      });
    });

    test('With a valid session belonging to a deactivated user', async () => {
      const { user, cookie } = await orchestrator.createAuthenticatedUser();
      await orchestrator.deactivateUser(user.id);

      const response = await request(orchestrator.getHttpServer())
        .get('/api/users')
        .set('Cookie', cookie);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: 'Session expired or invalid',
        action: 'Log in again',
      });
    });
  });

  describe('Authenticated user', () => {
    // Broad access finding: findAll() is not scoped or role-restricted in
    // any way, so any authenticated user (not just an admin) can list every
    // account in the system, including other users' emails and ids.
    test('Can list every user in the system, not just their own account', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();
      const otherUser = await orchestrator.createUser();

      const response = await request(orchestrator.getHttpServer())
        .get('/api/users')
        .set('Cookie', cookie);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(
        response.body.some((item: { id: string }) => item.id === otherUser.id),
      ).toBe(true);
      response.body.forEach((item: { password?: string }) => {
        expect(item.password).toBeUndefined();
      });
    });
  });
});

describe('GET /api/users/[id]', () => {
  describe('Anonymous user', () => {
    test('Without a session cookie', async () => {
      const targetUser = await orchestrator.createUser();

      const response = await request(orchestrator.getHttpServer()).get(
        `/api/users/${targetUser.id}`,
      );

      expect(response.status).toBe(401);
    });
  });

  describe('Authenticated user', () => {
    test('With a malformed id (not a UUID)', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .get('/api/users/notAValidUuid')
        .set('Cookie', cookie);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        message: 'Invalid parameter for identification',
        action: 'Try again with correct parameter',
      });
    });

    test('With a SQL injection payload in the id param', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .get(`/api/users/${encodeURIComponent("1'; DROP TABLE users; --")}`)
        .set('Cookie', cookie);

      // The uuid-format guard must reject it before it ever reaches TypeORM.
      expect(response.status).toBe(400);
    });

    test('With a well-formed but non-existent id', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .get('/api/users/00000000-0000-4000-8000-000000000000')
        .set('Cookie', cookie);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        message: 'Not match data',
        action: 'Ensure your passing valid parameters',
      });
    });

    // IDOR finding: there is no ownership check on this route, so any
    // authenticated user can fetch the full profile of any other user by id.
    test('Can fetch another user profile by id (no ownership check)', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();
      const otherUser = await orchestrator.createUser();

      const response = await request(orchestrator.getHttpServer())
        .get(`/api/users/${otherUser.id}`)
        .set('Cookie', cookie);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(otherUser.id);
      expect(response.body.email).toBe(otherUser.email);
    });

    test('With their own id', async () => {
      const { user, cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .get(`/api/users/${user.id}`)
        .set('Cookie', cookie);

      expect(response.status).toBe(200);

      const responseBody = response.body;

      expect(responseBody).toEqual({
        id: user.id,
        username: user.username,
        email: user.email,
        isActive: true,
        created: responseBody.created,
        updated: responseBody.updated,
      });

      expect(uuidValidate(responseBody.id)).toBe(true);
      expect(responseBody.password).toBeUndefined();
      expect(Date.parse(responseBody.created)).not.toBeNaN();
      expect(Date.parse(responseBody.updated)).not.toBeNaN();
    });
  });
});
