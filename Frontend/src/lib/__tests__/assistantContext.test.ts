import { describe, expect, it } from 'vitest';
import { buildAssistantContext, summarizeSchema } from '@/lib/assistantContext';
import { mockExecutionResult, mockSpecification, mockTestCase, mockValidationResult } from '@/test/fixtures';
import type { RequestDraft } from '@/types/request.types';
import type { ApiSpecification } from '@/types/openapi.types';

const base = {
  specification: mockSpecification,
  tests: [mockTestCase],
  executionResults: { [mockTestCase.id]: { ...mockExecutionResult, response: { ...mockExecutionResult.response!, status: 404, body: { error: 'missing', token: 'leak-me' } } } },
  validationResults: { [mockTestCase.id]: mockValidationResult },
  diagnosisResults: {},
};

describe('buildAssistantContext', () => {
  it('selects only the endpoint and test relevant to the question', () => {
    const context = buildAssistantContext({ ...base, question: 'Why did GET /users/usr_999 return 404?' });
    expect(context?.endpoints?.map((e) => `${e.method} ${e.path}`)).toEqual(['GET /users/{id}']);
    expect(context?.tests?.map((t) => t.testCaseId)).toEqual([mockTestCase.id]);
    expect(context?.tests?.[0].execution?.httpStatus).toBe(404);
    expect(context?.selection?.matchedBy).toBe('question');
    expect(JSON.stringify(context)).not.toContain('leak-me');
    // The full spec is not sent: only labels of other endpoints.
    expect(context?.endpointIndex).toContain('POST /users');
  });

  it('does not guess a target for ambiguous questions', () => {
    const context = buildAssistantContext({ ...base, question: 'Why did this test fail?' });
    expect(context?.tests).toEqual([]);
    expect(context?.endpoints).toEqual([]);
    expect(context?.selection?.matchedBy).toBe('none');
  });

  it('honours an explicit focus test', () => {
    const context = buildAssistantContext({ ...base, question: 'Why did this test fail?', focusTestId: mockTestCase.id });
    expect(context?.selection).toMatchObject({ matchedBy: 'focus', focusTestId: mockTestCase.id });
    expect(context?.tests).toHaveLength(1);
  });

  it('caps endpoints and marks the selection truncated for large specs', () => {
    const endpoints = Array.from({ length: 150 }, (_, i) => ({ ...mockSpecification.endpoints[0], id: `e${i}`, path: `/items${i}`, summary: 'inventory items' }));
    const specification: ApiSpecification = { ...mockSpecification, endpoints };
    const context = buildAssistantContext({ ...base, specification, tests: [], question: 'How do inventory items work?' });
    expect(context?.endpoints?.length).toBeLessThanOrEqual(3);
    expect(context?.endpointIndex).toHaveLength(100);
    expect(context?.selection?.clientTruncated).toBe(true);
  });

  it('strips credentials from the request builder draft', () => {
    const requestDraft: RequestDraft = {
      method: 'POST',
      url: 'https://admin:pa55@api.example.test/users?api_key=abc123&page=1',
      queryParams: [{ id: 'q', key: 'access_token', value: 'tok-1', enabled: true }],
      headers: [
        { id: 'h1', key: 'Authorization', value: 'Bearer zzz', enabled: true },
        { id: 'h2', key: 'Accept', value: 'application/json', enabled: true },
      ],
      body: JSON.stringify({ name: 'x', password: 'hunter2' }),
      auth: { type: 'bearer', token: 'zzz' },
    } as RequestDraft;
    const context = buildAssistantContext({ ...base, requestDraft, question: 'What is wrong with my request body?' });
    const serialized = JSON.stringify(context?.request);
    for (const secret of ['pa55', 'abc123', 'tok-1', 'zzz', 'hunter2']) expect(serialized).not.toContain(secret);
    expect(context?.request?.headers).toContainEqual({ key: 'Accept', value: 'application/json' });
    expect(context?.request?.authType).toBe('bearer');
  });

  it('summarizes schemas compactly', () => {
    expect(summarizeSchema({ type: 'object', required: ['id'], properties: { id: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } })).toBe(
      'object{id*:string,tags:array<string>}'
    );
  });
});

describe('buildAssistantContext method targeting', () => {
  it('a named method excludes same-path records with other methods', () => {
    const postTest = { ...mockTestCase, id: 'tc-post', name: 'Create user', endpoint: { method: 'POST' as const, path: '/users' } };
    const getTest = { ...mockTestCase, id: 'tc-get', name: 'List users', endpoint: { method: 'GET' as const, path: '/users' } };
    const failing = (id: string) => ({ ...mockExecutionResult, testCaseId: id, executionId: `e-${id}`, status: 'FAILED_EXECUTION' as const });
    const context = buildAssistantContext({
      ...base,
      tests: [postTest, getTest],
      executionResults: { 'tc-post': failing('tc-post'), 'tc-get': failing('tc-get') },
      validationResults: {},
      question: 'Why did GET /users fail?',
    });
    expect(context?.tests?.map((t) => t.testCaseId)).toEqual(['tc-get']);
    expect(context?.endpoints?.every((e) => e.method === 'GET')).toBe(true);
    expect(context?.selection?.clientTruncated).toBe(false);
  });
});
