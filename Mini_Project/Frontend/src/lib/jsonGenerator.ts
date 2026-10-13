import type { ApiSchema, JsonValue } from '@/types/openapi.types';
export type GenerationResult = { value?: JsonValue; unsupported: string[] };
export function formatJson(input: string) { try { return { value: JSON.stringify(JSON.parse(input), null, 2) }; } catch (error) { return { error: error instanceof Error ? error.message : 'Invalid JSON' }; } }
export function generateJson(schema?: ApiSchema, depth = 0): GenerationResult {
  if (!schema) return { unsupported: ['No schema selected.'] }; if (depth > 8) return { unsupported: ['Schema nesting exceeds the supported depth of 8.'] };
  if (schema.example !== undefined) return { value: schema.example, unsupported: [] }; if (schema.default !== undefined) return { value: schema.default, unsupported: [] }; if (schema.enum?.length) return { value: schema.enum[0], unsupported: [] };
  const unsupported = [...(schema.oneOf?.length ? ['oneOf'] : []), ...(schema.anyOf?.length ? ['anyOf'] : []), ...(schema.allOf?.length ? ['allOf'] : [])];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === 'object' || schema.properties) { const value: Record<string, JsonValue> = {}; for (const [name, child] of Object.entries(schema.properties ?? {})) { const generated = generateJson(child, depth + 1); unsupported.push(...generated.unsupported); if (generated.value !== undefined && (schema.required?.includes(name) || child.example !== undefined || child.default !== undefined)) value[name] = generated.value; } return { value, unsupported }; }
  if (type === 'array') { const generated = generateJson(schema.items, depth + 1); return { value: generated.value === undefined ? [] : [generated.value], unsupported: [...unsupported, ...generated.unsupported] }; }
  if (type === 'integer') return { value: 0, unsupported }; if (type === 'number') return { value: 0, unsupported }; if (type === 'boolean') return { value: false, unsupported }; if (type === 'string') return { value: schema.format === 'date-time' ? '1970-01-01T00:00:00.000Z' : schema.format === 'date' ? '1970-01-01' : '', unsupported };
  return { unsupported: [...unsupported, `Unsupported or unspecified schema type: ${type ?? 'unknown'}.`] };
}
