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

describe('POST /api/users', () => {
  describe('Anonymous user', () => {
    describe('Error and edge scenarios', () => {
      test('With missing body', async () => {
        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({});

        expect(response.status).toBe(400);
        expect(response.body.statusCode).toBe(400);
      });

      test('With invalid email format', async () => {
        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: 'validUsername',
            email: 'not-an-email',
            password: 'a-very-long-password-123',
          });

        expect(response.status).toBe(400);
      });

      test('With username shorter than 6 characters', async () => {
        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: 'ab',
            email: 'shortusername@example.com',
            password: 'a-very-long-password-123',
          });

        expect(response.status).toBe(400);
      });

      test('With username longer than 39 characters', async () => {
        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: 'a'.repeat(40),
            email: 'longusername@example.com',
            password: 'a-very-long-password-123',
          });

        expect(response.status).toBe(400);
      });

      test('With username containing invalid characters (space)', async () => {
        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: 'invalid username',
            email: 'invalidchars@example.com',
            password: 'a-very-long-password-123',
          });

        expect(response.status).toBe(400);
      });

      test('With username starting with a hyphen', async () => {
        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: '-invalidStart',
            email: 'invalidstart@example.com',
            password: 'a-very-long-password-123',
          });

        expect(response.status).toBe(400);
      });

      test('With username containing a SQL injection payload', async () => {
        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: "'; DROP TABLE users; --",
            email: 'sqlinjection@example.com',
            password: 'a-very-long-password-123',
          });

        // Regex validation must reject it before it ever reaches the database.
        expect(response.status).toBe(400);
      });

      test('With username containing an HTML/script injection payload', async () => {
        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: '<script>alert(1)</script>',
            email: 'xss@example.com',
            password: 'a-very-long-password-123',
          });

        expect(response.status).toBe(400);
      });

      test('With password shorter than 16 characters', async () => {
        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: 'weakpassworduser',
            email: 'weakpassword@example.com',
            password: 'short123',
          });

        expect(response.status).toBe(400);
      });

      test('With password longer than 64 characters', async () => {
        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: 'longpassworduser',
            email: 'longpassword@example.com',
            password: 'a'.repeat(65),
          });

        expect(response.status).toBe(400);
      });

      test('With username, email and password as wrong types', async () => {
        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: { toString: () => 'fakeUsername' },
            email: 12345,
            password: ['array', 'password', 'value'],
          });

        expect(response.status).toBe(400);
      });

      test('With duplicated email', async () => {
        const createdUser = await orchestrator.createUser({});

        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: 'differentUsername',
            email: createdUser.email,
            password: 'a-very-long-password-123',
          });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          message: 'User already exists',
          action: 'Try again with a different email',
        });
      });

      // Known gap: unlike email, the username is not checked before the
      // INSERT, so a duplicate hits the database unique constraint directly.
      // That raw error is not a BaseException/HttpException, so it falls
      // through to the generic 500 handler instead of a proper 400.
      test('With duplicated username results in an unhandled 500 instead of 400', async () => {
        const createdUser = await orchestrator.createUser({});

        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: createdUser.username,
            email: 'another-unique-email@example.com',
            password: 'a-very-long-password-123',
          });

        expect(response.status).toBe(500);
      });

      test('With extra fields attempting mass assignment (isActive, id)', async () => {
        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: 'massassignment',
            email: 'massassignment@example.com',
            password: 'a-very-long-password-123',
            isActive: false,
            id: '11111111-1111-1111-1111-111111111111',
          });

        expect(response.status).toBe(201);
        // Unknown properties must be stripped by the whitelist ValidationPipe,
        // not silently accepted and persisted.
        expect(response.body.isActive).toBe(true);
        expect(response.body.id).not.toBe(
          '11111111-1111-1111-1111-111111111111',
        );
      });
    });

    describe('Success scenarios', () => {
      test('With unique and valid user data', async () => {
        const response = await request(orchestrator.getHttpServer())
          .post('/api/users')
          .send({
            username: 'uniqueUser1',
            email: 'uniqueUser1@example.com',
            password: 'a-very-long-password-123',
          });

        expect(response.status).toBe(201);

        const responseBody = response.body;

        expect(responseBody).toEqual({
          id: responseBody.id,
          username: 'uniqueUser1',
          email: 'uniqueUser1@example.com',
          isActive: true,
          created: responseBody.created,
          updated: responseBody.updated,
        });

        // The password hash must never be present in the response body.
        expect(responseBody.password).toBeUndefined();

        expect(Date.parse(responseBody.created)).not.toBeNaN();
        expect(Date.parse(responseBody.updated)).not.toBeNaN();
      });
    });
  });
});
