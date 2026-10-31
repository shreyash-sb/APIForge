import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Request, Response } from 'express';
import { CollectionController } from '../src/controllers/collection.controller.js';
import { collectionService } from '../src/services/collection.service.js';
import { authService } from '../src/services/auth.service.js';

function createMockResponse(authUser?: any) {
  const result: { statusCode?: number; body?: unknown } = {};
  const response = {
    locals: { authUser },
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

test('Collection Security & Multi-User Isolation', async (t) => {
  authService.reset();
  collectionService.reset();
  // 1. Setup two distinct users
  const userARes = authService.signUp(
    { name: 'User Alpha', email: 'alpha@apiforge.test', password: 'Password123!' },
    '127.0.0.1',
    'Agent/1.0'
  );
  const userBRes = authService.signUp(
    { name: 'User Beta', email: 'beta@apiforge.test', password: 'Password123!' },
    '127.0.0.1',
    'Agent/1.0'
  );

  assert.ok(userARes.user?.id);
  assert.ok(userBRes.user?.id);

  const userA = userARes.user;
  const userB = userBRes.user;
  const controller = new CollectionController();

  await t.test('User Alpha creates a collection', async () => {
    const { result, response } = createMockResponse(userA);
    await controller.createCollection(
      {
        body: {
          name: 'Alpha Secret Suite',
          requests: [
            {
              id: 'req_1',
              name: 'Get Alpha Secrets',
              method: 'GET',
              url: 'https://api.internal/alpha',
              queryParams: [],
              headers: [],
              body: '',
              auth: { type: 'none' },
            },
          ],
        },
      } as Request,
      response
    );

    assert.equal(result.statusCode, 201);
    const body = result.body as { success: boolean; collection: any };
    assert.equal(body.success, true);
    assert.equal(body.collection.name, 'Alpha Secret Suite');
    assert.equal(body.collection.userId, userA.id);
  });

  let alphaCollectionId = '';

  await t.test('User Alpha can see their collection, but User Beta cannot', async () => {
    // User Alpha queries collections
    const alphaQuery = createMockResponse(userA);
    await controller.getCollections({} as Request, alphaQuery.response);
    assert.equal(alphaQuery.result.statusCode, 200);
    const alphaBody = alphaQuery.result.body as { success: boolean; collections: any[] };
    assert.equal(alphaBody.collections.length, 1);
    assert.equal(alphaBody.collections[0].name, 'Alpha Secret Suite');
    alphaCollectionId = alphaBody.collections[0].id;

    // User Beta queries collections
    const betaQuery = createMockResponse(userB);
    await controller.getCollections({} as Request, betaQuery.response);
    assert.equal(betaQuery.result.statusCode, 200);
    const betaBody = betaQuery.result.body as { success: boolean; collections: any[] };
    // User Beta MUST NOT see User Alpha's collections
    assert.equal(betaBody.collections.length, 0);
  });

  await t.test('User Beta cannot inspect User Alpha collection directly by ID', async () => {
    const betaInspect = createMockResponse(userB);
    await controller.getCollectionById(
      { params: { id: alphaCollectionId } } as unknown as Request,
      betaInspect.response
    );
    assert.equal(betaInspect.result.statusCode, 404);
    const body = betaInspect.result.body as { success: boolean; error: string };
    assert.equal(body.success, false);
    assert.match(body.error, /access denied|not found/i);
  });

  await t.test('User Beta cannot update User Alpha collection', async () => {
    const betaUpdate = createMockResponse(userB);
    await controller.updateCollection(
      {
        params: { id: alphaCollectionId },
        body: { name: 'Hacked by Beta' },
      } as unknown as Request,
      betaUpdate.response
    );
    assert.equal(betaUpdate.result.statusCode, 404);

    // Verify User Alpha collection was not mutated
    const alphaInspect = createMockResponse(userA);
    await controller.getCollectionById(
      { params: { id: alphaCollectionId } } as unknown as Request,
      alphaInspect.response
    );
    assert.equal(alphaInspect.result.statusCode, 200);
    const body = alphaInspect.result.body as { collection: any };
    assert.equal(body.collection.name, 'Alpha Secret Suite');
  });

  await t.test('User Beta cannot delete User Alpha collection', async () => {
    const betaDelete = createMockResponse(userB);
    await controller.deleteCollection(
      { params: { id: alphaCollectionId } } as unknown as Request,
      betaDelete.response
    );
    assert.equal(betaDelete.result.statusCode, 404);

    // User Alpha collection still exists
    const alphaCheck = createMockResponse(userA);
    await controller.getCollections({} as Request, alphaCheck.response);
    const body = alphaCheck.result.body as { collections: any[] };
    assert.equal(body.collections.length, 1);
  });

  await t.test('User Alpha can update and delete their own collection', async () => {
    const alphaUpdate = createMockResponse(userA);
    await controller.updateCollection(
      {
        params: { id: alphaCollectionId },
        body: { name: 'Alpha Secret Suite V2' },
      } as unknown as Request,
      alphaUpdate.response
    );
    assert.equal(alphaUpdate.result.statusCode, 200);

    const alphaDelete = createMockResponse(userA);
    await controller.deleteCollection(
      { params: { id: alphaCollectionId } } as unknown as Request,
      alphaDelete.response
    );
    assert.equal(alphaDelete.result.statusCode, 200);

    const alphaFinalCheck = createMockResponse(userA);
    await controller.getCollections({} as Request, alphaFinalCheck.response);
    const body = alphaFinalCheck.result.body as { collections: any[] };
    assert.equal(body.collections.length, 0);
  });
});
