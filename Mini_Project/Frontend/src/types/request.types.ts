export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'TRACE';

export interface QueryParam {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface Header {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type AuthType = 'none' | 'bearer' | 'apikey' | 'basic';

export interface BearerAuth {
  type: 'bearer';
  token: string;
}

export interface ApiKeyAuth {
  type: 'apikey';
  key: string;
  value: string;
  addTo: 'header' | 'query';
}

export interface BasicAuth {
  type: 'basic';
  username: string;
  password: string;
}

export interface NoAuth {
  type: 'none';
}

export type Auth = NoAuth | BearerAuth | ApiKeyAuth | BasicAuth;

export interface ApiRequest {
  method: HttpMethod;
  url: string;
  queryParams?: QueryParam[];
  headers?: Header[];
  body?: string | null;
  auth: Auth;
}

export interface ApiResponse {
  success: true;
  status: number;
  statusText: string;
  responseTime: number;
  headers: Record<string, string>;
  body: unknown;
  size?: number;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    type: 'VALIDATION_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_URL' | 'OUTBOUND_POLICY' | 'UNKNOWN_ERROR';
    message: string;
    details?: string;
  };
}

export type ApiExecutionResult = ApiResponse | ApiErrorResponse;
