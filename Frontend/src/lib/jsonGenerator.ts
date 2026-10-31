import type { ApiSchema, JsonValue } from '@/types/openapi.types';
export type GenerationResult = { value?: JsonValue; unsupported: string[] };
export function formatJson(input: string) { try { return { value: JSON.stringify(JSON.parse(input), null, 2) }; } catch (error) { return { error: error instanceof Error ? error.message : 'Invalid JSON' }; } }
const constraint = (schema: ApiSchema, key: string): number | undefined => {
  const value = schema.constraints?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

/** Smallest valid number for the schema's bounds (0 when unconstrained). */
function numberSample(schema: ApiSchema, integer: boolean): number {
  const step = integer ? 1 : 0.5;
  const exclusiveMin = schema.constraints?.exclusiveMinimum;
  let value = constraint(schema, 'minimum') ?? (typeof exclusiveMin === 'number' ? exclusiveMin + step : 0);
  if (exclusiveMin === true) value += step;
  const max = constraint(schema, 'maximum');
  if (max !== undefined && value > max) value = max;
  return integer ? Math.ceil(value) : value;
}

/** Format-aware sample that satisfies minLength/maxLength; '' when unconstrained. */
function stringSample(schema: ApiSchema): string {
  const formatted: Record<string, string> = {
    'date-time': '1970-01-01T00:00:00.000Z',
    date: '1970-01-01',
    email: 'user@example.com',
    uuid: '00000000-0000-4000-8000-000000000000',
    uri: 'https://example.com',
    url: 'https://example.com',
    hostname: 'example.com',
    ipv4: '127.0.0.1',
  };
  let value = (schema.format && formatted[schema.format]) || '';
  const minLength = constraint(schema, 'minLength');
  const maxLength = constraint(schema, 'maxLength');
  if (minLength !== undefined && value.length < minLength) value = value.padEnd(minLength, 'x');
  if (maxLength !== undefined && value.length > maxLength) value = value.slice(0, maxLength);
  return value;
}

export function generateJson(schema?: ApiSchema, depth = 0): GenerationResult {
  if (!schema) return { unsupported: ['No schema selected.'] }; if (depth > 8) return { unsupported: ['Schema nesting exceeds the supported depth of 8.'] };
  if (schema.example !== undefined) return { value: schema.example, unsupported: [] }; if (schema.default !== undefined) return { value: schema.default, unsupported: [] }; if (schema.enum?.length) return { value: schema.enum[0], unsupported: [] };
  const unsupported = [...(schema.oneOf?.length ? ['oneOf'] : []), ...(schema.anyOf?.length ? ['anyOf'] : []), ...(schema.allOf?.length ? ['allOf'] : [])];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === 'object' || schema.properties) { const value: Record<string, JsonValue> = {}; for (const [name, child] of Object.entries(schema.properties ?? {})) { const generated = generateJson(child, depth + 1); unsupported.push(...generated.unsupported); if (generated.value !== undefined && (schema.required?.includes(name) || child.example !== undefined || child.default !== undefined)) value[name] = generated.value; } return { value, unsupported }; }
  if (type === 'array') { const generated = generateJson(schema.items, depth + 1); const count = generated.value === undefined ? 0 : Math.max(1, Math.min(constraint(schema, 'minItems') ?? 1, 10)); return { value: Array.from({ length: count }, () => generated.value as JsonValue), unsupported: [...unsupported, ...generated.unsupported] }; }
  if (type === 'integer' || type === 'number') return { value: numberSample(schema, type === 'integer'), unsupported }; if (type === 'boolean') return { value: false, unsupported }; if (type === 'string') return { value: stringSample(schema), unsupported };
  return { unsupported: [...unsupported, `Unsupported or unspecified schema type: ${type ?? 'unknown'}.`] };
}

/**
 * Documentation-style preview: includes every documented property (not only required
 * ones) with constraint-aware leaf values. Used by the OpenAPI explorer and docs pages.
 */
export function schemaPreview(schema?: ApiSchema, depth = 0): JsonValue | undefined {
  if (!schema || depth > 4) return schema?.example ?? schema?.default;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.properties) {
    return Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, schemaPreview(value, depth + 1) ?? '']));
  }
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === 'array') return [schemaPreview(schema.items, depth + 1) ?? ''];
  if (type === 'integer' || type === 'number') return numberSample(schema, type === 'integer');
  if (type === 'boolean') return false;
  return type === 'string' ? stringSample(schema) : undefined;
}
