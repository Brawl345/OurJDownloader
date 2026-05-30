export interface MyJDownloaderError {
  src: string;
  type: string;
  data?: unknown;
}

export class AuthenticationError extends Error {
  constructor(
    message: string,
    public override cause?: Error,
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class TokenInvalidError extends AuthenticationError {
  constructor(message = 'Authentication token is invalid', cause?: Error) {
    super(message, cause);
    this.name = 'TokenInvalidError';
  }
}

export class SessionExpiredError extends AuthenticationError {
  constructor(message = 'Session has expired', cause?: Error) {
    super(message, cause);
    this.name = 'SessionExpiredError';
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public errorType: string,
    public source: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromMyJDownloaderError(
    error: MyJDownloaderError,
  ): AuthenticationError | ApiError {
    switch (error.type) {
      case 'TOKEN_INVALID':
        return new TokenInvalidError();
      case 'SESSION_EXPIRED':
        return new SessionExpiredError();
      default:
        return new ApiError(
          `API Error: ${error.type}`,
          error.type,
          error.src,
          error.data,
        );
    }
  }
}

export function isAuthenticationError(
  error: unknown,
): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

export function isTokenInvalidError(
  error: unknown,
): error is TokenInvalidError {
  return error instanceof TokenInvalidError;
}

export function isSessionExpiredError(
  error: unknown,
): error is SessionExpiredError {
  return error instanceof SessionExpiredError;
}
