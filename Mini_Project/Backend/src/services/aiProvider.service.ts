/**
 * AiProvider — abstraction layer for AI model backends.
 *
 * Phase 7 ONLY reads from this interface. The ValidationService (Phase 6)
 * remains the deterministic source of truth for pass/fail decisions.
 */

import type { SanitizedEvidence, DiagnosisFinding, DiagnosisConfidence, AiProviderName } from '../types/diagnosis.types.js';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface AiProviderResponse {
  confidence: DiagnosisConfidence;
  summary: string;
  findings: DiagnosisFinding[];
  /** Raw prompt, included only if the provider supports it */
  promptExcerpt?: string;
}

export interface AiProvider {
  readonly name: AiProviderName;
  diagnose(evidence: SanitizedEvidence): Promise<AiProviderResponse>;
}

// ---------------------------------------------------------------------------
// MockAiProvider — deterministic, no network, used in tests
// ---------------------------------------------------------------------------

export class MockAiProvider implements AiProvider {
  readonly name: AiProviderName = 'mock';

  async diagnose(evidence: SanitizedEvidence): Promise<AiProviderResponse> {
    const findings: DiagnosisFinding[] = [];
    let findingIdx = 0;

    // Derive findings deterministically from the evidence
    for (const failed of evidence.validation.failedAssertions) {
      findings.push({
        id: `finding_${findingIdx++}`,
        title: `Assertion failed: ${failed.category} at ${failed.path}`,
        explanation: failed.message,
        severity: deriveSeverity(failed.category),
        suggestion: deriveSuggestion(failed.category, failed.expected, failed.actual),
        relatedAssertionId: undefined,
      });
    }

    if (evidence.execution.error) {
      findings.push({
        id: `finding_${findingIdx++}`,
        title: 'Request execution error',
        explanation: `The HTTP request failed with: ${evidence.execution.error}`,
        severity: 'ERROR',
        suggestion: 'Verify the API server is running and the endpoint URL is correct.',
      });
    }

    if (evidence.execution.durationMs > 5000) {
      findings.push({
        id: `finding_${findingIdx}`,
        title: 'High response latency detected',
        explanation: `The request took ${evidence.execution.durationMs}ms, which exceeds the 5000ms threshold.`,
        severity: 'WARNING',
        suggestion: 'Investigate server performance, payload sizes, or database queries for this endpoint.',
      });
    }

    const allPassed = evidence.validation.summary.failedAssertions === 0 && !evidence.execution.error;
    const confidence: DiagnosisConfidence =
      findings.length === 0 ? 'HIGH' : findings.length <= 2 ? 'MEDIUM' : 'LOW';

    const summary = allPassed
      ? `All ${evidence.validation.summary.totalAssertions} assertions passed. The response contract is satisfied.`
      : `${evidence.validation.summary.failedAssertions} of ${evidence.validation.summary.totalAssertions} assertions failed. ${findings.length} finding(s) identified.`;

    return { confidence, summary, findings };
  }
}

// ---------------------------------------------------------------------------
// GoogleAiProvider — Gemini via REST API
// ---------------------------------------------------------------------------

export class GoogleAiProvider implements AiProvider {
  readonly name: AiProviderName = 'google-gemini';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = 'gemini-2.0-flash') {
    if (!apiKey) throw new Error('GoogleAiProvider: GEMINI_API_KEY is required.');
    this.apiKey = apiKey;
    this.model = model;
  }

  async diagnose(evidence: SanitizedEvidence): Promise<AiProviderResponse> {
    const prompt = buildPrompt(evidence);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const requestBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown');
      throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    let parsed: GeminiDiagnosisPayload;
    try {
      parsed = JSON.parse(rawText) as GeminiDiagnosisPayload;
    } catch {
      throw new Error(`Failed to parse Gemini JSON response: ${rawText.slice(0, 200)}`);
    }

    const findings: DiagnosisFinding[] = (parsed.findings ?? []).map((f, i) => ({
      id: `finding_${i}`,
      title: String(f.title ?? 'Untitled finding'),
      explanation: String(f.explanation ?? ''),
      severity: normalizeSeverity(f.severity),
      suggestion: String(f.suggestion ?? ''),
      relatedAssertionId: f.relatedAssertionId ?? undefined,
    }));

    return {
      confidence: normalizeConfidence(parsed.confidence),
      summary: String(parsed.summary ?? 'No summary provided.'),
      findings,
      promptExcerpt: process.env.NODE_ENV === 'development' ? prompt.slice(0, 500) : undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

const SYSTEM_INSTRUCTION = `You are an API testing expert assistant embedded in APIForge.
You receive structured evidence about an API test case, its HTTP execution result, and the deterministic validation outcome.
Your role is ADVISORY ONLY. You must never override the validation status.
Respond ONLY with valid JSON matching this schema:
{
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "summary": "string",
  "findings": [
    {
      "title": "string",
      "explanation": "string",
      "severity": "INFO" | "WARNING" | "ERROR" | "CRITICAL",
      "suggestion": "string",
      "relatedAssertionId": "string | null"
    }
  ]
}
Keep findings concise and actionable. Never hallucinate information not present in the evidence.`;

function buildPrompt(evidence: SanitizedEvidence): string {
  return `Analyse this API test evidence and produce a diagnostic report.

## Test Case
- ID: ${evidence.testCase.id}
- Name: ${evidence.testCase.name}
- Type: ${evidence.testCase.type} (Priority: ${evidence.testCase.priority})
- Endpoint: ${evidence.testCase.endpoint.method} ${evidence.testCase.endpoint.path}
- Expected status codes: ${evidence.testCase.expected.statusCodes?.join(', ') ?? 'any'}
${evidence.testCase.expected.statusClass ? `- Expected status class: ${evidence.testCase.expected.statusClass}` : ''}

## Execution Result
- Status: ${evidence.execution.status}
- Duration: ${evidence.execution.durationMs}ms
${evidence.execution.error ? `- Error: ${evidence.execution.error}` : ''}
${
  evidence.execution.response
    ? `- HTTP Status: ${evidence.execution.response.status} ${evidence.execution.response.statusText}
- Content-Type: ${evidence.execution.response.headers['content-type'] ?? 'not set'}
- Body excerpt: ${evidence.execution.response.bodyExcerpt ?? 'empty'}`
    : ''
}

## Validation Summary
- Outcome: ${evidence.validation.status}
- Assertions: ${evidence.validation.summary.passedAssertions}/${evidence.validation.summary.totalAssertions} passed

## Failed Assertions
${
  evidence.validation.failedAssertions.length === 0
    ? 'None — all assertions passed.'
    : evidence.validation.failedAssertions
        .map(
          (a, i) =>
            `${i + 1}. [${a.category}] ${a.path}\n   Expected: ${a.expected}\n   Actual:   ${a.actual}\n   Message:  ${a.message}`
        )
        .join('\n')
}

Respond with a JSON object as described in your system instruction.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deriveSeverity(category: string): DiagnosisFinding['severity'] {
  switch (category) {
    case 'STATUS_CODE': return 'ERROR';
    case 'SCHEMA_REQUIRED': return 'ERROR';
    case 'SCHEMA_TYPE': return 'ERROR';
    case 'SCHEMA_CONSTRAINT': return 'WARNING';
    case 'SCHEMA_ENUM': return 'WARNING';
    case 'CONTENT_TYPE': return 'WARNING';
    case 'HEADER': return 'INFO';
    default: return 'INFO';
  }
}

function deriveSuggestion(category: string, expected: string, actual: string): string {
  switch (category) {
    case 'STATUS_CODE':
      return `The server returned HTTP ${actual} instead of the expected ${expected}. Check the request parameters and server-side error handling.`;
    case 'SCHEMA_REQUIRED':
      return `Required field ${expected} is missing from the response. Ensure the API returns all required schema fields.`;
    case 'SCHEMA_TYPE':
      return `Type mismatch at this path: expected ${expected} but got ${actual}. Verify the API serialisation and schema definition match.`;
    case 'CONTENT_TYPE':
      return `Response Content-Type is '${actual}' but '${expected}' was expected. Check your API framework's content negotiation.`;
    case 'HEADER':
      return `Response header is missing or incorrect. Expected ${expected}, got ${actual}.`;
    default:
      return `Review the API contract and implementation to ensure ${expected} is returned correctly.`;
  }
}

function normalizeSeverity(raw: unknown): DiagnosisFinding['severity'] {
  if (raw === 'INFO' || raw === 'WARNING' || raw === 'ERROR' || raw === 'CRITICAL') return raw;
  return 'INFO';
}

function normalizeConfidence(raw: unknown): DiagnosisConfidence {
  if (raw === 'HIGH' || raw === 'MEDIUM' || raw === 'LOW') return raw;
  return 'LOW';
}

// ---------------------------------------------------------------------------
// Gemini response type (minimal)
// ---------------------------------------------------------------------------

interface GeminiDiagnosisPayload {
  confidence?: unknown;
  summary?: unknown;
  findings?: Array<{
    title?: unknown;
    explanation?: unknown;
    severity?: unknown;
    suggestion?: unknown;
    relatedAssertionId?: string | null;
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

// ---------------------------------------------------------------------------
// Factory — reads env and returns the correct provider
// ---------------------------------------------------------------------------

export function createAiProvider(): AiProvider {
  const providerEnv = (process.env.AI_PROVIDER ?? 'mock').toLowerCase();

  if (providerEnv === 'google-gemini') {
    const apiKey = process.env.GEMINI_API_KEY ?? '';
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
    return new GoogleAiProvider(apiKey, model);
  }

  // Default: mock provider (safe for tests and development with no key)
  return new MockAiProvider();
}
