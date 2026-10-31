import { describe, expect, it } from 'vitest';
import { formatJson, generateJson } from '@/lib/jsonGenerator';
describe('json generator', () => { it('formats valid JSON and reports invalid JSON', () => { expect(formatJson('{"a":{"b":1}}')).toEqual({ value: '{\n  "a": {\n    "b": 1\n  }\n}' }); expect(formatJson('{bad}')).toHaveProperty('error'); }); it('generates required nested object fields, arrays and enums', () => { const result = generateJson({ type: 'object', required: ['name', 'tags', 'state'], properties: { name: { type: 'string' }, tags: { type: 'array', items: { type: 'integer' } }, state: { type: 'string', enum: ['open', 'closed'] }, optional: { type: 'boolean' } } }); expect(result.value).toEqual({ name: '', tags: [0], state: 'open' }); }); it('reports unsupported composition and unknown types', () => { expect(generateJson({ oneOf: [{ type: 'string' }] }).unsupported).toContain('oneOf'); }); });

describe('json generator constraints', () => {
  it('produces samples that satisfy common schema constraints', () => {
    const result = generateJson({
      type: 'object',
      required: ['name', 'age', 'price', 'email', 'tags', 'code'],
      properties: {
        name: { type: 'string', constraints: { minLength: 3 } },
        age: { type: 'integer', constraints: { minimum: 18, maximum: 99 } },
        price: { type: 'number', constraints: { exclusiveMinimum: 0 } },
        email: { type: 'string', format: 'email' },
        tags: { type: 'array', items: { type: 'string' }, constraints: { minItems: 2 } },
        code: { type: 'string', format: 'uuid', constraints: { maxLength: 8 } },
      },
    });
    expect(result.value).toEqual({ name: 'xxx', age: 18, price: 0.5, email: 'user@example.com', tags: ['', ''], code: '00000000' });
  });
});
