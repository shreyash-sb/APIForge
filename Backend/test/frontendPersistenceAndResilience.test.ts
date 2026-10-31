import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeEnvironments,
  sanitizeRequestDraft,
  sanitizeWorkflows,
  sanitizeExecutionResults,
  safePersistStorage,
  defaultEnvironments,
  defaultWorkflows,
  useAppStore,
} from '../../Frontend/src/store/useAppStore.ts';
import {
  formatApiErrorMessage,
  sanitizeErrorMessage,
  TestExecutionApiError,
  TestGeneratorApiError,
} from '../../Frontend/src/services/apiError.ts';
import type { FrontendEnvironmentProfile } from '../../Frontend/src/types/environment.types.ts';
import type { RequestDraft } from '../../Frontend/src/store/useAppStore.ts';
import type { WorkflowScenario } from '../../Frontend/src/types/workflow.types.ts';
import type { TestCaseExecutionResult } from '../../Frontend/src/types/testExecution.types.ts';

describe('Phase 12 — Task 1: Frontend State Persistence and Error Resilience', () => {
  describe('Zustand State Persistence — Allowlist & Exclusions', () => {
    it('1. Secret values are excluded from persisted environments (isSecret: true)', () => {
      const sampleEnvironments: FrontendEnvironmentProfile[] = [
        {
          id: 'env-prod-test',
          name: 'Production Test',
          description: 'Testing environment persistence',
          baseUrl: 'https://api.test.com',
          createdAt: new Date().toISOString(),
          variables: [
            { name: 'apiKey', value: 'super-secret-api-key-999', isSecret: true, enabled: true },
            { name: 'apiVersion', value: 'v2', isSecret: false, enabled: true },
            { name: 'jwtToken', value: 'secret-bearer-jwt', isSecret: true, enabled: true },
          ],
        },
      ];

      const sanitized = sanitizeEnvironments(sampleEnvironments);

      assert.equal(sanitized.length, 1);
      const vars = sanitized[0]!.variables;
      assert.equal(vars[0]!.name, 'apiKey');
      assert.equal(vars[0]!.value, '', 'Secret apiKey must be blanked in persisted snapshot');
      assert.equal(vars[0]!.isSecret, true);

      assert.equal(vars[1]!.name, 'apiVersion');
      assert.equal(vars[1]!.value, 'v2', 'Non-secret variable must be preserved');
      assert.equal(vars[1]!.isSecret, false);

      assert.equal(vars[2]!.name, 'jwtToken');
      assert.equal(vars[2]!.value, '', 'Secret jwtToken must be blanked');
    });

    it('2. Sensitive credentials and authorization headers are excluded from request draft persistence', () => {
      const draftWithBearer: RequestDraft = {
        method: 'POST',
        url: 'https://api.example.com/login',
        queryParams: [],
        headers: [
          { id: 'h1', key: 'Authorization', value: 'Bearer super-sensitive-jwt', enabled: true },
          { id: 'h2', key: 'Content-Type', value: 'application/json', enabled: true },
          { id: 'h3', key: 'X-Api-Key', value: 'api-key-xyz', enabled: true },
          { id: 'h4', key: 'Cookie', value: 'session_id=12345', enabled: true },
        ],
        body: '{"foo":"bar"}',
        auth: { type: 'bearer', token: 'token-secret-123' },
      };

      const sanitized = sanitizeRequestDraft(draftWithBearer);
      assert.ok(sanitized);

      // Auth token must be wiped
      assert.equal(sanitized.auth.type, 'bearer');
      assert.equal((sanitized.auth as { token: string }).token, '', 'Bearer token must be empty');

      // Sensitive headers must have their values wiped
      const authHeader = sanitized.headers.find((h) => h.key === 'Authorization');
      assert.equal(authHeader?.value, '', 'Authorization header must be blank');

      const apiKeyHeader = sanitized.headers.find((h) => h.key === 'X-Api-Key');
      assert.equal(apiKeyHeader?.value, '', 'X-Api-Key header must be blank');

      const cookieHeader = sanitized.headers.find((h) => h.key === 'Cookie');
      assert.equal(cookieHeader?.value, '', 'Cookie header must be blank');

      const ctHeader = sanitized.headers.find((h) => h.key === 'Content-Type');
      assert.equal(ctHeader?.value, 'application/json', 'Safe headers must be preserved');

      // Test basic auth password wipe
      const draftWithBasic: RequestDraft = {
        method: 'GET',
        url: 'https://api.example.com',
        queryParams: [],
        headers: [],
        body: '',
        auth: { type: 'basic', username: 'admin', password: 'secretpassword123' },
      };
      const sanitizedBasic = sanitizeRequestDraft(draftWithBasic);
      assert.ok(sanitizedBasic);
      assert.equal(sanitizedBasic.auth.type, 'basic');
      assert.equal((sanitizedBasic.auth as { password: string }).password, '', 'Password must be empty');
      assert.equal((sanitizedBasic.auth as { username: string }).username, 'admin', 'Username preserved');
    });

    it('3. Workflow definitions sanitize step credentials and sensitive headers before persistence', () => {
      const workflows: WorkflowScenario[] = [
        {
          id: 'wf-test',
          name: 'Test Workflow',
          description: 'Workflow with credentials',
          steps: [
            {
              id: 'step-1',
              name: 'Authenticated Step',
              enabled: true,
              request: {
                method: 'GET',
                url: 'https://api.example.com/data',
                headers: [
                  { id: 'h1', key: 'Authorization', value: 'Bearer secret-wf-token', enabled: true },
                  { id: 'h2', key: 'Accept', value: 'application/json', enabled: true },
                ],
                queryParams: [],
                body: '',
                auth: { type: 'bearer', token: 'raw-token' },
              },
              extractors: [
                {
                  targetVariable: 'secretVal',
                  source: 'BODY_JSONPATH',
                  path: '$.secret',
                  defaultValue: 'sensitive-default-val',
                  isSecret: true,
                },
                {
                  targetVariable: 'publicVal',
                  source: 'BODY_JSONPATH',
                  path: '$.id',
                  defaultValue: '100',
                  isSecret: false,
                },
              ],
            },
          ],
        },
      ];

      const sanitized = sanitizeWorkflows(workflows);
      assert.equal(sanitized.length, 1);
      const step = sanitized[0]!.steps[0]!;

      assert.equal(step.request.auth.type, 'bearer');
      assert.equal((step.request.auth as { token: string }).token, '');

      const authHeader = step.request.headers?.find((h) => h.key === 'Authorization');
      assert.equal(authHeader?.value, '');

      const acceptHeader = step.request.headers?.find((h) => h.key === 'Accept');
      assert.equal(acceptHeader?.value, 'application/json');

      const secretExt = step.extractors?.find((e) => e.targetVariable === 'secretVal');
      assert.equal(secretExt?.defaultValue, '', 'Secret extractor defaultValue must be stripped');

      const publicExt = step.extractors?.find((e) => e.targetVariable === 'publicVal');
      assert.equal(publicExt?.defaultValue, '100', 'Public extractor defaultValue preserved');
    });

    it('4. Execution results redact sensitive request headers and enforce size retention boundaries', () => {
      const executionResults: Record<string, TestCaseExecutionResult> = {
        'tc-1': {
          testCaseId: 'tc-1',
          executionId: 'exec-1',
          status: 'PASSED',
          durationMs: 45,
          timestamp: new Date().toISOString(),
          request: {
            method: 'GET',
            url: 'https://api.example.com/users',
            headers: [
              { key: 'Authorization', value: 'Bearer my-top-secret-token', enabled: true },
              { key: 'Accept', value: 'application/json', enabled: true },
            ],
            body: null,
          },
          response: {
            status: 200,
            statusText: 'OK',
            durationMs: 45,
            headers: [{ key: 'content-type', value: 'application/json' }],
            body: JSON.stringify({ ok: true }),
            sizeBytes: 12,
          },
        },
        'tc-huge': {
          testCaseId: 'tc-huge',
          executionId: 'exec-huge',
          status: 'PASSED',
          durationMs: 120,
          timestamp: new Date().toISOString(),
          request: {
            method: 'GET',
            url: 'https://api.example.com/big-data',
            headers: [],
            body: null,
          },
          response: {
            status: 200,
            statusText: 'OK',
            durationMs: 120,
            headers: [],
            body: 'A'.repeat(50000), // Huge 50KB payload
            sizeBytes: 50000,
          },
        },
      };

      const sanitized = sanitizeExecutionResults(executionResults);

      // Sensitive Authorization header must be replaced with [REDACTED]
      const authHeader = sanitized['tc-1']!.request.headers?.find((h) => h.key === 'Authorization');
      assert.equal(authHeader?.value, '[REDACTED]');

      const acceptHeader = sanitized['tc-1']!.request.headers?.find((h) => h.key === 'Accept');
      assert.equal(acceptHeader?.value, 'application/json');

      // Huge response body must be truncated
      const hugeBody = sanitized['tc-huge']!.response?.body as string;
      assert.ok(hugeBody.length < 2000, 'Huge body must be truncated to avoid storage exhaustion');
      assert.ok(hugeBody.includes('[Truncated for local storage boundary]'));
    });
  });

  describe('Storage Resilience & Recovery', () => {
    it('5. Corrupted persisted state in localStorage does not crash storage reader', () => {
      // Create a mock corrupt storage scenario
      const fakeStorage: Record<string, string> = {
        'apiforge-workspace': '{ corrupted: json: [unclosed',
      };

      const mockWindow = {
        localStorage: {
          getItem: (key: string) => fakeStorage[key] ?? null,
          setItem: (key: string, val: string) => {
            fakeStorage[key] = val;
          },
          removeItem: (key: string) => {
            delete fakeStorage[key];
          },
        },
      };

      // Temporarily mock global window
      const originalWindow = (globalThis as unknown as { window?: unknown }).window;
      (globalThis as unknown as { window: unknown }).window = mockWindow;

      try {
        const result = safePersistStorage.getItem('apiforge-workspace');
        // Must return null instead of throwing an unhandled JSON parse error
        assert.equal(result, null);
        // Must have cleaned up the corrupted key to avoid repeated corruption loops
        assert.equal(fakeStorage['apiforge-workspace'], undefined);
      } finally {
        (globalThis as unknown as { window?: unknown }).window = originalWindow;
      }
    });

    it('6. Unavailable localStorage (security exception or disabled) is handled gracefully', () => {
      const mockDisabledStorage = {
        localStorage: {
          getItem: () => {
            throw new Error('SecurityError: The operation is insecure.');
          },
          setItem: () => {
            throw new Error('QuotaExceededError');
          },
          removeItem: () => {
            throw new Error('SecurityError');
          },
        },
      };

      const originalWindow = (globalThis as unknown as { window?: unknown }).window;
      (globalThis as unknown as { window: unknown }).window = mockDisabledStorage;

      try {
        // None of these operations should throw
        assert.doesNotThrow(() => {
          const item = safePersistStorage.getItem('apiforge-workspace');
          assert.equal(item, null);
        });

        assert.doesNotThrow(() => {
          safePersistStorage.setItem('apiforge-workspace', { state: {}, version: 1 });
        });

        assert.doesNotThrow(() => {
          safePersistStorage.removeItem('apiforge-workspace');
        });
      } finally {
        (globalThis as unknown as { window?: unknown }).window = originalWindow;
      }
    });

    it('7. Reset workspace removes persisted state and restores defaults', () => {
      const storageMap: Record<string, string> = {
        'apiforge-workspace': JSON.stringify({
          state: {
            generatedTests: [{ id: 'tc-old', name: 'Old Test' }],
          },
          version: 1,
        }),
      };

      const mockWindow = {
        localStorage: {
          getItem: (key: string) => storageMap[key] ?? null,
          setItem: (key: string, val: string) => {
            storageMap[key] = val;
          },
          removeItem: (key: string) => {
            delete storageMap[key];
          },
        },
      };

      const originalWindow = (globalThis as unknown as { window?: unknown }).window;
      (globalThis as unknown as { window: unknown }).window = mockWindow;

      try {
        // Execute resetWorkspace
        useAppStore.getState().resetWorkspace();

        const state = useAppStore.getState();
        const storedJson = storageMap['apiforge-workspace'];
        const parsedStored = storedJson ? JSON.parse(storedJson) : null;

        // Persisted storage must not contain old test data
        assert.equal(parsedStored?.state?.generatedTests?.length ?? 0, 0, 'Old tests must be removed from storage');
        assert.equal(parsedStored?.state?.activeSpecification, undefined, 'Active specification must be cleared');
        assert.equal(state.generatedTests.length, 0, 'Generated tests in store must be reset');
        assert.deepEqual(state.executionResults, {}, 'Execution results must be reset');
        assert.deepEqual(state.validationResults, {}, 'Validation results must be reset');
        assert.equal(state.activeSpecification, undefined, 'Active specification must be cleared');
        assert.equal(state.environments.length, defaultEnvironments.length);
        assert.equal(state.workflows.length, defaultWorkflows.length);
      } finally {
        (globalThis as unknown as { window?: unknown }).window = originalWindow;
      }
    });
  });

  describe('Network Error and Loading-State Resilience', () => {
    it('8. sanitizeErrorMessage strips tokens, passwords, and keys from error messages', () => {
      const rawMsg1 = 'Connection failed with bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz.abc';
      const clean1 = sanitizeErrorMessage(rawMsg1);
      assert.ok(!clean1.includes('eyJhbGciOiJIUzI1NiIs'));
      assert.ok(clean1.includes('bearer [REDACTED]'));

      const rawMsg2 = 'Failed request: token=secret-token-123 and password=mySecretPassword!';
      const clean2 = sanitizeErrorMessage(rawMsg2);
      assert.ok(!clean2.includes('secret-token-123'));
      assert.ok(!clean2.includes('mySecretPassword!'));
      assert.ok(clean2.includes('token=[REDACTED]'));
      assert.ok(clean2.includes('password=[REDACTED]'));
    });

    it('9. formatApiErrorMessage provides actionable messages for network, timeout, and HTTP errors', () => {
      // Network error
      const networkError = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK', isAxiosError: true });
      const networkMsg = formatApiErrorMessage(networkError, 'Fallback message');
      assert.ok(
        networkMsg.includes('Unable to reach backend service') ||
          networkMsg.includes('http://localhost:3001')
      );

      // Timeout error
      const timeoutError = Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED', isAxiosError: true });
      const timeoutMsg = formatApiErrorMessage(timeoutError, 'Fallback message');
      assert.ok(timeoutMsg.includes('timed out'));

      // Backend 400 Bad Request
      const badReqError = Object.assign(new Error('Bad request'), {
        code: 'ERR_BAD_REQUEST',
        isAxiosError: true,
        response: {
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          config: {} as never,
          data: { error: { message: 'OpenAPI specification contains invalid YAML syntax.' } },
        },
      });
      const badReqMsg = formatApiErrorMessage(badReqError, 'Fallback message');
      assert.equal(badReqMsg, 'OpenAPI specification contains invalid YAML syntax.');

      // Backend 500 without structured payload
      const server500Error = Object.assign(new Error('Internal Server Error'), {
        code: 'ERR_BAD_RESPONSE',
        isAxiosError: true,
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          headers: {},
          config: {} as never,
          data: {},
        },
      });
      const serverMsg = formatApiErrorMessage(server500Error, 'Fallback message');
      assert.ok(serverMsg.includes('HTTP 500'));

      // Backend 503 Service Unavailable
      const server503Error = Object.assign(new Error('Service Unavailable'), {
        code: 'ERR_BAD_RESPONSE',
        isAxiosError: true,
        response: {
          status: 503,
          statusText: 'Service Unavailable',
          headers: {},
          config: {} as never,
          data: {},
        },
      });
      const server503Msg = formatApiErrorMessage(server503Error, 'Fallback message');
      assert.ok(server503Msg.includes('HTTP 503'));
    });

    it('10. Typed error classes wrap messages with sanitized details and status codes', () => {
      const execError = new TestExecutionApiError(
        'Execution failed: token=12345 leaked',
        500,
        { detail: 'Internal failure' }
      );
      assert.equal(execError.name, 'TestExecutionApiError');
      assert.equal(execError.statusCode, 500);
      assert.ok(!execError.message.includes('12345'));
      assert.ok(execError.message.includes('token=[REDACTED]'));

      const genError = new TestGeneratorApiError('Generation failed for apiKey=secret123', 400);
      assert.equal(genError.name, 'TestGeneratorApiError');
      assert.equal(genError.statusCode, 400);
      assert.ok(!genError.message.includes('secret123'));
      assert.ok(genError.message.includes('apiKey=[REDACTED]'));
    });

    it('11. Storage version migration recovers safely from outdated (version < 1) or corrupt data', () => {
      // Find the migrate function in persist options
      const persistOptions = (useAppStore as unknown as { persist: { getOptions: () => { migrate?: (state: unknown, ver: number) => unknown } } }).persist?.getOptions();
      assert.ok(persistOptions?.migrate, 'Store must provide migrate function');

      // Test with outdated version 0
      const migrated = persistOptions.migrate({ someOldKey: 'abc' }, 0) as Record<string, unknown>;
      assert.ok(migrated.environments);
      assert.ok(migrated.workflows);
      assert.deepEqual(migrated.generatedTests, []);
      assert.deepEqual(migrated.executionResults, {});

      // Test with null or non-object payload
      const migratedNull = persistOptions.migrate(null, 1) as Record<string, unknown>;
      assert.ok(migratedNull.environments);
      assert.ok(migratedNull.workflows);
    });

    it('12. TestGeneratorService network failure throws typed TestGeneratorApiError with actionable message', async () => {
      const originalUrl = process.env.VITE_API_BASE_URL;
      process.env.VITE_API_BASE_URL = 'http://127.0.0.1:59999';
      try {
        const { testGeneratorService } = await import('../../Frontend/src/services/testGeneratorService.ts');
        await assert.rejects(
          async () => {
            await testGeneratorService.generate({
              specification: {
                version: '3.0.0',
                metadata: { title: 'Test', version: '1.0' },
                servers: [],
                endpoints: [],
                schemas: {},
                securitySchemes: {},
              },
            });
          },
          (err: unknown) => {
            assert.ok(err instanceof TestGeneratorApiError, 'Must throw TestGeneratorApiError');
            assert.ok(
              err.message.includes('Unable to reach backend service') ||
                err.message.includes('APIForge backend')
            );
            return true;
          }
        );
      } finally {
        process.env.VITE_API_BASE_URL = originalUrl;
      }
    });

    it('13. TestExecutionService batch and single execution throw TestExecutionApiError on network failure', async () => {
      const originalUrl = process.env.VITE_API_BASE_URL;
      process.env.VITE_API_BASE_URL = 'http://127.0.0.1:59999';
      const sampleTest = {
        id: 'tc-dummy',
        name: 'Dummy Test',
        type: 'POSITIVE' as const,
        priority: 'P1' as const,
        enabled: true,
        endpoint: { path: '/test', method: 'GET' },
        request: { method: 'GET' as const, url: 'http://localhost:3000/test', queryParams: [], headers: [], body: null, auth: { type: 'none' as const } },
        expectations: { statusCode: 200 },
      };

      try {
        const { testExecutionService } = await import('../../Frontend/src/services/testExecutionService.ts');
        await assert.rejects(
          async () => {
            await testExecutionService.executeSingle(sampleTest);
          },
          (err: unknown) => {
            assert.ok(err instanceof TestExecutionApiError, 'executeSingle must throw TestExecutionApiError');
            assert.ok(err.message.includes('Unable to reach backend service'));
            return true;
          }
        );

        await assert.rejects(
          async () => {
            await testExecutionService.executeBatch([sampleTest]);
          },
          (err: unknown) => {
            assert.ok(err instanceof TestExecutionApiError, 'executeBatch must throw TestExecutionApiError');
            assert.ok(err.message.includes('Unable to reach backend service'));
            return true;
          }
        );
      } finally {
        process.env.VITE_API_BASE_URL = originalUrl;
      }
    });

    it('14. OpenApiService importSpecification returns typed failure instead of crashing or throwing when backend is down', async () => {
      const originalUrl = process.env.VITE_API_BASE_URL;
      process.env.VITE_API_BASE_URL = 'http://127.0.0.1:59999';
      try {
        const { openApiService } = await import('../../Frontend/src/services/openapiService.ts');
        const result = await openApiService.importSpecification('spec.json', '{"openapi":"3.0.0"}');
        assert.equal(result.success, false);
        assert.ok(result.error);
        assert.ok(
          result.error.message.includes('Could not reach') ||
            result.error.message.includes('Unable to reach')
        );
      } finally {
        process.env.VITE_API_BASE_URL = originalUrl;
      }
    });

    it('15. MockServerService operations throw MockServerApiError with clear message on failure', async () => {
      const originalUrl = process.env.VITE_API_BASE_URL;
      process.env.VITE_API_BASE_URL = 'http://127.0.0.1:59999';
      try {
        const { mockServerService, MockServerApiError } = await import('../../Frontend/src/services/mockServerService.ts');
        await assert.rejects(
          async () => {
            await mockServerService.getRoutes();
          },
          (err: unknown) => {
            assert.ok(err instanceof MockServerApiError, 'getRoutes must throw MockServerApiError');
            assert.ok(err.message.includes('Unable to reach backend service'));
            return true;
          }
        );
      } finally {
        process.env.VITE_API_BASE_URL = originalUrl;
      }
    });
  });
});
