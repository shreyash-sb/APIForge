import type { ApiResponse } from '../types/request.types.js';
import type { ExtractorSource, ResponseExtractor } from '../types/workflow.types.js';

export type ExtractionErrorCode =
  | 'INVALID_EXTRACTOR'
  | 'MALFORMED_PATH'
  | 'UNSUPPORTED_SYNTAX'
  | 'PROTOTYPE_POLLUTION_ATTEMPT'
  | 'PATH_DEPTH_EXCEEDED'
  | 'INVALID_ARRAY_INDEX'
  | 'PROPERTY_NOT_FOUND'
  | 'ARRAY_INDEX_OUT_OF_BOUNDS'
  | 'NON_JSON_BODY'
  | 'HEADER_NOT_FOUND'
  | 'UNSUPPORTED_SOURCE';

export interface ExtractionResult {
  targetVariable: string;
  source: ExtractorSource;
  path?: string;
  success: boolean;
  value?: unknown;
  isSecret: boolean;
  error?: {
    code: ExtractionErrorCode;
    message: string;
    details?: string;
  };
}

export interface BatchExtractionSummary {
  allSuccessful: boolean;
  total: number;
  successfulCount: number;
  failedCount: number;
  results: ExtractionResult[];
  context: Record<string, { value: unknown; isSecret: boolean }>;
}

const MAX_PATH_SEGMENTS = 15;
const MAX_ARRAY_INDEX = 10000;
const FORBIDDEN_PROPERTIES = new Set(['__proto__', 'prototype', 'constructor']);

type PathSegment = { type: 'property'; key: string } | { type: 'index'; index: number };

export class ResponseExtractorService {
  /**
   * Extracts a value from an HTTP response according to a single ResponseExtractor definition.
   */
  extract(extractor: ResponseExtractor, response: ApiResponse): ExtractionResult {
    const isSecret = Boolean(extractor.isSecret);

    if (!extractor || !extractor.targetVariable || typeof extractor.targetVariable !== 'string') {
      return {
        targetVariable: extractor?.targetVariable || 'unknown',
        source: extractor?.source || 'BODY_JSONPATH',
        path: extractor?.path,
        success: false,
        isSecret,
        error: {
          code: 'INVALID_EXTRACTOR',
          message: 'Extractor definition is missing a valid targetVariable identifier.',
        },
      };
    }

    if (!extractor.source) {
      return {
        targetVariable: extractor.targetVariable,
        source: extractor.source,
        path: extractor.path,
        success: false,
        isSecret,
        error: {
          code: 'UNSUPPORTED_SOURCE',
          message: 'Extractor definition missing required source type.',
        },
      };
    }

    switch (extractor.source) {
      case 'STATUS_CODE':
        return this.extractStatusCode(extractor, response);
      case 'HEADER':
        return this.extractHeader(extractor, response);
      case 'BODY_JSONPATH':
        return this.extractBodyJsonPath(extractor, response);
      default:
        return {
          targetVariable: extractor.targetVariable,
          source: extractor.source,
          path: extractor.path,
          success: false,
          isSecret,
          error: {
            code: 'UNSUPPORTED_SOURCE',
            message: `Unsupported extraction source '${String(extractor.source)}'.`,
          },
        };
    }
  }

  /**
   * Batch extraction utility for a list of extractors against a single response.
   */
  extractAll(extractors: ResponseExtractor[], response: ApiResponse): BatchExtractionSummary {
    const results: ExtractionResult[] = [];
    const context: Record<string, { value: unknown; isSecret: boolean }> = {};

    for (const extractor of extractors) {
      const result = this.extract(extractor, response);
      results.push(result);
      if (result.success && result.value !== undefined) {
        context[result.targetVariable] = {
          value: result.value,
          isSecret: result.isSecret,
        };
      }
    }

    const successfulCount = results.filter((r) => r.success).length;
    const failedCount = results.length - successfulCount;

    return {
      allSuccessful: failedCount === 0,
      total: results.length,
      successfulCount,
      failedCount,
      results,
      context,
    };
  }

  /**
   * Extract HTTP status code
   */
  private extractStatusCode(extractor: ResponseExtractor, response: ApiResponse): ExtractionResult {
    const isSecret = Boolean(extractor.isSecret);
    if (response.status === undefined || response.status === null) {
      if (extractor.defaultValue !== undefined) {
        return {
          targetVariable: extractor.targetVariable,
          source: 'STATUS_CODE',
          success: true,
          value: extractor.defaultValue,
          isSecret,
        };
      }
      return {
        targetVariable: extractor.targetVariable,
        source: 'STATUS_CODE',
        success: false,
        isSecret,
        error: {
          code: 'PROPERTY_NOT_FOUND',
          message: 'Response status code is missing or unavailable.',
        },
      };
    }

    return {
      targetVariable: extractor.targetVariable,
      source: 'STATUS_CODE',
      success: true,
      value: response.status,
      isSecret,
    };
  }

  /**
   * Extract response header with case-insensitive matching
   */
  private extractHeader(extractor: ResponseExtractor, response: ApiResponse): ExtractionResult {
    const isSecret = Boolean(extractor.isSecret);
    const headerName = extractor.path?.trim();

    if (!headerName) {
      return {
        targetVariable: extractor.targetVariable,
        source: 'HEADER',
        path: extractor.path,
        success: false,
        isSecret,
        error: {
          code: 'INVALID_EXTRACTOR',
          message: 'Header extractor definition must specify the header name in path.',
        },
      };
    }

    const headers = response.headers;
    if (!headers || typeof headers !== 'object') {
      if (extractor.defaultValue !== undefined) {
        return {
          targetVariable: extractor.targetVariable,
          source: 'HEADER',
          path: headerName,
          success: true,
          value: extractor.defaultValue,
          isSecret,
        };
      }
      return {
        targetVariable: extractor.targetVariable,
        source: 'HEADER',
        path: headerName,
        success: false,
        isSecret,
        error: {
          code: 'HEADER_NOT_FOUND',
          message: `Header '${headerName}' not found in response headers.`,
        },
      };
    }

    // Case-insensitive header lookup
    const targetLower = headerName.toLowerCase();
    let matchedValue: string | undefined;

    for (const [key, val] of Object.entries(headers)) {
      if (key.toLowerCase() === targetLower) {
        matchedValue = val;
        break;
      }
    }

    if (matchedValue !== undefined) {
      return {
        targetVariable: extractor.targetVariable,
        source: 'HEADER',
        path: headerName,
        success: true,
        value: matchedValue,
        isSecret,
      };
    }

    if (extractor.defaultValue !== undefined) {
      return {
        targetVariable: extractor.targetVariable,
        source: 'HEADER',
        path: headerName,
        success: true,
        value: extractor.defaultValue,
        isSecret,
      };
    }

    return {
      targetVariable: extractor.targetVariable,
      source: 'HEADER',
      path: headerName,
      success: false,
      isSecret,
      error: {
        code: 'HEADER_NOT_FOUND',
        message: `Header '${headerName}' was not present in the response.`,
      },
    };
  }

  /**
   * Extract value from JSON response body using deterministic JSONPath segment walker
   */
  private extractBodyJsonPath(extractor: ResponseExtractor, response: ApiResponse): ExtractionResult {
    const isSecret = Boolean(extractor.isSecret);
    const rawPath = extractor.path?.trim();

    if (!rawPath) {
      return {
        targetVariable: extractor.targetVariable,
        source: 'BODY_JSONPATH',
        path: rawPath,
        success: false,
        isSecret,
        error: {
          code: 'INVALID_EXTRACTOR',
          message: 'JSONPath extractor requires a valid path expression.',
        },
      };
    }

    // Parse path segments
    let segments: PathSegment[];
    try {
      segments = this.parsePathSegments(rawPath);
    } catch (err) {
      if (err instanceof ExtractionPathError) {
        return {
          targetVariable: extractor.targetVariable,
          source: 'BODY_JSONPATH',
          path: rawPath,
          success: false,
          isSecret,
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        };
      }
      return {
        targetVariable: extractor.targetVariable,
        source: 'BODY_JSONPATH',
        path: rawPath,
        success: false,
        isSecret,
        error: {
          code: 'MALFORMED_PATH',
          message: `Failed to parse path expression '${rawPath}'.`,
        },
      };
    }

    // Parse / get response body as JavaScript object/array
    let bodyData = response.body;
    if (typeof bodyData === 'string') {
      try {
        bodyData = JSON.parse(bodyData);
      } catch {
        if (extractor.defaultValue !== undefined) {
          return {
            targetVariable: extractor.targetVariable,
            source: 'BODY_JSONPATH',
            path: rawPath,
            success: true,
            value: extractor.defaultValue,
            isSecret,
          };
        }
        return {
          targetVariable: extractor.targetVariable,
          source: 'BODY_JSONPATH',
          path: rawPath,
          success: false,
          isSecret,
          error: {
            code: 'NON_JSON_BODY',
            message: 'Response body is not a valid JSON structure.',
          },
        };
      }
    }

    if (bodyData === undefined || bodyData === null || typeof bodyData !== 'object') {
      if (extractor.defaultValue !== undefined) {
        return {
          targetVariable: extractor.targetVariable,
          source: 'BODY_JSONPATH',
          path: rawPath,
          success: true,
          value: extractor.defaultValue,
          isSecret,
        };
      }
      return {
        targetVariable: extractor.targetVariable,
        source: 'BODY_JSONPATH',
        path: rawPath,
        success: false,
        isSecret,
        error: {
          code: 'PROPERTY_NOT_FOUND',
          message: 'Response body is empty or not an object/array.',
        },
      };
    }

    // Traverse segments
    let current: unknown = bodyData;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      if (current === null || current === undefined || typeof current !== 'object') {
        if (extractor.defaultValue !== undefined) {
          return {
            targetVariable: extractor.targetVariable,
            source: 'BODY_JSONPATH',
            path: rawPath,
            success: true,
            value: extractor.defaultValue,
            isSecret,
          };
        }
        return {
          targetVariable: extractor.targetVariable,
          source: 'BODY_JSONPATH',
          path: rawPath,
          success: false,
          isSecret,
          error: {
            code: 'PROPERTY_NOT_FOUND',
            message: `Cannot access path segment at index ${i} because parent value is not an object or array.`,
          },
        };
      }

      if (seg.type === 'property') {
        if (Array.isArray(current)) {
          if (extractor.defaultValue !== undefined) {
            return {
              targetVariable: extractor.targetVariable,
              source: 'BODY_JSONPATH',
              path: rawPath,
              success: true,
              value: extractor.defaultValue,
              isSecret,
            };
          }
          return {
            targetVariable: extractor.targetVariable,
            source: 'BODY_JSONPATH',
            path: rawPath,
            success: false,
            isSecret,
            error: {
              code: 'PROPERTY_NOT_FOUND',
              message: `Cannot access property '${seg.key}' on an array. Array index expected.`,
            },
          };
        }

        const obj = current as Record<string, unknown>;
        if (!Object.prototype.hasOwnProperty.call(obj, seg.key)) {
          if (extractor.defaultValue !== undefined) {
            return {
              targetVariable: extractor.targetVariable,
              source: 'BODY_JSONPATH',
              path: rawPath,
              success: true,
              value: extractor.defaultValue,
              isSecret,
            };
          }
          return {
            targetVariable: extractor.targetVariable,
            source: 'BODY_JSONPATH',
            path: rawPath,
            success: false,
            isSecret,
            error: {
              code: 'PROPERTY_NOT_FOUND',
              message: `Property '${seg.key}' does not exist in response object.`,
            },
          };
        }
        current = obj[seg.key];
      } else if (seg.type === 'index') {
        if (!Array.isArray(current)) {
          if (extractor.defaultValue !== undefined) {
            return {
              targetVariable: extractor.targetVariable,
              source: 'BODY_JSONPATH',
              path: rawPath,
              success: true,
              value: extractor.defaultValue,
              isSecret,
            };
          }
          return {
            targetVariable: extractor.targetVariable,
            source: 'BODY_JSONPATH',
            path: rawPath,
            success: false,
            isSecret,
            error: {
              code: 'PROPERTY_NOT_FOUND',
              message: `Cannot apply array index '[${seg.index}]' to a non-array value.`,
            },
          };
        }

        if (seg.index < 0 || seg.index >= current.length) {
          if (extractor.defaultValue !== undefined) {
            return {
              targetVariable: extractor.targetVariable,
              source: 'BODY_JSONPATH',
              path: rawPath,
              success: true,
              value: extractor.defaultValue,
              isSecret,
            };
          }
          return {
            targetVariable: extractor.targetVariable,
            source: 'BODY_JSONPATH',
            path: rawPath,
            success: false,
            isSecret,
            error: {
              code: 'ARRAY_INDEX_OUT_OF_BOUNDS',
              message: `Array index '[${seg.index}]' is out of bounds (array length: ${current.length}).`,
            },
          };
        }
        current = current[seg.index];
      }
    }

    return {
      targetVariable: extractor.targetVariable,
      source: 'BODY_JSONPATH',
      path: rawPath,
      success: true,
      value: current,
      isSecret,
    };
  }

  /**
   * Deterministically parses a path string into an ordered sequence of PathSegments
   */
  private parsePathSegments(path: string): PathSegment[] {
    let normalized = path.trim();

    // Check for unsupported wildcard or complex expressions
    if (normalized.includes('..') || normalized.includes('*') || normalized.includes('?') || normalized.includes(':')) {
      throw new ExtractionPathError(
        `Unsupported JSONPath syntax in '${path}'. Recursive descent, wildcards, slices, and filters are not permitted.`,
        'UNSUPPORTED_SYNTAX'
      );
    }

    // Strip leading '$'
    if (normalized.startsWith('$')) {
      normalized = normalized.slice(1);
    }

    if (normalized.startsWith('.')) {
      normalized = normalized.slice(1);
    }

    if (!normalized) {
      throw new ExtractionPathError(
        `Path '${path}' does not specify any property or index to extract.`,
        'MALFORMED_PATH'
      );
    }

    const segments: PathSegment[] = [];
    let buffer = '';
    let inBracket = false;

    for (let i = 0; i < normalized.length; i++) {
      const ch = normalized[i];

      if (ch === '[') {
        if (inBracket) {
          throw new ExtractionPathError(
            `Malformed path '${path}': unexpected nested '['.`,
            'MALFORMED_PATH'
          );
        }
        if (buffer.length > 0) {
          this.validateAndPushProperty(buffer, segments, path);
          buffer = '';
        }
        inBracket = true;
      } else if (ch === ']') {
        if (!inBracket) {
          throw new ExtractionPathError(
            `Malformed path '${path}': unexpected closing ']' without opening.`,
            'MALFORMED_PATH'
          );
        }
        inBracket = false;
        const indexStr = buffer.trim();
        buffer = '';

        if (!/^\d+$/.test(indexStr)) {
          throw new ExtractionPathError(
            `Invalid array index '[${indexStr}]' in path '${path}'. Index must be a non-negative integer.`,
            'INVALID_ARRAY_INDEX'
          );
        }

        const indexNum = parseInt(indexStr, 10);
        if (indexNum > MAX_ARRAY_INDEX) {
          throw new ExtractionPathError(
            `Array index '[${indexNum}]' exceeds maximum allowed index limit of ${MAX_ARRAY_INDEX}.`,
            'INVALID_ARRAY_INDEX'
          );
        }
        segments.push({ type: 'index', index: indexNum });
      } else if (ch === '.') {
        if (inBracket) {
          throw new ExtractionPathError(
            `Malformed path '${path}': unexpected '.' inside bracket index.`,
            'MALFORMED_PATH'
          );
        }
        if (buffer.length > 0) {
          this.validateAndPushProperty(buffer, segments, path);
          buffer = '';
        } else if (i === 0 || normalized[i - 1] === '.') {
          throw new ExtractionPathError(
            `Malformed path '${path}': duplicate or consecutive dot separators.`,
            'MALFORMED_PATH'
          );
        }
      } else {
        buffer += ch;
      }
    }

    if (inBracket) {
      throw new ExtractionPathError(
        `Malformed path '${path}': unclosed bracket index.`,
        'MALFORMED_PATH'
      );
    }

    if (buffer.length > 0) {
      this.validateAndPushProperty(buffer, segments, path);
    }

    if (segments.length === 0) {
      throw new ExtractionPathError(
        `Path '${path}' contains no valid property or index segments.`,
        'MALFORMED_PATH'
      );
    }

    if (segments.length > MAX_PATH_SEGMENTS) {
      throw new ExtractionPathError(
        `Path '${path}' depth of ${segments.length} exceeds maximum allowed limit of ${MAX_PATH_SEGMENTS} segments.`,
        'PATH_DEPTH_EXCEEDED'
      );
    }

    return segments;
  }

  private validateAndPushProperty(prop: string, segments: PathSegment[], fullPath: string): void {
    const trimmed = prop.trim();
    if (!trimmed) {
      throw new ExtractionPathError(
        `Malformed property segment in path '${fullPath}'.`,
        'MALFORMED_PATH'
      );
    }

    if (FORBIDDEN_PROPERTIES.has(trimmed.toLowerCase())) {
      throw new ExtractionPathError(
        `Forbidden property access '${trimmed}' in path '${fullPath}'. Prototype access is blocked for security.`,
        'PROTOTYPE_POLLUTION_ATTEMPT'
      );
    }

    if (!/^[a-zA-Z0-9_$-]+$/.test(trimmed)) {
      throw new ExtractionPathError(
        `Invalid characters in property name '${trimmed}' in path '${fullPath}'.`,
        'MALFORMED_PATH'
      );
    }

    segments.push({ type: 'property', key: trimmed });
  }
}

class ExtractionPathError extends Error {
  readonly code: ExtractionErrorCode;
  readonly details?: string;

  constructor(message: string, code: ExtractionErrorCode, details?: string) {
    super(message);
    this.name = 'ExtractionPathError';
    this.code = code;
    this.details = details;
  }
}

export const responseExtractor = new ResponseExtractorService();
