import type { ApiSchema, ApiSpecification, JsonValue } from '../types/openapi.types.js';

export const schemaType = (schema?: ApiSchema): string | undefined =>
  Array.isArray(schema?.type) ? schema?.type.find((item) => item !== 'null') : schema?.type;

export const numberOf = (value: JsonValue | undefined): number | undefined =>
  typeof value === 'number' ? value : undefined;

const isSpecification = (val: unknown): val is ApiSpecification =>
  typeof val === 'object' && val !== null && 'metadata' in val && 'schemas' in val;

export class SchemaResolverService {
  /**
   * Resolves internal $ref references and optionally composes allOf/oneOf/anyOf schemas.
   * Guarantees cycle and depth protection (max 12 levels).
   * @param composeBranches - If true (default), composes allOf and picks first branch of oneOf/anyOf (for test generation).
   *                         If false, resolves references without collapsing composition arrays (for validation).
   */
  resolve(
    schema: ApiSchema | undefined,
    specOrSchemas?: ApiSpecification | Record<string, ApiSchema>,
    depth = 0,
    seen = new Set<string>(),
    composeBranches = true
  ): ApiSchema | undefined {
    if (!schema || depth > 12) return schema;

    const schemaMap: Record<string, ApiSchema> =
      specOrSchemas && isSpecification(specOrSchemas)
        ? specOrSchemas.schemas
        : (specOrSchemas as Record<string, ApiSchema>) ?? {};

    if (schema.reference) {
      if (seen.has(schema.reference)) return undefined;
      const name = schema.reference.split('/').at(-1);
      const found = name ? schemaMap[name] : undefined;
      if (found) {
        const next = new Set(seen);
        next.add(schema.reference);
        return this.resolve(found, schemaMap, depth + 1, next, composeBranches);
      }
    }

    const child = (item?: ApiSchema) => this.resolve(item, schemaMap, depth + 1, new Set(seen), composeBranches);

    const resolved: ApiSchema = {
      ...schema,
      properties: schema.properties
        ? Object.fromEntries(
            Object.entries(schema.properties).map(([name, item]) => [name, child(item) ?? item])
          )
        : undefined,
      items: child(schema.items) ?? schema.items,
      allOf: schema.allOf?.map((item) => child(item) ?? item),
      anyOf: schema.anyOf?.map((item) => child(item) ?? item),
      oneOf: schema.oneOf?.map((item) => child(item) ?? item),
    };

    return composeBranches ? this.compose(resolved) : resolved;
  }

  /**
   * Resolves references recursively for contract validation, preserving
   * allOf, anyOf, and oneOf composition branches for exact semantic evaluation.
   */
  resolveForValidation(
    schema: ApiSchema | undefined,
    specOrSchemas?: ApiSpecification | Record<string, ApiSchema>,
    depth = 0,
    seen = new Set<string>()
  ): ApiSchema | undefined {
    return this.resolve(schema, specOrSchemas, depth, seen, false);
  }

  compose(schema: ApiSchema): ApiSchema {
    const merge = (left: ApiSchema, right: ApiSchema): ApiSchema => ({
      ...left,
      ...right,
      properties: { ...left.properties, ...right.properties },
      required: [...new Set([...(left.required ?? []), ...(right.required ?? [])])],
    });

    if (schema.allOf?.length) {
      return schema.allOf.reduce((result, item) => merge(result, item), {
        ...schema,
        allOf: undefined,
      });
    }

    const branch = schema.oneOf?.[0] ?? schema.anyOf?.[0];
    return branch ? merge({ ...schema, oneOf: undefined, anyOf: undefined }, branch) : schema;
  }
}
