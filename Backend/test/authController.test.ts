import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { Request, Response } from 'express';
import { AuthController } from '../src/controllers/auth.controller.js';
import { authService } from '../src/services/auth.service.js';

function createResponse() {
  const result: { statusCode?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  } as unknown as Response;
  return { result, response };
}

function register(email: string) {
  const result = authService.signUp(
    { name: 'QA User', email, password: 'SecureP@ssw0rd2026!' },
    '127.0.0.1',
    'TestRunner/1.0'
  );
  assert.equal(result.success, true);
  return result;
}

beforeEach(() => authService.reset());

test('login activity requires a valid bearer token and returns only that user activity', () => {
  const first = register('first@apiforge.test');
  register('second@apiforge.test');
  const controller = new AuthController();

  const unauthenticated = createResponse();
  controller.getActivity({ headers: {} } as Request, unauthenticated.response);
  assert.equal(unauthenticated.result.statusCode, 401);
  assert.equal(Object.hasOwn(unauthenticated.result.body as object, 'activities'), false);

  const invalid = createResponse();
  controller.getActivity({ headers: { authorization: 'Bearer invalid-token' } } as Request, invalid.response);
  assert.equal(invalid.result.statusCode, 401);
  assert.equal(Object.hasOwn(invalid.result.body as object, 'activities'), false);

  const authenticated = createResponse();
  controller.getActivity(
    { headers: { authorization: `Bearer ${first.token}` } } as Request,
    authenticated.response
  );
  assert.equal(authenticated.result.statusCode, 200);
  const activities = (authenticated.result.body as { activities: Array<{ userEmail: string }> }).activities;
  assert.equal(activities.length, 1);
  assert.equal(activities[0].userEmail, 'first@apiforge.test');
});
