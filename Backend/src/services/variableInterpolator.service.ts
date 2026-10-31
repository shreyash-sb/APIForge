import type {
  ApiRequest,
  Auth,
  Header,
  QueryParam,
} from '../types/request.types.js';
import type {
  EnvironmentProfile,
  EnvironmentVariable,
} from '../types/workflow.types.js';

export type VariableErrorCode =
  | 'UNRESOLVED_VARIABLE'
  | 'MALFORMED_VARIABLE_SYNTAX'
  | 'INVALID_VARIABLE_NAME'
  | 'CYCLIC_VARIABLE'
  | 'MAX_DEPTH_EXCEEDED'
  | 'INVALID_CONTEXT';

export class VariableInterpolationError extends Error {
  readonly code: VariableErrorCode;
  readonly variableName?: string;
  readonly details?: string;

  constructor(
    message: string,
    code: VariableErrorCode,
    variableName?: string,
    details?: string
  ) {
    super(message);
    this.name = 'VariableInterpolationError';
    this.code = code;
    this.variableName = variableName;
    this.details = details;
  }
}

export interface VariableEntry {
  value: unknown;
  isSecret: boolean;
  description?: string;
}

export type VariableContextInput =
  | Record<string, unknown>
  | Record<string, VariableEntry>
  | EnvironmentVariable[]
  | EnvironmentProfile
  | Map<string, VariableEntry | unknown>;

export interface InterpolationOptions {
  maxDepth?: number;
  strict?: boolean; // if true, throws on unresolved variable
}

export interface InterpolationResult<T> {
  value: T;
  resolvedVariables: string[];
  containsSecret: boolean;
}

const DEFAULT_MAX_DEPTH = 5;
const TOKEN_REGEX = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;
const EXACT_TOKEN_REGEX = /^{{\s*([a-zA-Z0-9_.-]+)\s*}}$/;
const VALID_VAR_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

export class VariableInterpolatorService {
  private readonly maxDepth: number;

  constructor(maxDepth: number = DEFAULT_MAX_DEPTH) {
    this.maxDepth = maxDepth;
  }

  /**
   * Normalizes any supported context format into a standard Map<string, VariableEntry>
   */
  normalizeContext(input?: VariableContextInput): Map<string, VariableEntry> {
    const map = new Map<string, VariableEntry>();
    if (!input) return map;

    if (input instanceof Map) {
      for (const [key, val] of input.entries()) {
        if (!key || typeof key !== 'string') continue;
        if (val && typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
          const entry = val as VariableEntry;
          map.set(key, {
            value: entry.value,
            isSecret: Boolean(entry.isSecret),
            description: entry.description,
          });
        } else {
          map.set(key, { value: val, isSecret: false });
        }
      }
      return map;
    }

    // EnvironmentProfile
    if ('variables' in input && Array.isArray((input as EnvironmentProfile).variables)) {
      const profile = input as EnvironmentProfile;
      if (profile.baseUrl) {
        map.set('baseUrl', { value: profile.baseUrl, isSecret: false });
      }
      for (const v of profile.variables) {
        if (v && v.enabled !== false && v.name) {
          map.set(v.name, {
            value: v.value,
            isSecret: Boolean(v.isSecret),
            description: v.description,
          });
        }
      }
      return map;
    }

    // EnvironmentVariable[]
    if (Array.isArray(input)) {
      for (const v of input) {
        if (v && typeof v.name === 'string' && v.enabled !== false) {
          map.set(v.name, {
            value: v.value,
            isSecret: Boolean(v.isSecret),
            description: v.description,
          });
        }
      }
      return map;
    }

    // Plain Record or Record<string, VariableEntry>
    if (typeof input === 'object') {
      for (const [key, val] of Object.entries(input)) {
        if (val && typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
          const entry = val as VariableEntry;
          map.set(key, {
            value: entry.value,
            isSecret: Boolean(entry.isSecret),
            description: entry.description,
          });
        } else {
          map.set(key, { value: val, isSecret: false });
        }
      }
      return map;
    }

    throw new VariableInterpolationError(
      'Invalid variable context supplied.',
      'INVALID_CONTEXT'
    );
  }

  /**
   * Interpolates an entire ApiRequest, returning a new immutable ApiRequest copy
   */
  interpolateRequest(
    request: ApiRequest,
    contextInput?: VariableContextInput,
    options: InterpolationOptions = {}
  ): InterpolationResult<ApiRequest> {
    const context = this.normalizeContext(contextInput);
    const resolvedVariables = new Set<string>();
    let containsSecret = false;

    // 1. Interpolate URL
    const urlRes = this.interpolateString(request.url, context, options);
    urlRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
    if (urlRes.containsSecret) containsSecret = true;

    // 2. Interpolate Query Params
    let queryParams: QueryParam[] | undefined;
    if (request.queryParams && request.queryParams.length > 0) {
      queryParams = request.queryParams.map((p) => {
        const keyRes = this.interpolateString(p.key, context, options);
        const valRes = this.interpolateString(p.value, context, options);
        keyRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
        valRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
        if (keyRes.containsSecret || valRes.containsSecret) containsSecret = true;
        return {
          key: keyRes.value,
          value: valRes.value,
          enabled: p.enabled,
        };
      });
    }

    // 3. Interpolate Headers
    let headers: Header[] | undefined;
    if (request.headers && request.headers.length > 0) {
      headers = request.headers.map((h) => {
        const keyRes = this.interpolateString(h.key, context, options);
        const valRes = this.interpolateString(h.value, context, options);
        keyRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
        valRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
        if (keyRes.containsSecret || valRes.containsSecret) containsSecret = true;
        return {
          key: keyRes.value,
          value: valRes.value,
          enabled: h.enabled,
        };
      });
    }

    // 4. Interpolate Auth
    const authRes = this.interpolateAuth(request.auth, context, options);
    authRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
    if (authRes.containsSecret) containsSecret = true;

    // 5. Interpolate Body
    let body: string | null | undefined = request.body;
    if (typeof request.body === 'string' && request.body.trim() !== '') {
      const bodyRes = this.interpolateBody(request.body, context, options);
      body = bodyRes.value;
      bodyRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
      if (bodyRes.containsSecret) containsSecret = true;
    }

    return {
      value: {
        method: request.method,
        url: urlRes.value,
        queryParams,
        headers,
        auth: authRes.value,
        body,
      },
      resolvedVariables: Array.from(resolvedVariables),
      containsSecret,
    };
  }

  /**
   * Interpolates an Auth configuration
   */
  interpolateAuth(
    auth: Auth,
    contextInput?: VariableContextInput,
    options: InterpolationOptions = {}
  ): InterpolationResult<Auth> {
    const context = this.normalizeContext(contextInput);
    const resolvedVariables = new Set<string>();
    const containsSecret = false;

    if (auth.type === 'bearer') {
      const tokenRes = this.interpolateString(auth.token, context, options);
      tokenRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
      return {
        value: { type: 'bearer', token: tokenRes.value },
        resolvedVariables: Array.from(resolvedVariables),
        containsSecret: tokenRes.containsSecret || containsSecret,
      };
    }

    if (auth.type === 'apikey') {
      const keyRes = this.interpolateString(auth.key, context, options);
      const valRes = this.interpolateString(auth.value, context, options);
      keyRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
      valRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
      return {
        value: { type: 'apikey', key: keyRes.value, value: valRes.value, addTo: auth.addTo },
        resolvedVariables: Array.from(resolvedVariables),
        containsSecret: keyRes.containsSecret || valRes.containsSecret || containsSecret,
      };
    }

    if (auth.type === 'basic') {
      const userRes = this.interpolateString(auth.username, context, options);
      const passRes = this.interpolateString(auth.password, context, options);
      userRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
      passRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
      return {
        value: { type: 'basic', username: userRes.value, password: passRes.value },
        resolvedVariables: Array.from(resolvedVariables),
        containsSecret: userRes.containsSecret || passRes.containsSecret || containsSecret,
      };
    }

    return {
      value: { type: 'none' },
      resolvedVariables: [],
      containsSecret: false,
    };
  }

  /**
   * Interpolates a JSON body preserving numeric, boolean, null, and object types
   */
  interpolateBody(
    bodyStr: string,
    contextInput?: VariableContextInput,
    options: InterpolationOptions = {}
  ): InterpolationResult<string> {
    const context = this.normalizeContext(contextInput);
    try {
      const parsed = JSON.parse(bodyStr);
      const res = this.interpolateAnyValue(parsed, context, options, 0, new Set());
      return {
        value: JSON.stringify(res.value, null, 2),
        resolvedVariables: res.resolvedVariables,
        containsSecret: res.containsSecret,
      };
    } catch {
      // Non-JSON plain text body
      return this.interpolateString(bodyStr, context, options);
    }
  }

  /**
   * Interpolates a single string template
   */
  interpolateString(
    template: string,
    contextInput?: VariableContextInput,
    options: InterpolationOptions = {}
  ): InterpolationResult<string> {
    if (!template || typeof template !== 'string') {
      return { value: template, resolvedVariables: [], containsSecret: false };
    }

    this.validateTemplateSyntax(template);
    const context = this.normalizeContext(contextInput);

    const resolvedVariables = new Set<string>();
    let containsSecret = false;

    const resolved = this.expandString(
      template,
      context,
      options,
      0,
      new Set(),
      resolvedVariables,
      (isSec) => {
        if (isSec) containsSecret = true;
      }
    );

    return {
      value: resolved,
      resolvedVariables: Array.from(resolvedVariables),
      containsSecret,
    };
  }

  /**
   * Interpolates an arbitrary JavaScript value (object, array, primitive), preserving native types
   */
  interpolateAnyValue(
    value: unknown,
    contextInput?: VariableContextInput,
    options: InterpolationOptions = {},
    depth = 0,
    activePath = new Set<string>()
  ): InterpolationResult<unknown> {
    const context = this.normalizeContext(contextInput);
    const resolvedVariables = new Set<string>();
    let containsSecret = false;

    if (value === null || value === undefined) {
      return { value, resolvedVariables: [], containsSecret: false };
    }

    if (typeof value === 'string') {
      this.validateTemplateSyntax(value);

      // Check for exact single token: "{{varName}}"
      const exactMatch = value.match(EXACT_TOKEN_REGEX);
      if (exactMatch) {
        const varName = exactMatch[1].trim();
        const resolved = this.resolveVariable(varName, context, options, depth, activePath);
        resolvedVariables.add(varName);
        if (resolved.entry.isSecret) containsSecret = true;

        // If the variable's value itself is a string with tokens, expand further
        if (typeof resolved.entry.value === 'string' && resolved.entry.value.includes('{{')) {
          const nextRes = this.interpolateAnyValue(
            resolved.entry.value,
            context,
            options,
            depth + 1,
            new Set([...activePath, varName])
          );
          nextRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
          return {
            value: nextRes.value,
            resolvedVariables: Array.from(resolvedVariables),
            containsSecret: containsSecret || nextRes.containsSecret,
          };
        }

        return {
          value: this.deepClone(resolved.entry.value),
          resolvedVariables: Array.from(resolvedVariables),
          containsSecret,
        };
      }

      // String with embedded tokens: "prefix {{varName}} suffix"
      const strRes = this.interpolateString(value, context, options);
      strRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
      return {
        value: strRes.value,
        resolvedVariables: Array.from(resolvedVariables),
        containsSecret: strRes.containsSecret,
      };
    }

    if (Array.isArray(value)) {
      const arr: unknown[] = [];
      for (const item of value) {
        const itemRes = this.interpolateAnyValue(item, context, options, depth, activePath);
        arr.push(itemRes.value);
        itemRes.resolvedVariables.forEach((v) => resolvedVariables.add(v));
        if (itemRes.containsSecret) containsSecret = true;
      }
      return {
        value: arr,
        resolvedVariables: Array.from(resolvedVariables),
        containsSecret,
      };
    }

    if (typeof value === 'object') {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        // Interpolate object keys if they contain tokens
        const keyRes = this.interpolateString(k, context, options);
        keyRes.resolvedVariables.forEach((varKey) => resolvedVariables.add(varKey));
        if (keyRes.containsSecret) containsSecret = true;

        const valRes = this.interpolateAnyValue(v, context, options, depth, activePath);
        valRes.resolvedVariables.forEach((varKey) => resolvedVariables.add(varKey));
        if (valRes.containsSecret) containsSecret = true;

        obj[keyRes.value] = valRes.value;
      }
      return {
        value: obj,
        resolvedVariables: Array.from(resolvedVariables),
        containsSecret,
      };
    }

    // Primitives (number, boolean)
    return {
      value,
      resolvedVariables: [],
      containsSecret: false,
    };
  }

  /**
   * Recursively expands strings containing {{var}} tokens
   */
  private expandString(
    str: string,
    context: Map<string, VariableEntry>,
    options: InterpolationOptions,
    depth: number,
    activePath: Set<string>,
    collectedVars: Set<string>,
    markSecret: (isSecret: boolean) => void
  ): string {
    const limit = options.maxDepth ?? this.maxDepth;
    if (depth > limit) {
      throw new VariableInterpolationError(
        `Variable expansion exceeded maximum allowed depth of ${limit}.`,
        'MAX_DEPTH_EXCEEDED'
      );
    }

    return str.replace(TOKEN_REGEX, (_match, rawVarName) => {
      const varName = rawVarName.trim();
      collectedVars.add(varName);

      if (activePath.has(varName)) {
        throw new VariableInterpolationError(
          `Cyclic variable reference detected: '${Array.from(activePath).join(' -> ')} -> ${varName}'.`,
          'CYCLIC_VARIABLE',
          varName
        );
      }

      const { entry, isUnresolved } = this.resolveVariable(varName, context, options, depth, activePath);
      if (entry.isSecret) markSecret(true);

      if (isUnresolved) {
        return `{{${varName}}}`;
      }

      const val = entry.value;
      let stringified: string;

      if (val === null) {
        stringified = 'null';
      } else if (val === undefined) {
        stringified = '';
      } else if (typeof val === 'object') {
        stringified = JSON.stringify(val);
      } else {
        stringified = String(val);
      }

      // If resolved string itself contains {{, expand recursively
      if (stringified.includes('{{')) {
        const nextPath = new Set(activePath);
        nextPath.add(varName);
        return this.expandString(
          stringified,
          context,
          options,
          depth + 1,
          nextPath,
          collectedVars,
          markSecret
        );
      }

      return stringified;
    });
  }

  /**
   * Resolves a single variable name from context with validation
   */
  private resolveVariable(
    varName: string,
    context: Map<string, VariableEntry>,
    options: InterpolationOptions,
    depth: number,
    _activePath: Set<string>
  ): { entry: VariableEntry; isUnresolved?: boolean } {
    if (!varName || !VALID_VAR_NAME_REGEX.test(varName)) {
      throw new VariableInterpolationError(
        `Invalid variable name '${varName}'. Variable names must be alphanumeric and may include '.', '-', or '_'.`,
        'INVALID_VARIABLE_NAME',
        varName
      );
    }

    if (!context.has(varName)) {
      const isStrict = options.strict !== false;
      if (isStrict) {
        throw new VariableInterpolationError(
          `Unresolved variable '{{${varName}}}'. Variable is not defined in active environment or context.`,
          'UNRESOLVED_VARIABLE',
          varName
        );
      }
      return { entry: { value: `{{${varName}}}`, isSecret: false }, isUnresolved: true };
    }

    const limit = options.maxDepth ?? this.maxDepth;
    if (depth > limit) {
      throw new VariableInterpolationError(
        `Variable expansion exceeded maximum allowed depth of ${limit}.`,
        'MAX_DEPTH_EXCEEDED',
        varName
      );
    }

    const entry = context.get(varName)!;
    return { entry };
  }

  /**
   * Validates malformed template syntax (e.g. unclosed {{, empty {{}}, or invalid variable characters)
   */
  private validateTemplateSyntax(template: string): void {
    if (!template.includes('{{') && !template.includes('}}')) return;

    // Check unclosed or unopened braces
    const openCount = (template.match(/{{/g) || []).length;
    const closeCount = (template.match(/}}/g) || []).length;

    if (openCount !== closeCount) {
      throw new VariableInterpolationError(
        'Malformed template syntax: unmatched opening or closing braces.',
        'MALFORMED_VARIABLE_SYNTAX'
      );
    }

    // Check empty token: {{}} or {{   }}
    if (/{{\s*}}/.test(template)) {
      throw new VariableInterpolationError(
        'Malformed template syntax: empty variable token {{}}.',
        'MALFORMED_VARIABLE_SYNTAX'
      );
    }

    // Check all tokens inside {{ ... }}
    const allTokens = template.matchAll(/{{\s*([^}]+)\s*}}/g);
    for (const match of allTokens) {
      const tokenContent = match[1].trim();
      if (!VALID_VAR_NAME_REGEX.test(tokenContent)) {
        throw new VariableInterpolationError(
          `Invalid variable name '${tokenContent}'. Variable names must be alphanumeric and may include '.', '-', or '_'.`,
          'INVALID_VARIABLE_NAME',
          tokenContent
        );
      }
    }
  }

  /**
   * Deep clone utility to guarantee input immutability
   */
  private deepClone<T>(val: T): T {
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) {
      return val.map((item) => this.deepClone(item)) as unknown as T;
    }
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      copy[k] = this.deepClone(v);
    }
    return copy as T;
  }
}

export const variableInterpolator = new VariableInterpolatorService();
