import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { authService, resolveJwtSecret } from '../src/services/auth.service.js';

it('requires a strong configured JWT secret in production and uses a random development secret', () => {
  assert.throws(() => resolveJwtSecret({ NODE_ENV: 'production' }), /JWT_SECRET must be configured/);
  const strongSecret = 'production-test-secret-with-at-least-32-bytes';
  assert.strictEqual(resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: strongSecret }), strongSecret);
  assert.throws(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'short-secret' }), /at least 32 bytes/);
  const firstDevelopmentSecret = resolveJwtSecret({ NODE_ENV: 'development' });
  const secondDevelopmentSecret = resolveJwtSecret({ NODE_ENV: 'development' });
  assert.notEqual(firstDevelopmentSecret, secondDevelopmentSecret);
  assert.ok(firstDevelopmentSecret.length >= 64);
});

describe('AuthService and Account Security', () => {
  const testUserCredentials = {
    name: 'Test Engineer',
    email: 'engineer@apiforge.test',
    password: 'SecureP@ssw0rd2026!',
  };

  beforeEach(() => {
    authService.reset();
    // Register user for test isolation
    authService.signUp(testUserCredentials, '127.0.0.1', 'TestRunner/1.0');
  });

  it('allows registered user to log in successfully', () => {
    const res = authService.login(
      { email: testUserCredentials.email, password: testUserCredentials.password },
      '192.168.1.10',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    );

    assert.strictEqual(res.success, true);
    assert.ok(res.token, 'Token should be present');
    assert.strictEqual(res.user?.email, testUserCredentials.email);
    assert.strictEqual(res.user?.name, testUserCredentials.name);
    // Ensure no hash or salt is exposed
    assert.strictEqual((res.user as any).passwordHash, undefined);
    assert.strictEqual((res.user as any).salt, undefined);
  });

  it('validates password complexity rules strictly', () => {
    const tooShort = authService.validatePasswordStrength('Short1!');
    assert.strictEqual(tooShort.valid, false);
    assert.ok(tooShort.reason?.includes('at least 8 characters'));

    const noUpper = authService.validatePasswordStrength('lowercase123!');
    assert.strictEqual(noUpper.valid, false);
    assert.ok(noUpper.reason?.includes('uppercase'));

    const noLower = authService.validatePasswordStrength('UPPERCASE123!');
    assert.strictEqual(noLower.valid, false);
    assert.ok(noLower.reason?.includes('lowercase'));

    const noNumber = authService.validatePasswordStrength('NoNumbersHere!');
    assert.strictEqual(noNumber.valid, false);
    assert.ok(noNumber.reason?.includes('number'));

    const noSymbol = authService.validatePasswordStrength('NoSymbols123');
    assert.strictEqual(noSymbol.valid, false);
    assert.ok(noSymbol.reason?.includes('special character'));

    const strong = authService.validatePasswordStrength('SecureP@ssw0rd!');
    assert.strictEqual(strong.valid, true);
  });

  it('registers a new user securely and prevents duplicate email registration', () => {
    const signupRes = authService.signUp(
      {
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
        password: 'SecureP@ssw0rd2026!',
      },
      '127.0.0.1',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X)'
    );

    assert.strictEqual(signupRes.success, true);
    assert.strictEqual(signupRes.user?.email, 'jane.doe@example.com');
    assert.ok(signupRes.token);

    // Duplicate email registration rejected
    const dupRes = authService.signUp(
      {
        name: 'Jane Duplicate',
        email: 'JANE.DOE@example.com',
        password: 'DifferentP@ssw0rd1!',
      },
      '127.0.0.1',
      'Mozilla/5.0'
    );

    assert.strictEqual(dupRes.success, false);
    assert.ok(dupRes.error?.includes('already exists'));
  });

  it('does not accept a privileged role from a public signup payload', () => {
    const signupRes = authService.signUp(
      {
        name: 'Untrusted Admin',
        email: 'untrusted.admin@apiforge.test',
        password: 'SecureP@ssw0rd2026!',
        role: 'admin',
      },
      '127.0.0.1',
      'TestRunner/1.0'
    );

    assert.equal(signupRes.success, true);
    assert.equal(signupRes.user?.role, 'engineer');
  });

  it('enforces brute force lockout protection after 5 consecutive failed attempts', () => {
    const email = testUserCredentials.email;

    // 4 failed attempts: generic message that does not reveal the account or remaining attempts
    for (let i = 1; i <= 4; i++) {
      const failRes = authService.login({ email, password: 'WrongPassword1!' }, '10.0.0.1', 'Mozilla/5.0');
      assert.strictEqual(failRes.success, false);
      assert.strictEqual(failRes.error, 'Invalid email or password.');
      assert.strictEqual(failRes.locked, undefined);
    }

    // 5th failed attempt triggers a block for this client
    const lockRes = authService.login({ email, password: 'WrongPassword1!' }, '10.0.0.1', 'Mozilla/5.0');
    assert.strictEqual(lockRes.success, false);
    assert.strictEqual(lockRes.locked, true);
    assert.ok(lockRes.error?.includes('wait 15 minutes'));

    // 6th attempt even with correct password is blocked while locked
    const blockedRes = authService.login({ email, password: testUserCredentials.password }, '10.0.0.1', 'Mozilla/5.0');
    assert.strictEqual(blockedRes.success, false);
    assert.strictEqual(blockedRes.locked, true);

    // The real owner on another network is not locked out by the attacker.
    const ownerRes = authService.login({ email, password: testUserCredentials.password }, '10.0.0.99', 'Mozilla/5.0');
    assert.strictEqual(ownerRes.success, true);
  });

  it('records login activity and device audit log correctly', () => {
    authService.login(
      { email: testUserCredentials.email, password: testUserCredentials.password },
      '198.51.100.42',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0'
    );

    authService.login(
      { email: testUserCredentials.email, password: 'BadPassword!12' },
      '198.51.100.42',
      'PostmanRuntime/7.32.3'
    );

    const activities = authService.getLoginActivity();
    assert.ok(activities.length >= 2);

    const latest = activities[0];
    assert.strictEqual(latest.status, 'FAILED_PASSWORD');
    assert.strictEqual(latest.deviceType, 'API Client / CLI');
    assert.strictEqual(latest.ip, '198.51.100.42');

    const previous = activities[1];
    assert.strictEqual(previous.status, 'SUCCESS');
    assert.strictEqual(previous.deviceType, 'Desktop (Windows)');
  });

  it('revokes session token upon logout', () => {
    const loginRes = authService.login(
      { email: testUserCredentials.email, password: testUserCredentials.password },
      '127.0.0.1',
      'Mozilla/5.0'
    );

    assert.strictEqual(loginRes.success, true);
    const token = loginRes.token!;

    const verifyBefore = authService.verifyToken(token);
    assert.strictEqual(verifyBefore.valid, true);

    const logoutRes = authService.logout(token);
    assert.strictEqual(logoutRes.success, true);

    const verifyAfter = authService.verifyToken(token);
    assert.strictEqual(verifyAfter.valid, false);
    assert.ok(verifyAfter.error?.includes('revoked'));
  });

  it('allows user to change password securely with verification of old password', () => {
    const loginRes = authService.login(
      { email: testUserCredentials.email, password: testUserCredentials.password },
      '127.0.0.1',
      'Mozilla/5.0'
    );

    const userId = loginRes.user!.id;

    // Wrong old password
    const failChange = authService.changePassword(userId, {
      currentPassword: 'WrongOldPassword1!',
      newPassword: 'BrandNewPass123!',
    });
    assert.strictEqual(failChange.success, false);
    assert.ok(failChange.error?.includes('Current password is incorrect'));

    // Weak new password
    const weakChange = authService.changePassword(userId, {
      currentPassword: testUserCredentials.password,
      newPassword: 'weak',
    });
    assert.strictEqual(weakChange.success, false);

    // Successful change
    const successChange = authService.changePassword(userId, {
      currentPassword: testUserCredentials.password,
      newPassword: 'BrandNewPass123!',
    });
    assert.strictEqual(successChange.success, true);

    // Old password no longer works
    const oldLogin = authService.login({ email: testUserCredentials.email, password: testUserCredentials.password }, '127.0.0.1', 'Mozilla/5.0');
    assert.strictEqual(oldLogin.success, false);

    // New password works
    const newLogin = authService.login({ email: testUserCredentials.email, password: 'BrandNewPass123!' }, '127.0.0.1', 'Mozilla/5.0');
    assert.strictEqual(newLogin.success, true);
  });

  it('permanently deletes user account and invalidates active token', async () => {
    const loginRes = authService.login(
      { email: testUserCredentials.email, password: testUserCredentials.password },
      '127.0.0.1',
      'Mozilla/5.0'
    );
    assert.strictEqual(loginRes.success, true);
    const userId = loginRes.user!.id;
    const token = loginRes.token!;

    // Permanently delete account
    const deleteRes = await authService.deleteAccount(userId, token);
    assert.strictEqual(deleteRes.success, true);

    // Token is now invalidated
    const verifyToken = authService.verifyToken(token);
    assert.strictEqual(verifyToken.valid, false);

    // User cannot log in anymore
    const loginAfterDelete = authService.login(
      { email: testUserCredentials.email, password: testUserCredentials.password },
      '127.0.0.1',
      'Mozilla/5.0'
    );
    assert.strictEqual(loginAfterDelete.success, false);
    assert.ok(loginAfterDelete.error?.includes('Invalid email or password'));

    // User lookup returns undefined
    assert.strictEqual(authService.getUserById(userId), undefined);
  });
});
