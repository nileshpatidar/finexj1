import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export type StandardErrorCode =
  | 'AUTH_DISABLED'
  | 'REGISTRATION_DISABLED'
  | 'MAINTENANCE_MODE'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_LOCKED'
  | 'USER_NOT_FOUND'
  | 'DEPOSIT_NOT_FOUND'
  | 'DEPOSIT_ALREADY_PROCESSED'
  | 'INVALID_DEPOSIT'
  | 'WITHDRAWAL_NOT_FOUND'
  | 'WITHDRAWAL_ALREADY_PROCESSED'
  | 'INVALID_TRANSACTION_HASH'
  | 'TRANSACTION_NOT_VERIFIED'
  | 'WITHDRAWAL_NOT_ELIGIBLE'
  | 'ACCOUNT_AGE_REQUIREMENT'
  | 'INSUFFICIENT_BALANCE'
  | 'WITHDRAWAL_DISABLED'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'DATABASE_ERROR'
  | 'STORAGE_ERROR'
  | 'NETWORK_ERROR';

/**
 * Standard Application Error
 */
export class AppError extends Error {
  public readonly code: StandardErrorCode;
  public readonly statusCode: number;
  public readonly safeUserMessage: string;
  public readonly technicalDetails?: any;

  constructor(
    code: StandardErrorCode,
    safeUserMessage: string,
    statusCode: number = 400,
    technicalDetails?: any
  ) {
    super(safeUserMessage);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.safeUserMessage = safeUserMessage;
    this.technicalDetails = technicalDetails;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common AppError factories
 */
export const Errors = {
  unauthorized: (msg = 'Authentication required. Please login.') =>
    new AppError('UNAUTHORIZED', msg, 401),

  forbidden: (msg = 'Access denied. Insufficient administrative privileges.') =>
    new AppError('FORBIDDEN', msg, 403),

  invalidCredentials: (msg = 'Invalid email or password.') =>
    new AppError('INVALID_CREDENTIALS', msg, 401),

  authDisabled: (msg = 'User login is temporarily unavailable. Please try again later.') =>
    new AppError('AUTH_DISABLED', msg, 403),

  registrationDisabled: (msg = 'Registration is currently unavailable. Please try again later.') =>
    new AppError('REGISTRATION_DISABLED', msg, 403),

  maintenanceMode: (msg = 'FINEXJ is temporarily under maintenance. Please try again later.') =>
    new AppError('MAINTENANCE_MODE', msg, 503),

  rateLimited: (msg = 'Too many requests. Please wait a moment and try again.') =>
    new AppError('RATE_LIMITED', msg, 429),

  validation: (msg: string, details?: any) =>
    new AppError('VALIDATION_ERROR', msg, 400, details),

  notFound: (code: StandardErrorCode = 'USER_NOT_FOUND', msg = 'The requested resource was not found.') =>
    new AppError(code, msg, 404),

  internal: (technicalError?: any, msg = 'We could not process your request. Please try again later.') =>
    new AppError('INTERNAL_ERROR', msg, 500, technicalError),

  database: (technicalError?: any, msg = 'A database service error occurred. Please try again.') =>
    new AppError('DATABASE_ERROR', msg, 500, technicalError),
};

/**
 * Central Express Error Handler
 * Standardizes all error responses and ensures secrets/stack-traces are never exposed to normal users.
 */
export function centralErrorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = (req as any).requestId || 'FINEXJ-UNKNOWN';
  const userId = (req as any).user?.id;
  const adminId = (req as any).user?.role && (req as any).user?.role !== 'user' ? (req as any).user.id : undefined;

  let statusCode = 500;
  let errorCode: StandardErrorCode = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.safeUserMessage;
  } else if (err && typeof err === 'object' && err.message) {
    // Check if it's a known string error thrown by business rules
    const rawMsg = err.message;
    if (rawMsg.includes('already processed') || rawMsg.includes('Duplicate')) {
      errorCode = 'DEPOSIT_ALREADY_PROCESSED';
      statusCode = 400;
      message = 'This blockchain deposit transaction has already been processed.';
    } else if (rawMsg.includes('Invalid BEP-20') || rawMsg.includes('Invalid transaction hash')) {
      errorCode = 'INVALID_TRANSACTION_HASH';
      statusCode = 400;
      message = 'Invalid BEP-20 transaction hash format.';
    } else if (rawMsg.includes('Minimum deposit')) {
      errorCode = 'INVALID_DEPOSIT';
      statusCode = 400;
      message = rawMsg;
    } else if (rawMsg.includes('30-day') || rawMsg.includes('30 full days')) {
      errorCode = 'ACCOUNT_AGE_REQUIREMENT';
      statusCode = 400;
      message = rawMsg;
    } else if (rawMsg.includes('Insufficient available balance')) {
      errorCode = 'INSUFFICIENT_BALANCE';
      statusCode = 400;
      message = rawMsg;
    } else if (statusCode === 500) {
      // Keep technical database errors concealed from users
      message = 'We could not process your request. Please try again later.';
    }
  }

  // Structured Log with Request ID
  if (statusCode >= 500) {
    logger.error('API_SERVER_ERROR', err instanceof Error ? err.message : String(err), {
      errorCode,
      requestId,
      userId,
      adminId,
      route: req.originalUrl,
      method: req.method,
      metadata: {
        statusCode,
        stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined,
        rawError: err instanceof Error ? err.message : err,
      },
    });
  } else {
    logger.warn('API_CLIENT_WARNING', err instanceof Error ? err.message : String(err), {
      errorCode,
      requestId,
      userId,
      adminId,
      route: req.originalUrl,
      method: req.method,
      metadata: {
        statusCode,
      },
    });
  }

  // Standard API Error JSON Response
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      requestId,
    },
  });
}
