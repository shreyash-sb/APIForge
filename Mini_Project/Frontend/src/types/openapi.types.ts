export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type ApiHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE';

export interface ApiSchema { reference?: string; type?: string | string[]; format?: string; description?: string; nullable?: boolean; required?: string[]; properties?: Record<string, ApiSchema>; items?: ApiSchema; enum?: JsonPrimitive[]; default?: JsonValue; example?: JsonValue; examples?: JsonValue[]; constraints?: Record<string, JsonValue>; allOf?: ApiSchema[]; anyOf?: ApiSchema[]; oneOf?: ApiSchema[]; additionalProperties?: boolean | ApiSchema; }
export interface ApiMetadata { title: string; version: string; description?: string; contact?: { name?: string; url?: string; email?: string }; license?: { name: string; url?: string }; }
export interface ApiServer { url: string; description?: string; }
export interface ApiParameter { reference?: string; name: string; location: 'path' | 'query' | 'header' | 'cookie' | 'body' | 'formData'; required: boolean; description?: string; deprecated?: boolean; schema?: ApiSchema; example?: JsonValue; default?: JsonValue; enum?: JsonPrimitive[]; }
export interface ApiMediaContent { contentType: string; schema?: ApiSchema; example?: JsonValue; examples?: Record<string, JsonValue>; }
export interface ApiRequestBody { reference?: string; required: boolean; description?: string; content: ApiMediaContent[]; }
export interface ApiResponse { reference?: string; statusCode: string; description?: string; headers: Record<string, ApiSchema>; content: ApiMediaContent[]; }
export interface ApiSecurityRequirement { scheme: string; scopes: string[]; }
export interface ApiSecurityScheme { reference?: string; type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect' | 'basic' | 'unknown'; description?: string; name?: string; location?: 'header' | 'query' | 'cookie'; scheme?: string; bearerFormat?: string; openIdConnectUrl?: string; flows?: JsonValue; }
export interface ApiEndpoint { id: string; path: string; method: ApiHttpMethod; operationId?: string; summary?: string; description?: string; tags: string[]; deprecated: boolean; parameters: ApiParameter[]; requestBody?: ApiRequestBody; responses: ApiResponse[]; security: ApiSecurityRequirement[] | null; }
export interface ApiSpecification { version: 'openapi-3.0' | 'openapi-3.1' | 'swagger-2.0'; metadata: ApiMetadata; servers: ApiServer[]; endpoints: ApiEndpoint[]; schemas: Record<string, ApiSchema>; securitySchemes: Record<string, ApiSecurityScheme>; }
export type OpenApiImportResult = { success: true; specification: ApiSpecification } | { success: false; error: { message: string; details?: string[] } };
