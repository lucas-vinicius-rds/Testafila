export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface SessionInfo {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
}

export interface ApiErrorResponse {
  error: {
    code: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_SERVER_ERROR';
    message: string;
  };
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_SERVER_ERROR';

  constructor(
    statusCode: number,
    code: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_SERVER_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
