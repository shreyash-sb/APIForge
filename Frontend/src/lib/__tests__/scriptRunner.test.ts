import { describe, it, expect } from 'vitest';
import { executeScript } from '../scriptRunner';

describe('ScriptRunner Engine', () => {
  it('executes pre-request script and sets environment variables', () => {
    const context = {
      request: {
        method: 'POST',
        url: 'https://api.example.com/items',
        headers: {},
        queryParams: {},
        body: '',
      },
      environmentVariables: { existing: 'oldVal' },
    };

    const script = `
      apiforge.setEnvironmentVariable('timestamp', 123456);
      apiforge.environment.set('authToken', 'secret-abc');
      console.log('Pre-request done');
    `;

    const result = executeScript(script, context, 'pre-request');
    expect(result.success).toBe(true);
    expect(result.environmentUpdates.timestamp).toBe('123456');
    expect(result.environmentUpdates.authToken).toBe('secret-abc');
    expect(result.consoleLogs).toContain('Pre-request done');
  });

  it('evaluates passing post-response assertions using apiforge.test and pm.test', () => {
    const context = {
      request: { method: 'GET', url: 'https://api.example.com/items', headers: {}, queryParams: {}, body: '' },
      response: {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: { id: 42, name: 'Widget' },
        timeMs: 45,
      },
      environmentVariables: {},
    };

    const script = `
      apiforge.test('Status code is 200', () => {
        apiforge.expect(response.status).toBe(200);
      });

      pm.test('Response body contains Widget', () => {
        pm.expect(response.body.name).toBe('Widget');
        pm.expect(response.timeMs).toBeLessThan(1000);
      });
    `;

    const result = executeScript(script, context, 'post-response');
    expect(result.success).toBe(true);
    expect(result.assertions.length).toBe(2);
    expect(result.assertions[0].passed).toBe(true);
    expect(result.assertions[1].passed).toBe(true);
  });

  it('records failed assertions cleanly without throwing uncaught exceptions', () => {
    const context = {
      request: { method: 'GET', url: 'https://api.example.com/items', headers: {}, queryParams: {}, body: '' },
      response: {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        body: { error: 'Missing' },
        timeMs: 120,
      },
      environmentVariables: {},
    };

    const script = `
      apiforge.test('Should return 200', () => {
        apiforge.expect(response.status).toBe(200);
      });
    `;

    const result = executeScript(script, context, 'post-response');
    expect(result.success).toBe(true);
    expect(result.assertions.length).toBe(1);
    expect(result.assertions[0].passed).toBe(false);
    expect(result.assertions[0].error).toContain('Expected 200 but got 404');
  });

  it('handles syntax errors safely', () => {
    const context = {
      request: { method: 'GET', url: '', headers: {}, queryParams: {}, body: '' },
      environmentVariables: {},
    };

    const script = `const a = ;`; // syntax error
    const result = executeScript(script, context, 'pre-request');
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Script Execution Error');
  });
});
