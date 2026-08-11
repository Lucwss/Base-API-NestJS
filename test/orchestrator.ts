import 'reflect-metadata';
import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as crypto from 'crypto';
import { faker } from '@faker-js/faker';
import { AppModule } from '../src/app.module';
import { AppDataSource } from '../src/data-source';

let app: INestApplication | undefined;

async function getApp(): Promise<INestApplication> {
  if (app) {
    return app;
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.init();
  return app;
}

function getHttpServer() {
  if (!app) {
    throw new Error('App not initialized. Call waitForAllServices() first.');
  }
  return app.getHttpServer();
}

async function waitForAllServices(): Promise<void> {
  await getApp();

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const maxAttempts = 20;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await AppDataSource.query('SELECT 1');
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function clearDatabase(): Promise<void> {
  await AppDataSource.query(
    'TRUNCATE TABLE "user_roles", "role_permissions", "roles", "sessions", "users" RESTART IDENTITY CASCADE',
  );
}

async function runPendingMigrations(): Promise<void> {
  await AppDataSource.runMigrations();
}

interface CreateUserInput {
  username?: string;
  email?: string;
  password?: string;
}

interface CreatedUser {
  id: string;
  username: string;
  email: string;
  password: string;
  isActive: boolean;
  created: string;
  updated: string;
}

function buildValidUsername(): string {
  return `user${faker.string.alphanumeric({ length: 10, casing: 'lower' })}`;
}

function buildValidEmail(): string {
  return `${faker.string.alphanumeric({ length: 12, casing: 'lower' })}@example.com`;
}

function buildValidPassword(): string {
  return faker.string.alphanumeric({ length: 20 });
}

async function createUser(
  overrides: CreateUserInput = {},
): Promise<CreatedUser> {
  const password = overrides.password ?? buildValidPassword();
  const payload = {
    username: overrides.username ?? buildValidUsername(),
    email: overrides.email ?? buildValidEmail(),
    password,
  };

  const response = await request(getHttpServer())
    .post('/api/users')
    .send(payload);

  if (response.status !== 201) {
    throw new Error(
      `orchestrator.createUser failed: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return { ...response.body, password };
}

async function deactivateUser(userId: string): Promise<void> {
  await AppDataSource.query(
    'UPDATE "users" SET "isActive" = false WHERE id = $1',
    [userId],
  );
}

interface LoginCredentials {
  username: string;
  password: string;
}

async function login(credentials: LoginCredentials) {
  return request(getHttpServer()).post('/api/auth/login').send(credentials);
}

function extractSessionCookie(response: request.Response): string | undefined {
  const rawCookies = response.headers['set-cookie'];
  if (!rawCookies) {
    return undefined;
  }

  const cookies = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
  const sidCookie = cookies.find((cookie) => cookie.startsWith('sid='));
  return sidCookie?.split(';')[0];
}

async function createAuthenticatedUser(
  overrides: CreateUserInput = {},
): Promise<{
  user: CreatedUser;
  cookie: string;
}> {
  const user = await createUser(overrides);
  const loginResponse = await login({
    username: user.username,
    password: user.password,
  });
  const cookie = extractSessionCookie(loginResponse);
  if (!cookie) {
    throw new Error(
      'orchestrator.createAuthenticatedUser: login did not return a session cookie',
    );
  }
  return { user, cookie };
}

async function expireSession(cookie: string): Promise<void> {
  const rawToken = cookie.split('=')[1];
  const tokenSecret = process.env.TOKEN_SECRET!;
  const tokenHash = crypto
    .createHmac('sha256', tokenSecret)
    .update(rawToken)
    .digest('hex');

  await AppDataSource.query(
    'UPDATE "sessions" SET "expires" = NOW() - INTERVAL \'1 day\' WHERE "tokenHash" = $1',
    [tokenHash],
  );
}

async function closeApp(): Promise<void> {
  if (app) {
    await app.close();
    app = undefined;
  }
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}

export default {
  getApp,
  getHttpServer,
  waitForAllServices,
  clearDatabase,
  runPendingMigrations,
  createUser,
  deactivateUser,
  login,
  extractSessionCookie,
  createAuthenticatedUser,
  expireSession,
  closeApp,
};
