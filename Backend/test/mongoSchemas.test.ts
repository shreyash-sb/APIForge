import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageModel, MessageSchema, SessionModel, SessionSchema } from '../src/models/chatPersistence.mongo.js';
import { UserModel, UserSchema } from '../src/models/user.mongo.js';
import { CollectionModel, CollectionSchema } from '../src/models/collection.mongo.js';

test('Mongo user schema requires account fields and has unique user/email indexes', async () => {
  const invalid = await new UserModel({}).validate().catch((error: { errors: Record<string, unknown> }) => error);
  assert.ok(invalid?.errors.id);
  assert.ok(invalid?.errors.email);
  assert.ok(invalid?.errors.passwordHash);
  assert.ok(invalid?.errors.salt);

  const indexes = UserSchema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.email === 1 && options?.unique === true));
  assert.ok(indexes.some(([keys, options]) => keys.id === 1 && options?.unique === true));
});

test('Mongo chat schemas enforce required identifiers and allowed message roles', async () => {
  const invalidSession = await new SessionModel({}).validate().catch((error: { errors: Record<string, unknown> }) => error);
  assert.ok(invalidSession?.errors.sessionId);
  assert.ok(invalidSession?.errors.userId);

  const invalidMessage = await new MessageModel({ sessionId: 'qa-session', role: 'attacker', content: 'synthetic' })
    .validate()
    .catch((error: { errors: Record<string, unknown> }) => error);
  assert.ok(invalidMessage?.errors.role);

  assert.ok(SessionSchema.indexes().some(([keys]) => keys.sessionId === 1));
  assert.ok(MessageSchema.indexes().some(([keys]) => keys.sessionId === 1 && keys.createdAt === 1));
});

test('Mongo collection schema requires id, userId, name, and has user-scoped indexes', async () => {
  const invalid = await new CollectionModel({}).validate().catch((error: { errors: Record<string, unknown> }) => error);
  assert.ok(invalid?.errors.id);
  assert.ok(invalid?.errors.userId);
  assert.ok(invalid?.errors.name);

  const indexes = CollectionSchema.indexes();
  assert.ok(indexes.some(([keys]) => keys.userId === 1 && keys.id === 1));
});
