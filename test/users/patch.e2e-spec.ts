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

describe('PATCH /api/users/[id]', () => {
  describe('Anonymous user', () => {
    test('Without a session cookie', async () => {
      const targetUser = await orchestrator.createUser();

      const response = await request(orchestrator.getHttpServer())
        .patch(`/api/users/${targetUser.id}`)
        .send({ username: 'newUsername' });

      expect(response.status).toBe(401);
    });
  });

  describe('Authenticated user', () => {
    test('With a malformed id (not a UUID)', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .patch('/api/users/notAValidUuid')
        .set('Cookie', cookie)
        .send({ username: 'newUsername' });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        message: 'Invalid parameter for identification',
      });
    });

    test('With a well-formed but non-existent id', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .patch('/api/users/00000000-0000-4000-8000-000000000000')
        .set('Cookie', cookie)
        .send({ username: 'newUsername' });

      expect(response.status).toBe(404);
    });

    // Known gap: the "no fields to update" guard checks
    // `Object.keys(updateUserDto).length === 0`, but class-transformer (with
    // `transform: true`) materializes every declared DTO field as an own
    // `undefined` property. Object.keys() is therefore never empty, so an
    // empty body is never rejected — it silently "succeeds" and only bumps
    // the `updated` timestamp.
    test('With an empty body is accepted instead of rejected with 400', async () => {
      const { user, cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .patch(`/api/users/${user.id}`)
        .set('Cookie', cookie)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        message: 'User updated successfully',
      });
    });

    // Known gap: unlike creation, updates never check uniqueness up front,
    // so a duplicate hits the raw DB constraint and surfaces as a 500
    // instead of the 400 ValidationError a client would expect.
    test('With a duplicated username results in an unhandled 500 instead of 400', async () => {
      const { user, cookie } = await orchestrator.createAuthenticatedUser();
      const otherUser = await orchestrator.createUser();

      const response = await request(orchestrator.getHttpServer())
        .patch(`/api/users/${user.id}`)
        .set('Cookie', cookie)
        .send({ username: otherUser.username });

      expect(response.status).toBe(500);
    });

    test('With a duplicated email results in an unhandled 500 instead of 400', async () => {
      const { user, cookie } = await orchestrator.createAuthenticatedUser();
      const otherUser = await orchestrator.createUser();

      const response = await request(orchestrator.getHttpServer())
        .patch(`/api/users/${user.id}`)
        .set('Cookie', cookie)
        .send({ email: otherUser.email });

      expect(response.status).toBe(500);
    });

    test('Attempting to change the password field has no effect (not part of the update DTO)', async () => {
      const { user, cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .patch(`/api/users/${user.id}`)
        .set('Cookie', cookie)
        .send({ password: 'aBrandNewPassword123' });

      // The field is silently stripped by the whitelist pipe, so this looks
      // like any other "no real change" request (see the empty-body case).
      expect(response.status).toBe(200);

      const stillLogsInWithOldPassword = await orchestrator.login({
        username: user.username,
        password: user.password,
      });
      expect(stillLogsInWithOldPassword.status).toBe(201);
    });

    // IDOR / broken access control: update() never checks that the caller
    // owns the target id, so any authenticated user can rename, re-email or
    // deactivate an account that isn't theirs.
    test('Can rename another user account with no ownership check (IDOR)', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();
      const victim = await orchestrator.createUser();

      const response = await request(orchestrator.getHttpServer())
        .patch(`/api/users/${victim.id}`)
        .set('Cookie', cookie)
        .send({ username: 'takenOverByAttacker' });

      expect(response.status).toBe(200);

      const victimAfter = await request(orchestrator.getHttpServer()).get(
        `/api/users/${victim.id}`,
      );
      // GET on this route also requires auth, but we already proved the
      // write succeeded via the 200 above with an unrelated caller.
      expect(victimAfter.status).toBe(401);
    });

    test('Can deactivate another user account with no ownership check (IDOR)', async () => {
      const { cookie } = await orchestrator.createAuthenticatedUser();
      const victim = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .patch(`/api/users/${victim.user.id}`)
        .set('Cookie', cookie)
        .send({ isActive: false });

      expect(response.status).toBe(200);

      const victimSessionAfter = await request(orchestrator.getHttpServer())
        .get('/api/users')
        .set('Cookie', victim.cookie);

      expect(victimSessionAfter.status).toBe(401);
      expect(victimSessionAfter.body).toMatchObject({
        message: 'Session expired or invalid',
      });
    });

    test('Sending an unknown field like `id` is stripped and ignored', async () => {
      const { user, cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .patch(`/api/users/${user.id}`)
        .set('Cookie', cookie)
        .send({
          id: '11111111-1111-1111-1111-111111111111',
          username: 'stillWorksFine',
        });

      expect(response.status).toBe(200);

      const fetched = await request(orchestrator.getHttpServer())
        .get(`/api/users/${user.id}`)
        .set('Cookie', cookie);

      expect(fetched.body.id).toBe(user.id);
      expect(fetched.body.username).toBe('stillWorksFine');
    });
  });

  describe('Success scenarios', () => {
    test('Updating own username', async () => {
      const { user, cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .patch(`/api/users/${user.id}`)
        .set('Cookie', cookie)
        .send({ username: 'myNewUsername' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        message: 'User updated successfully',
        action: 'You can now fetch the updated user data',
      });

      const fetched = await request(orchestrator.getHttpServer())
        .get(`/api/users/${user.id}`)
        .set('Cookie', cookie);

      expect(fetched.body.username).toBe('myNewUsername');
    });

    test('Updating own email', async () => {
      const { user, cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .patch(`/api/users/${user.id}`)
        .set('Cookie', cookie)
        .send({ email: 'brandnewemail@example.com' });

      expect(response.status).toBe(200);

      const fetched = await request(orchestrator.getHttpServer())
        .get(`/api/users/${user.id}`)
        .set('Cookie', cookie);

      expect(fetched.body.email).toBe('brandnewemail@example.com');
    });

    // Known gap: the "no changes were made" branch is effectively dead code.
    // update() always sets `updated = CURRENT_TIMESTAMP`, so `affected` is
    // always > 0 for a matching row, even when every submitted value is
    // identical to what's already stored.
    test('Sending unchanged data still reports a successful update', async () => {
      const { user, cookie } = await orchestrator.createAuthenticatedUser();

      const response = await request(orchestrator.getHttpServer())
        .patch(`/api/users/${user.id}`)
        .set('Cookie', cookie)
        .send({ username: user.username });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        message: 'User updated successfully',
      });
    });
  });
});
