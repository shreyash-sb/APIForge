import type { ApiRequest } from './request.types.js';
import type { ApiSchema, ApiSpecification } from './openapi.types.js';

export type TestCaseType = 'POSITIVE' | 'NEGATIVE' | 'BOUNDARY' | 'SECURITY' | 'SCHEMA' | 'PARAMETER';
export type TestPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface TestEndpointReference {
  method: ApiRequest['method'];
  path: string;
  operationId?: string;
}

export interface TestExpectation {
  statusCodes?: string[];
  statusClass?: '2xx' | '4xx' | '5xx';
  responseSchema?: ApiSchema;
  headers?: Record<string, ApiSchema>;
  conditions?: string[];
}

export interface TestCase {
  id: string;
  name: string;
  description: string;
  type: TestCaseType;
  priority: TestPriority;
  enabled: boolean;
  endpoint: TestEndpointReference;
  request: ApiRequest;
  pathParams: Record<string, string>;
  expected: TestExpectation;
  metadata: { sourceEndpointId: string; rule: string; mutation?: string };
}

export interface TestSuiteGroup { endpoint: TestEndpointReference; tests: TestCase[]; }
export interface TestSuite { specificationTitle: string; generatedAt: 'deterministic'; tests: TestCase[]; groups: TestSuiteGroup[]; }

export interface TestGenerationSettings {
  endpointIds?: string[];
  categories: TestCaseType[];
  maxTestsPerEndpoint: number;
}

export interface TestGenerationRequest { specification: ApiSpecification; settings: TestGenerationSettings; }
