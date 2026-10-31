import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import express from 'express';
import authRoutes from '../src/routes/auth.routes.js';
import { AuthService } from '../src/services/auth.service.js';

const PASSWORD = 'Hardening!Pass2026';

test('known and unknown emails get identical failure and lockout responses', () => {
  const auth = new AuthService();
  assert.equal(auth.signUp({ name: 'Real', email: 'real@example.test', password: PASSWORD }, '1.1.1.1', 'ua').success, true);
  const responses = (email: string) =>
    Array.from({ length: 6 }, () => {
      const { success, error, locked } = auth.login({ email, password: 'Wrong!Pass2026' }, '9.9.9.9', 'ua');
      return { success, error, locked };
    });
  assert.deepEqual(responses('real@example.test'), responses('ghost@example.test'));
  const [first, , , , fifth] = responses('another-ghost@example.test');
  assert.equal(first.error, 'Invalid email or password.');
  assert.equal(fifth.locked, true);
});

test('account-wide limit stops distributed guessing across many IPs', () => {
  const auth = new AuthService();
  auth.signUp({ name: 'Target', email: 'target@example.test', password: PASSWORD }, '1.1.1.1', 'ua');
  for (let i = 0; i < 20; i++) auth.login({ email: 'target@example.test', password: 'Wrong!Pass2026' }, `10.1.0.${i}`, 'ua');
  const fromFreshIp = auth.login({ email: 'target@example.test', password: PASSWORD }, '10.2.0.1', 'ua');
  assert.equal(fromFreshIp.success, false);
  assert.equal(fromFreshIp.locked, true);
});

test('successful sign-in resets that client throttle', () => {
  const auth = new AuthService();
  auth.signUp({ name: 'U', email: 'u@example.test', password: PASSWORD }, '1.1.1.1', 'ua');
  for (let i = 0; i < 4; i++) auth.login({ email: 'u@example.test', password: 'Wrong!Pass2026' }, '5.5.5.5', 'ua');
  assert.equal(auth.login({ email: 'u@example.test', password: PASSWORD }, '5.5.5.5', 'ua').success, true);
  for (let i = 0; i < 4; i++) assert.equal(auth.login({ email: 'u@example.test', password: 'Wrong!Pass2026' }, '5.5.5.5', 'ua').locked, undefined);
});

test('revoked tokens are hashed, still rejected, and pruned once expired', () => {
  const auth = new AuthService();
  const { token } = auth.signUp({ name: 'R', email: 'r@example.test', password: PASSWORD }, '1.1.1.1', 'ua');
  assert.ok(token);
  auth.logout(token);
  assert.equal(auth.verifyToken(token).valid, false);
  assert.equal(auth.revokedTokenCount(), 1);
  assert.equal(JSON.stringify([...(auth as unknown as { revokedTokens: Map<string, number> }).revokedTokens.keys()]).includes(token), false);

  // A token that has already expired is forgotten on the next prune.
  const expired = ['x', Buffer.from(JSON.stringify({ exp: Date.now() - 1000 })).toString('base64url'), 'y'].join('.');
  auth.logout(expired);
  assert.equal(auth.revokedTokenCount(), 1);
});

test('X-Forwarded-For is not trusted by default (no IP spoofing to evade throttling)', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  const server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as { port: number };
  try {
    const email = `xff-${Date.now()}@example.test`;
    const login = (spoofedIp: string) =>
      fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': spoofedIp },
        body: JSON.stringify({ email, password: 'Wrong!Pass2026' }),
      });
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await login(`203.0.113.${i}`)).status);
    assert.deepEqual(statuses, [401, 401, 401, 401, 429, 429], 'rotating X-Forwarded-For must not reset the per-client limit');
  } finally {
    server.close();
  }
});

test('per-IP login rate limit returns 429 after 30 attempts, even across different emails', async () => {
  const { authLoginRateLimiter } = await import('../src/middleware/rateLimiter.js');
  const app = express();
  app.use(express.json());
  app.use('/api/auth/login', authLoginRateLimiter);
  app.use('/api/auth', authRoutes);
  const server = createServer(app).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as { port: number };
  try {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: `spray-${i}-${Date.now()}@example.test`, password: 'Wrong!Pass2026' }),
      });
      statuses.push(res.status);
      if (i === 30) assert.match(await res.text(), /from this network/);
    }
    assert.ok(statuses.slice(0, 30).every((s) => s === 401), statuses.join(','));
    assert.equal(statuses[30], 429);
  } finally {
    server.close();
  }
});
