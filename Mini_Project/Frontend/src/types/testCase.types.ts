import type { ApiSchema, ApiSpecification } from './openapi.types';
import type { Auth, HttpMethod } from './request.types';

export type TestCaseType = 'POSITIVE' | 'NEGATIVE' | 'BOUNDARY' | 'SECURITY' | 'SCHEMA' | 'PARAMETER';
export type TestPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export interface TestExpectation {
  statusCodes?: string[];
  statusClass?: '2xx' | '4xx' | '5xx';
  responseSchema?: ApiSchema;
  headers?: Record<string, ApiSchema>;
  conditions?: string[];
}

export interface GeneratedRequest { method: HttpMethod; url: string; queryParams?: Array<{ key: string; value: string; enabled: boolean }>; headers?: Array<{ key: string; value: string; enabled: boolean }>; body?: string | null; auth: Auth; }
export interface TestCase { id: string; name: string; description: string; type: TestCaseType; priority: TestPriority; enabled: boolean; endpoint: { method: HttpMethod; path: string; operationId?: string }; request: GeneratedRequest; pathParams: Record<string, string>; expected: TestExpectation; metadata: { sourceEndpointId: string; rule: string; mutation?: string }; }
export interface TestSuite { specificationTitle: string; generatedAt: 'deterministic'; tests: TestCase[]; groups: Array<{ endpoint: TestCase['endpoint']; tests: TestCase[] }>; }
export interface TestGenerationSettings { endpointIds?: string[]; categories: TestCaseType[]; maxTestsPerEndpoint: number; }
export interface TestGenerationRequest { specification: ApiSpecification; settings: TestGenerationSettings; }
