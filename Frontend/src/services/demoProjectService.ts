import { USER_MANAGEMENT_SPEC_JSON } from '@/data/userManagementSpec';
import { ECOMMERCE_SPEC_JSON } from '@/data/ecommerceSpec';
import { openApiService } from '@/services/openapiService';
import { testGeneratorService } from '@/services/testGeneratorService';
import { useAppStore } from '@/store/useAppStore';
import type { ApiSpecification } from '@/types/openapi.types';
import type { TestCase } from '@/types/testCase.types';

export type DemoProjectId = 'user' | 'ecommerce';

export interface DemoFeatureStep {
  featureNumber: number;
  title: string;
  route: string;
  actionText: string;
  expectedResult: string;
  keyMetric: string;
}

export interface DemoProjectMetadata {
  id: DemoProjectId;
  title: string;
  shortName: string;
  tagline: string;
  description: string;
  color: string;
  badgeCls: string;
  specFileName: string;
  specJson: string;
  workflowId: string;
  workflowName: string;
  primaryEndpoint: string;
  primaryMethod: 'GET' | 'POST' | 'PUT' | 'DELETE';
  samplePayload?: string;
  steps: DemoFeatureStep[];
}

export const DEMO_PROJECTS: Record<DemoProjectId, DemoProjectMetadata> = {
  user: {
    id: 'user',
    title: 'Project 1: User Management API',
    shortName: 'User Demo',
    tagline: 'Student & Faculty Identity Lifecycle with CRUD and Teardown',
    description:
      'A complete academic user directory with 5 endpoints, schema validation for roles, bearer authentication, and automated teardown cleanup.',
    color: 'sky',
    badgeCls: 'bg-sky-100 text-sky-800 border-sky-300',
    specFileName: 'user-management-api.json',
    specJson: USER_MANAGEMENT_SPEC_JSON,
    workflowId: 'wf-user-management-demo',
    workflowName: 'User Management Demo Workflow',
    primaryEndpoint: 'http://localhost:3001/api/mock/serve/api/users',
    primaryMethod: 'POST',
    samplePayload: JSON.stringify(
      {
        name: 'Aarav Patil',
        email: 'aarav@example.com',
        role: 'student',
        active: true,
      },
      null,
      2
    ),
    steps: [
      {
        featureNumber: 1,
        title: 'OpenAPI Specification Studio',
        route: '/openapi',
        actionText: 'View parsed endpoints, parameter schemas, and server contracts.',
        expectedResult: '5 endpoints parsed (/api/users, /api/users/{id}) with OpenAPI 3.1 schema.',
        keyMetric: '5 Endpoints, 1 Model Schema',
      },
      {
        featureNumber: 2,
        title: 'Interactive API Documentation',
        route: '/documentation',
        actionText: 'Inspect auto-generated interactive documentation and schema types.',
        expectedResult: 'Live documentation rendered with query/path parameter contracts.',
        keyMetric: '100% Contract Grounded',
      },
      {
        featureNumber: 3,
        title: 'Synthetic JSON Generator',
        route: '/json-generator',
        actionText: 'Select the "User" schema and click "Generate JSON".',
        expectedResult: 'Synthesizes conforming JSON payload matching all field types.',
        keyMetric: 'Zero Manual Typing',
      },
      {
        featureNumber: 4,
        title: 'Local Stateful Mock Server',
        route: '/mock-server',
        actionText: 'View live routes or click "Generate From Spec" to mount endpoints.',
        expectedResult: 'Mock routes active on port 3001 with real HTTP response dispatch.',
        keyMetric: 'Port 3001 Stateful Mock',
      },
      {
        featureNumber: 5,
        title: 'Interactive Request Builder',
        route: '/request-builder',
        actionText: 'Click "Send" on the preloaded POST /api/users request.',
        expectedResult: 'Returns HTTP 201 Created with record for Aarav Patil (ID 101).',
        keyMetric: 'HTTP 201 Created (<25ms)',
      },
      {
        featureNumber: 6,
        title: 'Saved Request Collections',
        route: '/collections',
        actionText: 'Open the "User Management API Demo Suite" and execute requests.',
        expectedResult: 'Collection requests run with status badges and response history.',
        keyMetric: '4 Preloaded Requests',
      },
      {
        featureNumber: 7,
        title: 'Visual Workflow Engine & DAG',
        route: '/workflows',
        actionText: 'Click "Run Workflow" on the User Management Demo Workflow.',
        expectedResult: 'Step 1 creates user -> extracts userId -> Step 2 fetches user -> Step 4 teardown deletes user.',
        keyMetric: '4-Step Chain + Auto Teardown',
      },
      {
        featureNumber: 8,
        title: 'Autonomous Response Validation',
        route: '/response-validation',
        actionText: 'Click "Validate All Executed Tests" to run contract verification.',
        expectedResult: 'Dual-pass Ajv schema and HTTP status assertions verified with green checkmarks.',
        keyMetric: '11 Passing Assertions (100%)',
      },
      {
        featureNumber: 9,
        title: 'Executive Reports & Analytics',
        route: '/reports',
        actionText: 'Click "Generate Report" and view the real-time compliance metrics.',
        expectedResult: 'Interactive charts, latency breakdowns, and downloadable HTML/JUnit reports.',
        keyMetric: '100% Pass Rate Report',
      },
      {
        featureNumber: 10,
        title: 'AI Advisory Assistant',
        route: '/ai-assistant',
        actionText: 'Ask "Explain the user schema and authentication requirement".',
        expectedResult: 'Context-aware guidance grounded in the imported specification.',
        keyMetric: 'Contract-Grounded AI',
      },
    ],
  },
  ecommerce: {
    id: 'ecommerce',
    title: 'Project 2: QuickCart E-Commerce API',
    shortName: 'QuickCart Demo',
    tagline: 'Store Catalog, Shopping Cart, Order Checkout & Teardown Cancellation',
    description:
      'High-throughput e-commerce platform with 6 endpoints for product search, categories, stock tracking, and multi-step order checkout.',
    color: 'emerald',
    badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    specFileName: 'ecommerce-store-api.json',
    specJson: ECOMMERCE_SPEC_JSON,
    workflowId: 'wf-ecommerce-checkout-demo',
    workflowName: 'E-Commerce Order Checkout Workflow',
    primaryEndpoint: 'http://localhost:3001/api/mock/serve/api/products?category=electronics',
    primaryMethod: 'GET',
    samplePayload: '',
    steps: [
      {
        featureNumber: 1,
        title: 'OpenAPI Specification Studio',
        route: '/openapi',
        actionText: 'View catalog endpoints, query filter params, and order checkout schemas.',
        expectedResult: '6 endpoints parsed (/api/products, /api/orders) with Product, Order, and Review models.',
        keyMetric: '6 Endpoints, 3 Models',
      },
      {
        featureNumber: 2,
        title: 'Interactive API Documentation',
        route: '/documentation',
        actionText: 'Inspect product search query filters and required order schema fields.',
        expectedResult: 'Structured documentation with query parameter constraints and type rules.',
        keyMetric: 'Query & Schema Contracts',
      },
      {
        featureNumber: 3,
        title: 'Synthetic JSON Generator',
        route: '/json-generator',
        actionText: 'Select schema "Product" or "Order" and click "Generate JSON".',
        expectedResult: 'Synthesizes realistic catalog items with price, stock, and rating fields.',
        keyMetric: 'Realistic Store Mock Data',
      },
      {
        featureNumber: 4,
        title: 'Local Stateful Mock Server',
        route: '/mock-server',
        actionText: 'Inspect product inventory routes and test order creation responses.',
        expectedResult: 'Mock routes serve UltraBook Pro 15 (ID 201) and order confirmation (ORD-9021).',
        keyMetric: 'Stateful E-Commerce Mock',
      },
      {
        featureNumber: 5,
        title: 'Interactive Request Builder',
        route: '/request-builder',
        actionText: 'Click "Send" on the preloaded GET /api/products?category=electronics request.',
        expectedResult: 'Returns HTTP 200 OK with product catalog array containing UltraBook Pro 15.',
        keyMetric: 'HTTP 200 OK (<20ms)',
      },
      {
        featureNumber: 6,
        title: 'Saved Request Collections',
        route: '/collections',
        actionText: 'Open the "QuickCart E-Commerce Store" collection and run requests.',
        expectedResult: 'Executes Browse, Filter, Order, and Cancel requests with live badges.',
        keyMetric: '5 E-Commerce Requests',
      },
      {
        featureNumber: 7,
        title: 'Visual Workflow Engine & DAG',
        route: '/workflows',
        actionText: 'Click "Run Workflow" on the E-Commerce Order Checkout Workflow.',
        expectedResult: '1. Browse catalog -> extracts featuredProductId -> 2. Place order -> extracts activeOrderId -> 3. Track order -> 4. Teardown cancel order.',
        keyMetric: 'Complete Checkout Lifecycle',
      },
      {
        featureNumber: 8,
        title: 'Autonomous Response Validation',
        route: '/response-validation',
        actionText: 'Click "Validate All Executed Tests" to run contract verification.',
        expectedResult: 'Validates currency numbers, string formats, and 200/201 HTTP status responses.',
        keyMetric: 'Automated Contract Suite',
      },
      {
        featureNumber: 9,
        title: 'Executive Reports & Analytics',
        route: '/reports',
        actionText: 'Click "Generate Report" to aggregate checkout test performance.',
        expectedResult: 'Summary dashboard displaying total tests, zero drift, and latency distribution.',
        keyMetric: 'Store Compliance Report',
      },
      {
        featureNumber: 10,
        title: 'AI Advisory Assistant',
        route: '/ai-assistant',
        actionText: 'Ask "How does the checkout workflow validate order total and items?".',
        expectedResult: 'Intelligent, grounded explanation of schema structures and checkout logic.',
        keyMetric: 'Domain-Aware AI Assistant',
      },
    ],
  },
};

/**
 * 1-Click Master Initializer for Live Demonstration Projects
 * Loads specification, sets active workflow, sets local mock environment,
 * configures request draft, synthesizes validation test cases, and alerts user.
 */
export async function loadDemoProject(projectId: DemoProjectId): Promise<ApiSpecification> {
  const store = useAppStore.getState();
  const meta = DEMO_PROJECTS[projectId];

  // 1. Ensure Local Mock Server environment is active
  const localEnv = store.environments.find((e) => e.id === 'env-local') || store.environments[0];
  if (localEnv) {
    store.setActiveEnvironmentId(localEnv.id);
  }

  // 2. Select corresponding workflow
  store.setActiveWorkflowId(meta.workflowId);

  // 3. Pre-fill Request Builder draft
  store.setRequestDraft({
    method: meta.primaryMethod,
    url: meta.primaryEndpoint,
    headers: [
      { id: 'h-demo-1', key: 'Content-Type', value: 'application/json', enabled: true },
      { id: 'h-demo-2', key: 'Accept', value: 'application/json', enabled: true },
    ],
    queryParams: meta.id === 'ecommerce' ? [{ id: 'qp-cat', key: 'category', value: 'electronics', enabled: true }] : [],
    body: meta.samplePayload || '',
    auth: { type: 'none' },
  });

  // 4. Parse / Import OpenAPI Specification
  let spec: ApiSpecification;
  try {
    const res = await openApiService.importSpecification(meta.specFileName, meta.specJson);
    if (res.success && res.specification) {
      spec = res.specification;
    } else {
      // Fallback: parse JSON directly into minimal valid spec
      spec = JSON.parse(meta.specJson) as unknown as ApiSpecification;
    }
  } catch {
    spec = JSON.parse(meta.specJson) as unknown as ApiSpecification;
  }

  store.setActiveSpecification(spec);

  // 5. Synthesize test cases for Response Validation & Reports
  try {
    const suite = await testGeneratorService.generate({
      specification: spec,
      settings: {
        categories: ['POSITIVE', 'NEGATIVE', 'BOUNDARY', 'SCHEMA'],
        maxTestsPerEndpoint: 4,
      },
    });
    if (suite.tests && suite.tests.length > 0) {
      store.setGeneratedTests(suite.tests);
    }
  } catch {
    // If backend generator is temporarily unreachable, create synthetic tests from endpoints
    if (spec.endpoints && spec.endpoints.length > 0) {
      const fallbackTests: TestCase[] = spec.endpoints.slice(0, 8).map((ep, idx) => ({
        id: `test-demo-${ep.id || idx}`,
        name: `${ep.method} ${ep.path} - Success Contract`,
        description: `Autonomous contract test for ${ep.method} ${ep.path}`,
        type: 'POSITIVE',
        priority: 'HIGH',
        enabled: true,
        endpoint: { method: ep.method, path: ep.path, operationId: ep.operationId },
        request: {
          method: ep.method,
          url: `http://localhost:3001/api/mock/serve${ep.path.replace(/\{[a-zA-Z0-9_-]+\}/g, meta.id === 'ecommerce' ? '201' : '101')}`,
          headers: [{ id: 'h1', key: 'Accept', value: 'application/json', enabled: true }],
          body: '',
          auth: { type: 'none' },
        },
        pathParams: {},
        expected: {
          statusCodes: ['200', '201', '204'],
        },
        metadata: {
          sourceEndpointId: ep.id,
          rule: 'contract-match',
        },
      }));
      store.setGeneratedTests(fallbackTests);
    }
  }

  // 6. Push user notification
  store.addNotification({
    type: 'success',
    title: `${meta.title} Loaded!`,
    message: `All 10 APIForge features are ready to test. Active workflow: "${meta.workflowName}".`,
  });

  return spec;
}

