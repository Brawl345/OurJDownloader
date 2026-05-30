import { describe, expect, it } from 'vitest';
import {
  ApiError,
  isAuthError,
  isBackoffError,
  isTokenError,
  parseErrorShape,
  toApiError,
} from '../lib/api/errors';

describe('parseErrorShape (docs §6.1)', () => {
  it('detects the wrapped { error: {...} } shape', () => {
    expect(
      parseErrorShape({ error: { src: 'DEVICE', type: 'BAD_PARAMETERS' } }),
    ).toEqual({ src: 'DEVICE', type: 'BAD_PARAMETERS' });
  });

  it('detects the flat { src, type, rid } shape', () => {
    expect(
      parseErrorShape({
        src: 'MYJD',
        type: 'TOKEN_INVALID',
        data: null,
        rid: 1,
      }),
    ).toEqual({ src: 'MYJD', type: 'TOKEN_INVALID', data: null });
  });

  it('returns null for a normal result payload', () => {
    expect(parseErrorShape({ list: [], rid: 1 })).toBeNull();
    expect(parseErrorShape({ data: true, rid: 1 })).toBeNull();
    expect(parseErrorShape(null)).toBeNull();
  });
});

describe('error classification (docs §6.3/§6.4)', () => {
  it('flags token errors for reconnect', () => {
    expect(isTokenError(new ApiError('TOKEN_INVALID'))).toBe(true);
    expect(isTokenError(new ApiError('SESSION_EXPIRED'))).toBe(true);
    expect(isTokenError(new ApiError('BAD_PARAMETERS'))).toBe(false);
  });

  it('flags overload errors for backoff', () => {
    expect(isBackoffError(new ApiError('OVERLOAD'))).toBe(true);
    expect(isBackoffError(new ApiError('TOO_MANY_REQUESTS'))).toBe(true);
    expect(isBackoffError(new ApiError('TOKEN_INVALID'))).toBe(false);
  });

  it('flags auth errors as non-retryable', () => {
    expect(isAuthError(new ApiError('AUTH_FAILED'))).toBe(true);
    expect(isAuthError(new ApiError('EMAIL_INVALID'))).toBe(true);
    expect(isAuthError(new ApiError('OVERLOAD'))).toBe(false);
  });

  it('does not classify plain Errors', () => {
    expect(isTokenError(new Error('TOKEN_INVALID'))).toBe(false);
  });
});

describe('toApiError', () => {
  it('preserves type, src and data', () => {
    const err = toApiError({ src: 'DEVICE', type: 'OFFLINE', data: { x: 1 } });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.type).toBe('OFFLINE');
    expect(err.src).toBe('DEVICE');
    expect(err.data).toEqual({ x: 1 });
  });
});
