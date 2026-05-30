// Error handling — see docs/06-errors.md.

export interface MyJDownloaderError {
  src?: string;
  type: string;
  data?: unknown;
}

// Error types that mean the session/token is stale and we should reconnect
// once before giving up (docs §2.5 / §6.4).
const TOKEN_ERROR_TYPES = new Set([
  'TOKEN_INVALID',
  'SESSION',
  'SESSION_EXPIRED',
]);

// Error types that warrant an exponential backoff retry (docs §6.4).
const BACKOFF_ERROR_TYPES = new Set([
  'OVERLOAD',
  'TOO_MANY_REQUESTS',
  'MAINTENANCE',
  'INTERNAL_SERVER_ERROR',
]);

// Authentication errors the user must fix; never auto-retry (docs §6.4).
const AUTH_ERROR_TYPES = new Set([
  'AUTH_FAILED',
  'EMAIL_INVALID',
  'EMAIL_FORBIDDEN',
  'ERROR_EMAIL_NOT_CONFIRMED',
]);

export class ApiError extends Error {
  readonly type: string;
  readonly src: string;
  readonly data: unknown;

  constructor(type: string, src = 'UNKNOWN', data: unknown = null) {
    super(`API Error: ${type}`);
    this.name = 'ApiError';
    this.type = type;
    this.src = src;
    this.data = data;
  }
}

// A purely client-side problem (no/expired credentials, undecryptable response).
export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

export function isTokenError(error: unknown): boolean {
  return error instanceof ApiError && TOKEN_ERROR_TYPES.has(error.type);
}

export function isBackoffError(error: unknown): boolean {
  return error instanceof ApiError && BACKOFF_ERROR_TYPES.has(error.type);
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && AUTH_ERROR_TYPES.has(error.type);
}

// Detect both error shapes from docs §6.1:
//   { error: { src, type, data } }
//   { src, type, data, rid }
// Returns null when the payload is a normal (non-error) result.
export function parseErrorShape(payload: unknown): MyJDownloaderError | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const obj = payload as Record<string, unknown>;
  if (
    typeof obj.error === 'object' &&
    obj.error !== null &&
    typeof (obj.error as Record<string, unknown>).type === 'string'
  ) {
    return obj.error as MyJDownloaderError;
  }
  if (typeof obj.type === 'string' && 'src' in obj) {
    return { src: obj.src as string, type: obj.type, data: obj.data };
  }
  return null;
}

export function toApiError(error: MyJDownloaderError): ApiError {
  return new ApiError(error.type, error.src, error.data);
}
