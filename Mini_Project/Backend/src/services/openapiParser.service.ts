import { normalize, validate } from '@scalar/openapi-parser';
import type {
  ApiEndpoint, ApiHttpMethod, ApiMediaContent, ApiMetadata, ApiParameter, ApiRequestBody,
  ApiResponse, ApiSchema, ApiSecurityRequirement, ApiSecurityScheme, ApiServer, ApiSpecification,
  JsonPrimitive, JsonValue, OpenApiImportResult, SupportedSpecificationVersion,
} from '../types/openapi.types.js';

type Source = Record<string, unknown>;
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
const SCHEMA_CONSTRAINTS = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties'];

const isObject = (value: unknown): value is Source => typeof value === 'object' && value !== null && !Array.isArray(value);
const asString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const asJsonValue = (value: unknown): JsonValue | undefined => value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || Array.isArray(value) || isObject(value) ? value as JsonValue : undefined;

export class OpenApiParserService {
  async importSpecification(content: string): Promise<OpenApiImportResult> {
    if (!content.trim()) return this.failure('The selected file is empty.');
    let source: Source;
    try {
      const normalized = normalize(content);
      if (!isObject(normalized)) return this.failure('The file could not be parsed as JSON or YAML.');
      source = normalized;
    } catch { return this.failure('The file could not be parsed as JSON or YAML.'); }
    if (this.hasExternalReference(source)) return this.failure('External $ref values are not supported. Import a self-contained specification or use internal #/ references.');

    const version = this.detectVersion(source);
    if (!version) return this.failure('Unsupported specification version. APIForge supports OpenAPI 3.0, OpenAPI 3.1, and Swagger 2.0.');
    if (!isObject(source.info) || !asString(source.info.title) || !asString(source.info.version)) {
      return this.failure("Invalid OpenAPI specification: the 'info.title' and 'info.version' fields are required.");
    }
    if (!isObject(source.paths)) return this.failure("Invalid OpenAPI specification: the 'paths' field is required.");
    const structureError = this.validateStructure(source);
    if (structureError) return this.failure(`Invalid OpenAPI specification: ${structureError}`);

    let validation;
    try { validation = await validate(content); } catch { return this.failure('The file could not be parsed as JSON or YAML.'); }
    if (!validation.valid) return this.failure('Invalid OpenAPI specification.', validation.errors.slice(0, 5).map((error) => error.message));

    return { success: true, specification: this.normalize(source, version) };
  }

  private failure(message: string, details?: string[]): OpenApiImportResult { return { success: false, error: { message, details } }; }
  private hasExternalReference(value: unknown): boolean {
    if (Array.isArray(value)) return value.some((item) => this.hasExternalReference(item));
    if (!isObject(value)) return false;
    if (typeof value.$ref === 'string' && !value.$ref.startsWith('#/')) return true;
    return Object.values(value).some((item) => this.hasExternalReference(item));
  }
  private detectVersion(source: Source): SupportedSpecificationVersion | undefined {
    const openapi = asString(source.openapi);
    if (openapi?.startsWith('3.0.')) return 'openapi-3.0';
    if (openapi?.startsWith('3.1.')) return 'openapi-3.1';
    if (source.swagger === '2.0') return 'swagger-2.0';
    return undefined;
  }
  private validateStructure(source: Source): string | undefined {
    const paths = source.paths as Source;
    for (const [path, pathItem] of Object.entries(paths)) {
      const resolvedPathItem = this.resolve(pathItem, source).value;
      if (!path.startsWith('/') || !isObject(resolvedPathItem)) return `path '${path}' is malformed.`;
      for (const [method, operation] of Object.entries(resolvedPathItem)) {
        if (!METHODS.has(method)) continue;
        if (!isObject(operation)) return `operation '${method.toUpperCase()} ${path}' is malformed.`;
        if (!isObject(operation.responses)) return `operation '${method.toUpperCase()} ${path}' is missing required responses.`;
      }
    }
    return this.hasInvalidInternalReference(source, source) ? 'an internal $ref cannot be resolved.' : undefined;
  }
  private hasInvalidInternalReference(value: unknown, source: Source): boolean {
    if (Array.isArray(value)) return value.some((item) => this.hasInvalidInternalReference(item, source));
    if (!isObject(value)) return false;
    if (typeof value.$ref === 'string' && value.$ref.startsWith('#/')) {
      const target = value.$ref.slice(2).split('/').reduce<unknown>((current, segment) => isObject(current) ? current[segment.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined, source);
      if (target === undefined) return true;
    }
    return Object.values(value).some((item) => this.hasInvalidInternalReference(item, source));
  }
  private normalize(source: Source, version: SupportedSpecificationVersion): ApiSpecification {
    const isSwagger = version === 'swagger-2.0';
    const components = isObject(source.components) ? source.components : {};
    const schemasSource = (isSwagger ? source.definitions : components.schemas) ?? {};
    const securitySource = (isSwagger ? source.securityDefinitions : components.securitySchemes) ?? {};
    return {
      version,
      metadata: this.metadata(source.info as Source),
      servers: isSwagger ? this.swaggerServers(source) : this.servers(source.servers),
      endpoints: this.endpoints(source, isSwagger),
      schemas: isObject(schemasSource) ? Object.fromEntries(Object.entries(schemasSource).map(([name, schema]) => [name, this.schema(schema, source)])) : {},
      securitySchemes: isObject(securitySource) ? Object.fromEntries(Object.entries(securitySource).map(([name, scheme]) => [name, this.securityScheme(scheme, isSwagger, source)])) : {},
    };
  }
  private metadata(info: Source): ApiMetadata {
    const contact = isObject(info.contact) ? info.contact : undefined;
    const license = isObject(info.license) ? info.license : undefined;
    return { title: asString(info.title) ?? 'Untitled API', version: asString(info.version) ?? '', description: asString(info.description), contact: contact ? { name: asString(contact.name), url: asString(contact.url), email: asString(contact.email) } : undefined, license: license && asString(license.name) ? { name: asString(license.name)!, url: asString(license.url) } : undefined };
  }
  private servers(value: unknown): ApiServer[] { return Array.isArray(value) ? value.filter(isObject).flatMap((server) => asString(server.url) ? [{ url: asString(server.url)!, description: asString(server.description) }] : []) : []; }
  private swaggerServers(source: Source): ApiServer[] {
    const host = asString(source.host); const basePath = asString(source.basePath) ?? ''; const schemes = asStringArray(source.schemes);
    return host ? (schemes.length ? schemes : ['https']).map((scheme) => ({ url: `${scheme}://${host}${basePath}` })) : [];
  }
  private endpoints(source: Source, isSwagger: boolean): ApiEndpoint[] {
    const paths = source.paths as Source;
    const endpoints: ApiEndpoint[] = [];
    for (const [path, item] of Object.entries(paths)) {
      const pathItem = this.resolve(item, source).value;
      if (!isObject(pathItem)) continue;
      const pathParameters = this.parameters(pathItem.parameters, source);
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!METHODS.has(method) || !isObject(operation)) continue;
        const parameters = [...pathParameters, ...this.parameters(operation.parameters, source)];
        const bodyParameter = isSwagger ? parameters.find((parameter) => parameter.location === 'body' || parameter.location === 'formData') : undefined;
        endpoints.push({ id: `${method.toUpperCase()} ${path}`, path, method: method.toUpperCase() as ApiHttpMethod, operationId: asString(operation.operationId), summary: asString(operation.summary), description: asString(operation.description), tags: asStringArray(operation.tags), deprecated: operation.deprecated === true, parameters: parameters.filter((parameter) => parameter !== bodyParameter), requestBody: isSwagger ? this.swaggerRequestBody(bodyParameter, operation, source) : this.requestBody(operation.requestBody, source), responses: this.responses(operation.responses, operation, source, isSwagger), security: this.security(operation.security ?? source.security) });
      }
    }
    return endpoints;
  }
  private resolve(value: unknown, source: Source, depth = 0): { value: unknown; reference?: string } {
    if (!isObject(value) || typeof value.$ref !== 'string' || depth > 12) return { value };
    const reference = value.$ref;
    if (!reference.startsWith('#/')) return { value, reference };
    const target = reference.slice(2).split('/').reduce<unknown>((current, segment) => isObject(current) ? current[segment.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined, source);
    return target === undefined ? { value, reference } : { value: target, reference };
  }
  private parameters(value: unknown, source: Source): ApiParameter[] {
    return Array.isArray(value) ? value.map((item) => this.parameter(item, source)).filter((item): item is ApiParameter => item !== undefined) : [];
  }
  private parameter(value: unknown, source: Source): ApiParameter | undefined {
    const resolved = this.resolve(value, source); if (!isObject(resolved.value)) return undefined; const item = resolved.value;
    const location = asString(item.in); const name = asString(item.name); if (!name || !location || !['path', 'query', 'header', 'cookie', 'body', 'formData'].includes(location)) return undefined;
    const schemaSource = item.schema ?? (item.type ? item : undefined);
    return { reference: resolved.reference, name, location: location as ApiParameter['location'], required: item.required === true || location === 'path', description: asString(item.description), deprecated: item.deprecated === true, schema: schemaSource ? this.schema(schemaSource, source) : undefined, example: asJsonValue(item.example), default: isObject(schemaSource) ? asJsonValue(schemaSource.default) : undefined, enum: isObject(schemaSource) && Array.isArray(schemaSource.enum) ? schemaSource.enum.filter((v): v is JsonPrimitive => v === null || ['string', 'number', 'boolean'].includes(typeof v)) : undefined };
  }
  private requestBody(value: unknown, source: Source): ApiRequestBody | undefined {
    const resolved = this.resolve(value, source); if (!isObject(resolved.value)) return undefined; const item = resolved.value;
    return { reference: resolved.reference, required: item.required === true, description: asString(item.description), content: this.content(item.content, source) };
  }
  private swaggerRequestBody(parameter: ApiParameter | undefined, operation: Source, source: Source): ApiRequestBody | undefined {
    if (!parameter?.schema) return undefined;
    const operationConsumes = asStringArray(operation.consumes);
    const contentTypes = operationConsumes.length ? operationConsumes : (asStringArray(source.consumes).length ? asStringArray(source.consumes) : ['application/json']);
    return { required: parameter.required, description: parameter.description, content: contentTypes.map((contentType) => ({ contentType, schema: parameter.schema, example: parameter.example })) };
  }
  private responses(value: unknown, operation: Source, source: Source, isSwagger: boolean): ApiResponse[] {
    if (!isObject(value)) return [];
    return Object.entries(value).map(([statusCode, response]) => { const resolved = this.resolve(response, source); const item = isObject(resolved.value) ? resolved.value : {}; const operationProduces = asStringArray(operation.produces); const produces = operationProduces.length ? operationProduces : (asStringArray(source.produces).length ? asStringArray(source.produces) : ['application/json']); return { reference: resolved.reference, statusCode, description: asString(item.description), headers: isObject(item.headers) ? Object.fromEntries(Object.entries(item.headers).map(([name, header]) => [name, this.schema(header, source)])) : {}, content: isSwagger ? (item.schema ? produces.map((contentType) => ({ contentType, schema: this.schema(item.schema, source), example: isObject(item.examples) ? asJsonValue(item.examples[contentType]) : undefined })) : []) : this.content(item.content, source) }; });
  }
  private content(value: unknown, source: Source): ApiMediaContent[] {
    if (!isObject(value)) return [];
    return Object.entries(value).map(([contentType, media]) => { const item = isObject(media) ? media : {}; const examples = isObject(item.examples) ? Object.fromEntries(Object.entries(item.examples).flatMap(([name, example]) => { const resolved = this.resolve(example, source); return isObject(resolved.value) && asJsonValue(resolved.value.value) !== undefined ? [[name, asJsonValue(resolved.value.value)!]] : []; })) : undefined; return { contentType, schema: item.schema ? this.schema(item.schema, source) : undefined, example: asJsonValue(item.example), examples }; });
  }
  private schema(value: unknown, source: Source, depth = 0): ApiSchema {
    const resolved = this.resolve(value, source, depth); if (!isObject(resolved.value)) return { reference: resolved.reference }; const item = resolved.value; const constraints = Object.fromEntries(SCHEMA_CONSTRAINTS.flatMap((key) => asJsonValue(item[key]) !== undefined ? [[key, asJsonValue(item[key])!]] : []));
    return { reference: resolved.reference, type: typeof item.type === 'string' || Array.isArray(item.type) ? item.type as string | string[] : undefined, format: asString(item.format), description: asString(item.description), nullable: item.nullable === true || (Array.isArray(item.type) && item.type.includes('null')), required: asStringArray(item.required), properties: isObject(item.properties) ? Object.fromEntries(Object.entries(item.properties).map(([name, property]) => [name, this.schema(property, source, depth + 1)])) : undefined, items: item.items ? this.schema(item.items, source, depth + 1) : undefined, enum: Array.isArray(item.enum) ? item.enum.filter((v): v is JsonPrimitive => v === null || ['string', 'number', 'boolean'].includes(typeof v)) : undefined, default: asJsonValue(item.default), example: asJsonValue(item.example), examples: Array.isArray(item.examples) ? item.examples.map(asJsonValue).filter((v): v is JsonValue => v !== undefined) : undefined, constraints: Object.keys(constraints).length ? constraints : undefined, allOf: Array.isArray(item.allOf) ? item.allOf.map((part) => this.schema(part, source, depth + 1)) : undefined, anyOf: Array.isArray(item.anyOf) ? item.anyOf.map((part) => this.schema(part, source, depth + 1)) : undefined, oneOf: Array.isArray(item.oneOf) ? item.oneOf.map((part) => this.schema(part, source, depth + 1)) : undefined, additionalProperties: typeof item.additionalProperties === 'boolean' ? item.additionalProperties : item.additionalProperties ? this.schema(item.additionalProperties, source, depth + 1) : undefined };
  }
  private security(value: unknown): ApiSecurityRequirement[] | null { if (!Array.isArray(value)) return null; return value.filter(isObject).flatMap((requirement) => Object.entries(requirement).map(([scheme, scopes]) => ({ scheme, scopes: asStringArray(scopes) }))); }
  private securityScheme(value: unknown, isSwagger: boolean, source: Source): ApiSecurityScheme { const resolved = this.resolve(value, source); const item = isObject(resolved.value) ? resolved.value : {}; const rawType = asString(item.type); const type = rawType === 'basic' && isSwagger ? 'basic' : rawType === 'apiKey' || rawType === 'http' || rawType === 'oauth2' || rawType === 'openIdConnect' ? rawType : 'unknown'; return { reference: resolved.reference, type, description: asString(item.description), name: asString(item.name), location: ['header', 'query', 'cookie'].includes(asString(item.in) ?? '') ? asString(item.in) as 'header' | 'query' | 'cookie' : undefined, scheme: asString(item.scheme), bearerFormat: asString(item.bearerFormat), openIdConnectUrl: asString(item.openIdConnectUrl), flows: asJsonValue(item.flows ?? (isSwagger ? { flow: item.flow, authorizationUrl: item.authorizationUrl, tokenUrl: item.tokenUrl, scopes: item.scopes } : undefined)) }; }
}
