import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { LoginActivityModel, UserModel } from '../src/models/user.mongo.js';
import { AuthService } from '../src/services/auth.service.js';

const testMongoUri = process.env.APIFORGE_TEST_MONGO_URI;

async function waitForDocument<T>(lookup: () => Promise<T | null>, description: string): Promise<T> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const document = await lookup();
    if (document) return document;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${description} in isolated MongoDB.`);
}

test('Mongo-backed auth persists, hydrates, updates, and deletes isolated test records', async (t) => {
  if (!testMongoUri) {
    t.skip('Set APIFORGE_TEST_MONGO_URI to a disposable apiforge_qa_test_* database URI.');
    return;
  }

  const target = new URL(testMongoUri);
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(target.hostname), 'test database must be loopback-only');
  assert.match(target.pathname, /^\/apiforge_qa_test_[a-z0-9_-]+$/i, 'database name must use the isolated test prefix');

  await mongoose.connect(testMongoUri);
  const service = new AuthService();
  const email = `mongo-${crypto.randomUUID()}@apiforge.test`;
  let userId: string | undefined;
  try {
    const signup = service.signUp(
      { name: 'Mongo QA', email, password: 'SecureP@ssw0rd2026!' },
      '127.0.0.1',
      'BackendIntegrationTest/1.0'
    );
    assert.equal(signup.success, true);
    userId = signup.user?.id;
    assert.ok(userId);

    await waitForDocument(() => UserModel.findOne({ id: userId }), 'new user');
    await waitForDocument(() => LoginActivityModel.findOne({ userId, status: 'SUCCESS' }), 'signup activity');

    const hydrated = new AuthService();
    await hydrated.hydrateFromMongo();
    const login = hydrated.login({ email, password: 'SecureP@ssw0rd2026!' }, '127.0.0.1', 'BackendIntegrationTest/1.0');
    assert.equal(login.success, true);

    const priorHash = (await UserModel.findOne({ id: userId }).orFail()).passwordHash;
    const updated = service.changePassword(userId, {
      currentPassword: 'SecureP@ssw0rd2026!',
      newPassword: 'ChangedP@ssw0rd2026!',
    });
    assert.equal(updated.success, true);
    let stored = await UserModel.findOne({ id: userId }).orFail();
    for (let attempt = 0; attempt < 20 && stored.passwordHash === priorHash; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      stored = await UserModel.findOne({ id: userId }).orFail();
    }
    assert.notEqual(stored.passwordHash, priorHash);

    const deleted = await service.deleteAccount(userId, signup.token);
    assert.equal(deleted.success, true);
    assert.equal(await UserModel.findOne({ id: userId }), null);
    assert.equal(await LoginActivityModel.countDocuments({ userId }), 0);
  } finally {
    if (userId) {
      await Promise.all([
        UserModel.deleteOne({ id: userId }),
        LoginActivityModel.deleteMany({ userId }),
      ]);
    }
    await UserModel.deleteMany({ email });
    await LoginActivityModel.deleteMany({ userEmail: email });
    service.reset();
    await mongoose.disconnect();
  }
});
