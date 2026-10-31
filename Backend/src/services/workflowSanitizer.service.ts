import type { ApiRequest, Header, QueryParam } from '../types/request.types.js';
import type { SanitizedApiRequest } from '../types/testExecution.types.js';
import type {
  EnvironmentProfile,
  SanitizedWorkflowExecutionResult,
  SanitizedWorkflowStepExecutionResult,
  WorkflowExecutionResult,
  WorkflowScenario,
} from '../types/workflow.types.js';

export class WorkflowSanitizerService {
  /**
   * Sanitizes a WorkflowExecutionResult into a secure, sanitized DTO
   * without mutating the original engine execution result.
   */
  sanitizeExecutionResult(
    rawResult: WorkflowExecutionResult,
    scenario?: WorkflowScenario,
    environment?: EnvironmentProfile
  ): SanitizedWorkflowExecutionResult {
    // 1. Collect all known secret values
    const secrets = this.collectKnownSecrets(rawResult, scenario, environment);

    // 2. Deep clone rawResult to preserve input immutability
    const cloned: WorkflowExecutionResult = JSON.parse(JSON.stringify(rawResult));

    // 3. Sanitize finalContext
    const sanitizedContext: Record<string, { value: unknown; isSecret: boolean }> = {};
    for (const [key, entry] of Object.entries(cloned.finalContext || {})) {
      if (entry.isSecret) {
        sanitizedContext[key] = {
          value: '[REDACTED]',
          isSecret: true,
        };
      } else {
        sanitizedContext[key] = {
          value: this.redactSecretsInValue(entry.value, secrets),
          isSecret: false,
        };
      }
    }

    // 4. Sanitize step results
    const sanitizedStepResults: SanitizedWorkflowStepExecutionResult[] = (cloned.stepResults || []).map(
      (stepResult) => {
        // Sanitize extracted variables
        let sanitizedExtracted: Record<string, { value: unknown; isSecret: boolean }> | undefined;
        if (stepResult.extractedVariables) {
          sanitizedExtracted = {};
          for (const [key, entry] of Object.entries(stepResult.extractedVariables)) {
            if (entry.isSecret) {
              sanitizedExtracted[key] = {
                value: '[REDACTED]',
                isSecret: true,
              };
            } else {
              sanitizedExtracted[key] = {
                value: this.redactSecretsInValue(entry.value, secrets),
                isSecret: false,
              };
            }
          }
        }

        // Sanitize request
        const sanitizedRequest = this.sanitizeStepRequest(stepResult.request, secrets);

        // Sanitize response
        let sanitizedResponse = stepResult.response;
        if (sanitizedResponse) {
          sanitizedResponse = {
            ...sanitizedResponse,
            headers: this.sanitizeResponseHeaders(sanitizedResponse.headers, secrets),
            body: this.redactSecretsInValue(sanitizedResponse.body, secrets),
          };
        }

        // Sanitize validationResult
        let sanitizedValidation = stepResult.validationResult;
        if (sanitizedValidation && sanitizedValidation.assertions) {
          sanitizedValidation = {
            ...sanitizedValidation,
            assertions: sanitizedValidation.assertions.map((assertion) => ({
              ...assertion,
              message: this.redactSecretsInString(assertion.message, secrets),
              expected: this.redactSecretsInString(assertion.expected, secrets),
              actual: this.redactSecretsInString(assertion.actual, secrets),
            })),
          };
        }

        // Sanitize errors
        let sanitizedError = stepResult.error;
        if (sanitizedError) {
          sanitizedError = {
            ...sanitizedError,
            message: this.redactSecretsInString(sanitizedError.message, secrets),
            details: sanitizedError.details
              ? this.redactSecretsInString(sanitizedError.details, secrets)
              : undefined,
          };
        }

        // Sanitize skipReason
        const sanitizedSkipReason = stepResult.skipReason
          ? this.redactSecretsInString(stepResult.skipReason, secrets)
          : undefined;

        // Sanitize extractionErrors
        const sanitizedExtractionErrors = stepResult.extractionErrors?.map((err) => ({
          targetVariable: err.targetVariable,
          message: this.redactSecretsInString(err.message, secrets),
        }));

        return {
          ...stepResult,
          request: sanitizedRequest,
          response: sanitizedResponse,
          validationResult: sanitizedValidation,
          error: sanitizedError,
          skipReason: sanitizedSkipReason,
          extractedVariables: sanitizedExtracted,
          extractionErrors: sanitizedExtractionErrors,
        };
      }
    );

    return {
      scenarioId: cloned.scenarioId,
      scenarioName: cloned.scenarioName,
      status: cloned.status,
      startedAt: cloned.startedAt,
      completedAt: cloned.completedAt,
      durationMs: cloned.durationMs,
      summary: cloned.summary,
      finalContext: sanitizedContext,
      stepResults: sanitizedStepResults,
    };
  }

  /**
   * Sanitizes a single request for preview without executing network calls.
   */
  sanitizePreviewRequest(
    interpolatedRequest: ApiRequest,
    environment?: EnvironmentProfile
  ): SanitizedApiRequest {
    const secrets = new Set<string>();

    if (environment?.variables) {
      for (const v of environment.variables) {
        if (v && v.isSecret) {
          this.addSecret(v.value, secrets);
        }
      }
    }

    if (interpolatedRequest.auth) {
      const auth = interpolatedRequest.auth;
      if (auth.type === 'bearer' && auth.token) this.addSecret(auth.token, secrets);
      if (auth.type === 'apikey' && auth.value) this.addSecret(auth.value, secrets);
      if (auth.type === 'basic' && auth.password) this.addSecret(auth.password, secrets);
    }

    return this.sanitizeStepRequest(
      {
        method: interpolatedRequest.method,
        url: interpolatedRequest.url,
        queryParams: interpolatedRequest.queryParams,
        headers: interpolatedRequest.headers,
        body: interpolatedRequest.body,
        auth: {
          type: interpolatedRequest.auth.type,
          redacted: interpolatedRequest.auth.type !== 'none',
          description:
            interpolatedRequest.auth.type === 'none'
              ? 'None'
              : `${interpolatedRequest.auth.type.toUpperCase()} [REDACTED]`,
        },
      },
      secrets
    );
  }

  /**
   * Safely adds raw and percent-encoded variants of a secret value into the secret collection set.
   */
  private addSecret(secretVal: unknown, secrets: Set<string>): void {
    if (secretVal === null || secretVal === undefined) return;
    const strVal = String(secretVal).trim();
    if (strVal.length === 0 || strVal === '[REDACTED]') return;
    secrets.add(strVal);
    try {
      const encoded = encodeURIComponent(strVal);
      if (encoded !== strVal && encoded.length > 0) {
        secrets.add(encoded);
      }
    } catch {
      // Ignore URI encoding error
    }
  }

  /**
   * Collects all known secret strings from environment, scenario, and execution results.
   */
  private collectKnownSecrets(
    rawResult: WorkflowExecutionResult,
    scenario?: WorkflowScenario,
    environment?: EnvironmentProfile
  ): Set<string> {
    const secrets = new Set<string>();

    // 1. From environment variables (including numeric/boolean values if present)
    if (environment?.variables) {
      for (const v of environment.variables) {
        if (v && v.isSecret) {
          this.addSecret(v.value, secrets);
        }
      }
    }

    // 2. From scenario requests auth
    if (scenario?.steps) {
      for (const step of scenario.steps) {
        if (step.request?.auth) {
          const auth = step.request.auth;
          if (auth.type === 'bearer' && auth.token) {
            this.addSecret(auth.token, secrets);
          }
          if (auth.type === 'apikey' && auth.value) {
            this.addSecret(auth.value, secrets);
          }
          if (auth.type === 'basic' && auth.password) {
            this.addSecret(auth.password, secrets);
          }
        }
      }
    }

    // 3. From finalContext entries where isSecret === true
    if (rawResult?.finalContext) {
      for (const entry of Object.values(rawResult.finalContext)) {
        if (entry && entry.isSecret) {
          this.addSecret(entry.value, secrets);
        }
      }
    }

    // 4. From step results extractedVariables where isSecret === true
    if (rawResult?.stepResults) {
      for (const step of rawResult.stepResults) {
        if (step.extractedVariables) {
          for (const entry of Object.values(step.extractedVariables)) {
            if (entry && entry.isSecret) {
              this.addSecret(entry.value, secrets);
            }
          }
        }
      }
    }

    return secrets;
  }

  /**
   * Sanitizes a step request object.
   */
  private sanitizeStepRequest(
    request: SanitizedApiRequest,
    secrets: Set<string>
  ): SanitizedApiRequest {
    const sanitizedHeaders: Header[] = (request.headers ?? []).map((header) => {
      const lowerKey = header.key.toLowerCase();
      if (
        lowerKey === 'authorization' ||
        lowerKey === 'x-api-key' ||
        lowerKey === 'cookie' ||
        lowerKey === 'set-cookie' ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        this.stringContainsAnySecret(header.value, secrets)
      ) {
        return {
          ...header,
          value: '[REDACTED]',
        };
      }
      return {
        ...header,
        value: this.redactSecretsInString(header.value, secrets),
      };
    });

    const sanitizedQueryParams: QueryParam[] = (request.queryParams ?? []).map((param) => {
      const lowerKey = param.key.toLowerCase();
      if (
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        this.stringContainsAnySecret(param.value, secrets)
      ) {
        return {
          ...param,
          value: '[REDACTED]',
        };
      }
      return {
        ...param,
        value: this.redactSecretsInString(param.value, secrets),
      };
    });

    let sanitizedUrl = this.redactSecretsInString(request.url, secrets);
    try {
      const parsedUrl = new URL(sanitizedUrl);
      let modified = false;
      for (const [key, val] of parsedUrl.searchParams.entries()) {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes('apikey') ||
          lowerKey.includes('api_key') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('token') ||
          lowerKey.includes('password') ||
          this.stringContainsAnySecret(val, secrets)
        ) {
          parsedUrl.searchParams.set(key, '[REDACTED]');
          modified = true;
        }
      }
      if (modified) {
        sanitizedUrl = parsedUrl.toString();
      }
    } catch {
      // Keep sanitized string URL if relative or non-URL
    }

    let sanitizedBody = request.body;
    if (typeof sanitizedBody === 'string' && sanitizedBody.trim().length > 0) {
      sanitizedBody = this.redactSecretsInString(sanitizedBody, secrets);
    }

    return {
      method: request.method,
      url: sanitizedUrl,
      queryParams: sanitizedQueryParams,
      headers: sanitizedHeaders,
      body: sanitizedBody,
      auth: {
        type: request.auth.type,
        redacted: request.auth.type !== 'none',
        description:
          request.auth.type === 'none'
            ? 'None'
            : `${request.auth.type.toUpperCase()} [REDACTED]`,
      },
    };
  }

  /**
   * Sanitizes response headers map.
   */
  private sanitizeResponseHeaders(
    headers?: Record<string, string>,
    secrets?: Set<string>
  ): Record<string, string> {
    if (!headers || typeof headers !== 'object') return {};
    const sanitized: Record<string, string> = {};
    const secretsSet = secrets || new Set<string>();

    for (const [key, val] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (
        lower === 'set-cookie' ||
        lower === 'cookie' ||
        lower === 'authorization' ||
        lower === 'x-api-key' ||
        lower.includes('token') ||
        lower.includes('secret') ||
        this.stringContainsAnySecret(String(val), secretsSet)
      ) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.redactSecretsInString(String(val), secretsSet);
      }
    }

    return sanitized;
  }

  /**
   * Recursively redacts all known secrets in an arbitrary value.
   */
  private redactSecretsInValue(val: unknown, secrets: Set<string>): unknown {
    if (secrets.size === 0 || val === null || val === undefined) {
      return val;
    }

    if (typeof val === 'string') {
      return this.redactSecretsInString(val, secrets);
    }

    if (typeof val === 'number' || typeof val === 'boolean') {
      const strVal = String(val);
      if (secrets.has(strVal)) {
        return '[REDACTED]';
      }
      return val;
    }

    if (Array.isArray(val)) {
      return val.map((item) => this.redactSecretsInValue(item, secrets));
    }

    if (typeof val === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        const lowerKey = k.toLowerCase();
        if (
          lowerKey === 'password' ||
          lowerKey === 'secret' ||
          lowerKey === 'token' ||
          lowerKey === 'apikey' ||
          lowerKey === 'api_key' ||
          lowerKey === 'access_token' ||
          lowerKey === 'refreshtoken' ||
          lowerKey === 'refresh_token' ||
          lowerKey === 'client_secret'
        ) {
          result[k] = '[REDACTED]';
        } else {
          result[k] = this.redactSecretsInValue(v, secrets);
        }
      }
      return result;
    }

    return val;
  }

  /**
   * Replaces any known secret substring in a string with [REDACTED].
   */
  private redactSecretsInString(text: string, secrets: Set<string>): string {
    if (!text || typeof text !== 'string' || secrets.size === 0) {
      return text;
    }

    let result = text;
    // Sort secrets by length descending to match longest secrets first
    const sortedSecrets = Array.from(secrets)
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .sort((a, b) => b.length - a.length);

    for (const secret of sortedSecrets) {
      if (result.includes(secret)) {
        result = result.split(secret).join('[REDACTED]');
      }
    }

    return result;
  }

  /**
   * Checks if a string contains any known secret.
   */
  private stringContainsAnySecret(text: string, secrets: Set<string>): boolean {
    if (!text || typeof text !== 'string' || secrets.size === 0) {
      return false;
    }
    for (const secret of secrets) {
      if (secret && text.includes(secret)) {
        return true;
      }
    }
    return false;
  }
}

export const workflowSanitizer = new WorkflowSanitizerService();
