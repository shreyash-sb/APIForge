/**
 * Frontend Environment Variable model
 */
export interface FrontendEnvironmentVariable {
  name: string;
  value: string;
  isSecret: boolean;
  enabled?: boolean;
  description?: string;
}

/**
 * Frontend Environment Profile model
 */
export interface FrontendEnvironmentProfile {
  id: string;
  name: string;
  description?: string;
  baseUrl?: string;
  variables: FrontendEnvironmentVariable[];
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Active environment selection and runtime variable context representation
 */
export interface EnvironmentState {
  profiles: FrontendEnvironmentProfile[];
  activeProfileId?: string;
}

/**
 * Utility helper to mask secret variable values for UI display
 */
export function maskSecretValue(value: string): string {
  if (!value) return '';
  return '••••••••';
}
