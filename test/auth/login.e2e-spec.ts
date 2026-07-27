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

describe('POST /api/auth/login', () => {
  describe('Anonymous user', () => {
    test('With a missing body', async () => {
      const response = await request(orchestrator.getHttpServer())
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
    });

    test('With a username shorter than the minimum length', async () => {
      const response = await request(orchestrator.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'abc', password: 'aValidPassword123' });

      expect(response.status).toBe(400);
    });

    test('With a password shorter than the minimum length', async () => {
      const response = await request(orchestrator.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'validUsername', password: 'short' });

      expect(response.status).toBe(400);
    });

    test('With a non-existent username', async () => {
      const response = await request(orchestrator.getHttpServer())
        .post('/api/auth/login')
        .send({
          username: 'thisUserDoesNotExist',
          password: 'aValidPassword123',
        });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: 'Invalid credentials',
        action: 'Check your username and password',
      });
    });

    test('With a correct username but incorrect password', async () => {
      const createdUser = await orchestrator.createUser();

      const response = await request(orchestrator.getHttpServer())
        .post('/api/auth/login')
        .send({
          username: createdUser.username,
          password: 'aTotallyWrongPassword123',
        });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: 'Invalid credentials',
        action: 'Check your username and password',
      });
    });

    // Username enumeration: an attacker should not be able to tell a
    // nonexistent username apart from a valid one with a wrong password.
    test('Gives the same response for a non-existent user and a wrong password (no username enumeration)', async () => {
      const createdUser = await orchestrator.createUser();

      const nonExistentResponse = await request(orchestrator.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'nobodyWithThisName', password: 'aValidPassword12' });

      const wrongPasswordResponse = await request(orchestrator.getHttpServer())
        .post('/api/auth/login')
        .send({ username: createdUser.username, password: 'aValidPassword12' });

      expect(nonExistentResponse.status).toBe(wrongPasswordResponse.status);
      expect(nonExistentResponse.body).toMatchObject({
        message: wrongPasswordResponse.body.message,
        action: wrongPasswordResponse.body.action,
      });
    });

    test('With a deactivated user account', async () => {
      const createdUser = await orchestrator.createUser();
      await orchestrator.deactivateUser(createdUser.id);

      const response = await request(orchestrator.getHttpServer())
        .post('/api/auth/login')
        .send({
          username: createdUser.username,
          password: createdUser.password,
        });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: 'Invalid credentials',
      });
    });

    test('With a SQL injection payload as username', async () => {
      const response = await request(orchestrator.getHttpServer())
        .post('/api/auth/login')
        .send({
          username: "' OR '1'='1' --------",
          password: 'aValidPassword123',
        });

      // The query is parameterized, so this must fail like any other
      // nonexistent username, never authenticate and never 500.
      expect(response.status).toBe(401);
    });

    test('With a username that differs only by letter case', async () => {
      const createdUser = await orchestrator.createUser({
        username: 'CaseSensitiveUser',
      });

      const response = await request(orchestrator.getHttpServer())
        .post('/api/auth/login')
        .send({
          username: 'casesensitiveuser',
          password: createdUser.password,
        });

      // Documents current behavior: username lookup is case-sensitive.
      expect(response.status).toBe(401);
    });

    test('With extra unexpected fields in the body', async () => {
      const createdUser = await orchestrator.createUser();

      const response = await request(orchestrator.getHttpServer())
        .post('/api/auth/login')
        .send({
          username: createdUser.username,
          password: createdUser.password,
          isAdmin: true,
        });

      expect(response.status).toBe(201);
    });
  });

  describe('Success scenarios', () => {
    test('With correct username and password', async () => {
      const createdUser = await orchestrator.createUser();

      const response = await request(orchestrator.getHttpServer())
        .post('/api/auth/login')
        .send({
          username: createdUser.username,
          password: createdUser.password,
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ message: 'Logged in successfully' });

      const cookie = orchestrator.extractSessionCookie(response);
      expect(cookie).toBeDefined();

      const rawSetCookie = (
        response.headers['set-cookie'] as unknown as string[]
      ).find((value) => value.startsWith('sid='))!;
      expect(rawSetCookie).toContain('HttpOnly');
      expect(rawSetCookie).toContain('SameSite=Lax');
      expect(rawSetCookie).toContain('Path=/');
      expect(rawSetCookie).not.toContain('Secure');

      const ttlSeconds = Number(process.env.SESSION_TTL_SECONDS);
      const maxAgeMatch = rawSetCookie.match(/Max-Age=(\d+)/);
      expect(Number(maxAgeMatch?.[1])).toBe(ttlSeconds);
    });

    test('The returned cookie grants access to protected routes', async () => {
      const createdUser = await orchestrator.createUser();

      const loginResponse = await orchestrator.login({
        username: createdUser.username,
        password: createdUser.password,
      });
      const cookie = orchestrator.extractSessionCookie(loginResponse)!;

      const protectedResponse = await request(orchestrator.getHttpServer())
        .get('/api/users')
        .set('Cookie', cookie);

      expect(protectedResponse.status).toBe(200);
    });

    test('Logging in twice creates two independent, simultaneously valid sessions', async () => {
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

      expect(firstCookie).not.toBe(secondCookie);

      const firstStillValid = await request(orchestrator.getHttpServer())
        .get('/api/users')
        .set('Cookie', firstCookie);
      const secondStillValid = await request(orchestrator.getHttpServer())
        .get('/api/users')
        .set('Cookie', secondCookie);

      expect(firstStillValid.status).toBe(200);
      expect(secondStillValid.status).toBe(200);
    });
  });
});
