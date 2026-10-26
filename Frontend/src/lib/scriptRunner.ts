/**
 * ScriptRunner — Pre-request & Post-response JavaScript test sandbox for APIForge.
 * Compatible with both `apiforge.*` and Postman-style `pm.*` scripting.
 */

export interface ScriptAssertionResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface ScriptExecutionContext {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    queryParams: Record<string, string>;
    body: string;
  };
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: unknown;
    timeMs: number;
  };
  environmentVariables: Record<string, string>;
}

export interface ScriptExecutionOutput {
  success: boolean;
  assertions: ScriptAssertionResult[];
  environmentUpdates: Record<string, string>;
  consoleLogs: string[];
  errorMessage?: string;
}

function createExpect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: unknown) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value but got ${String(actual)}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value but got ${String(actual)}`);
      }
    },
    toBeDefined() {
      if (typeof actual === 'undefined') {
        throw new Error('Expected value to be defined');
      }
    },
    toContain(item: unknown) {
      if (typeof actual === 'string' && typeof item === 'string') {
        if (!actual.includes(item)) {
          throw new Error(`Expected "${actual}" to contain "${item}"`);
        }
      } else if (Array.isArray(actual)) {
        if (!actual.includes(item)) {
          throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
        }
      } else {
        throw new Error(`Cannot run toContain on ${typeof actual}`);
      }
    },
    toBeGreaterThan(num: number) {
      if (typeof actual !== 'number' || actual <= num) {
        throw new Error(`Expected ${String(actual)} to be greater than ${num}`);
      }
    },
    toBeLessThan(num: number) {
      if (typeof actual !== 'number' || actual >= num) {
        throw new Error(`Expected ${String(actual)} to be less than ${num}`);
      }
    },
  };
}

export function executeScript(
  scriptCode: string,
  context: ScriptExecutionContext,
  phase: 'pre-request' | 'post-response'
): ScriptExecutionOutput {
  if (!scriptCode || !scriptCode.trim()) {
    return {
      success: true,
      assertions: [],
      environmentUpdates: {},
      consoleLogs: [],
    };
  }

  const assertions: ScriptAssertionResult[] = [];
  const environmentUpdates: Record<string, string> = {};
  const consoleLogs: string[] = [];

  const logCapturer = (...args: unknown[]) => {
    consoleLogs.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
  };

  const apiforgeScope = {
    test(name: string, fn: () => void) {
      try {
        fn();
        assertions.push({ name, passed: true });
      } catch (err) {
        assertions.push({
          name,
          passed: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    expect: createExpect,
    environment: {
      get(key: string) {
        return environmentUpdates[key] ?? context.environmentVariables[key] ?? '';
      },
      set(key: string, value: unknown) {
        environmentUpdates[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      },
    },
    variables: {
      get(key: string) {
        return environmentUpdates[key] ?? context.environmentVariables[key] ?? '';
      },
      set(key: string, value: unknown) {
        environmentUpdates[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      },
    },
    getEnvironmentVariable(key: string) {
      return environmentUpdates[key] ?? context.environmentVariables[key] ?? '';
    },
    setEnvironmentVariable(key: string, value: unknown) {
      environmentUpdates[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
    },
    request: context.request,
    response: context.response
      ? {
          status: context.response.status,
          code: context.response.status,
          statusText: context.response.statusText,
          headers: context.response.headers,
          body: context.response.body,
          timeMs: context.response.timeMs,
          responseTime: context.response.timeMs,
          json() {
            if (typeof context.response?.body === 'string') {
              try {
                return JSON.parse(context.response.body);
              } catch {
                return null;
              }
            }
            return context.response?.body;
          },
          text() {
            return typeof context.response?.body === 'string'
              ? context.response.body
              : JSON.stringify(context.response?.body);
          },
        }
      : undefined,
  };

  // Provide both apiforge and pm globals for maximum convenience
  const sandbox = {
    apiforge: apiforgeScope,
    pm: apiforgeScope,
    console: {
      log: logCapturer,
      warn: logCapturer,
      error: logCapturer,
      info: logCapturer,
    },
    response: apiforgeScope.response,
    request: apiforgeScope.request,
  };

  try {
    const wrappedCode = `"use strict";\n${scriptCode}`;
    const runner = new Function('apiforge', 'pm', 'console', 'response', 'request', wrappedCode);
    runner(sandbox.apiforge, sandbox.pm, sandbox.console, sandbox.response, sandbox.request);

    return {
      success: true,
      assertions,
      environmentUpdates,
      consoleLogs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      assertions,
      environmentUpdates,
      consoleLogs,
      errorMessage: `Script Execution Error (${phase}): ${message}`,
    };
  }
}
