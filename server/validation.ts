/**
 * FINEXJ Core Input Validation & Sanitization Service
 * Authoritative enforcement for all client-controlled inputs, API requests,
 * financial parameters, and cryptographic identifiers.
 */

import { Errors } from './errors';

export interface AmountValidationOptions {
  min?: number;
  max?: number;
  maxDecimals?: number;
  allowZero?: boolean;
  allowNegative?: boolean;
}

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-.:]+$/;

/**
 * Validates financial currency amounts against strict boundaries,
 * preventing NaN, Infinity, negative values, scientific notation exploits,
 * excessive decimal places, and out-of-range values.
 */
export function validateAmount(
  value: unknown,
  fieldName: string = 'Amount',
  options: AmountValidationOptions = {}
): number {
  const { min, max = 100_000_000, maxDecimals = 4, allowZero = false, allowNegative = false } = options;

  if (value === undefined || value === null || value === '') {
    throw Errors.validation(`${fieldName} is required.`);
  }

  if (typeof value === 'boolean' || typeof value === 'object' || Array.isArray(value)) {
    throw Errors.validation(`${fieldName} must be a valid numeric value.`);
  }

  let strVal = String(value).trim();

  // Prevent null bytes or control characters
  if (/[\x00-\x1F\x7F]/.test(strVal)) {
    throw Errors.validation(`${fieldName} contains invalid characters.`);
  }

  // Reject scientific notation strings (e.g. "1e5", "1e-5", "Infinity", "NaN")
  if (/[eE]/.test(strVal) || strVal.toLowerCase() === 'nan' || strVal.toLowerCase().includes('inf')) {
    throw Errors.validation(`${fieldName} must be a standard decimal number.`);
  }

  // Ensure strict decimal format: optional sign, digits, optional decimal point with digits
  if (!/^[+-]?\d+(\.\d+)?$/.test(strVal)) {
    throw Errors.validation(`${fieldName} is not a valid number.`);
  }

  // Enforce decimal precision limit
  const parts = strVal.split('.');
  if (parts.length === 2 && parts[1].length > maxDecimals) {
    throw Errors.validation(
      `${fieldName} exceeds maximum permitted precision of ${maxDecimals} decimal places.`
    );
  }

  const num = Number(strVal);

  if (isNaN(num) || !Number.isFinite(num)) {
    throw Errors.validation(`${fieldName} must be a finite number.`);
  }

  const permitsNegative = allowNegative || (min !== undefined && min < 0);

  if (permitsNegative) {
    if (!allowZero && num === 0) {
      throw Errors.validation(`${fieldName} cannot be zero.`);
    }
  } else {
    if (!allowZero && num <= 0) {
      throw Errors.validation(`${fieldName} must be greater than zero.`);
    }

    if (allowZero && num < 0) {
      throw Errors.validation(`${fieldName} cannot be negative.`);
    }
  }

  if (min !== undefined && num < min) {
    throw Errors.validation(`${fieldName} cannot be less than ${min}.`);
  }

  if (max !== undefined && num > max) {
    throw Errors.validation(`${fieldName} exceeds maximum limit of ${max}.`);
  }

  return num;
}

/**
 * Validates BNB Smart Chain (BEP-20) EVM hexadecimal wallet addresses.
 * Rejects non-hex, wrong length, missing 0x prefix, or non-EVM chains (e.g. Bitcoin, Tron, Solana).
 */
export function validateBEP20Address(
  address: unknown,
  fieldName: string = 'BEP-20 wallet address'
): string {
  if (!address || typeof address !== 'string') {
    throw Errors.validation(`${fieldName} is required and must be a string.`);
  }

  const clean = address.trim();

  if (!EVM_ADDRESS_REGEX.test(clean)) {
    throw Errors.validation(
      `Invalid ${fieldName}. Must be a 42-character hex address starting with 0x (BNB Smart Chain format).`
    );
  }

  return clean.toLowerCase();
}

/**
 * Validates BNB Smart Chain 32-byte transaction hash (TxID).
 * Must be a 66-character hexadecimal string starting with 0x.
 */
export function validateTxHash(
  txHash: unknown,
  fieldName: string = 'Transaction hash (TxID)'
): string {
  if (!txHash || typeof txHash !== 'string') {
    throw Errors.validation(`${fieldName} is required and must be a string.`);
  }

  const clean = txHash.trim();

  if (!TX_HASH_REGEX.test(clean)) {
    throw Errors.validation(
      `Invalid ${fieldName}. Must be a 66-character hexadecimal string starting with 0x.`
    );
  }

  return clean.toLowerCase();
}

/**
 * Validates an identifier (UUID, database key, or entity ID).
 * Protects against SQL injection, path traversal, and null byte attacks.
 */
export function validateId(
  id: unknown,
  fieldName: string = 'Identifier'
): string {
  if (!id || typeof id !== 'string') {
    throw Errors.validation(`${fieldName} is required.`);
  }

  const clean = id.trim();

  if (clean.length === 0 || clean.length > 128) {
    throw Errors.validation(`${fieldName} has an invalid length.`);
  }

  if (clean.includes('\0') || clean.includes('..') || clean.includes('/') || clean.includes('\\')) {
    throw Errors.validation(`${fieldName} contains prohibited characters.`);
  }

  if (!SAFE_ID_REGEX.test(clean)) {
    throw Errors.validation(`${fieldName} contains invalid characters.`);
  }

  return clean;
}

/**
 * Validates pagination parameters ensuring safe, bounded integers.
 */
export function validatePagination(
  query: { page?: unknown; limit?: unknown; pageSize?: unknown },
  defaultLimit: number = 20,
  maxLimit: number = 100
): { page: number; limit: number; offset: number } {
  let page = 1;
  if (query.page !== undefined && query.page !== null && query.page !== '') {
    const parsedPage = parseInt(String(query.page), 10);
    if (!isNaN(parsedPage) && parsedPage >= 1) {
      page = parsedPage;
    }
  }

  let limit = defaultLimit;
  const rawLimit = query.limit !== undefined ? query.limit : query.pageSize;
  if (rawLimit !== undefined && rawLimit !== null && rawLimit !== '') {
    const parsedLimit = parseInt(String(rawLimit), 10);
    if (!isNaN(parsedLimit) && parsedLimit >= 1) {
      limit = Math.min(parsedLimit, maxLimit);
    }
  }

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Validates YYYY-MM-DD calendar dates.
 */
export function validateDateString(
  dateStr: unknown,
  fieldName: string = 'Date'
): string {
  if (!dateStr || typeof dateStr !== 'string') {
    throw Errors.validation(`${fieldName} is required.`);
  }

  const clean = dateStr.trim();

  if (!DATE_FORMAT_REGEX.test(clean)) {
    throw Errors.validation(`${fieldName} must be in YYYY-MM-DD format (e.g. 2026-08-31).`);
  }

  const timestamp = Date.parse(clean);
  if (isNaN(timestamp)) {
    throw Errors.validation(`${fieldName} is not a valid calendar date.`);
  }

  return clean;
}

/**
 * Validates date range query parameters ensuring startDate <= endDate.
 */
export function validateDateRange(
  startDate?: unknown,
  endDate?: unknown
): { startDate?: string; endDate?: string } {
  let validStart: string | undefined = undefined;
  let validEnd: string | undefined = undefined;

  if (startDate) {
    validStart = validateDateString(startDate, 'Start date');
  }

  if (endDate) {
    validEnd = validateDateString(endDate, 'End date');
  }

  if (validStart && validEnd) {
    if (new Date(validStart).getTime() > new Date(validEnd).getTime()) {
      throw Errors.validation('Start date cannot be after end date.');
    }
  }

  return { startDate: validStart, endDate: validEnd };
}

/**
 * Validates URLs against dangerous protocols (javascript:, file:, data:text/html).
 * Permits http:, https:, and safe image data URIs up to 10MB.
 */
export function validateSafeUrl(
  url: unknown,
  fieldName: string = 'URL'
): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  const clean = url.trim();

  if (/[\x00-\x1F\x7F]/.test(clean)) {
    throw Errors.validation(`${fieldName} contains invalid control characters.`);
  }

  const lower = clean.toLowerCase();

  // Strictly reject dangerous schemes
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('blob:')
  ) {
    throw Errors.validation(`${fieldName} uses an unsupported or prohibited protocol.`);
  }

  // Allow safe image base64 data URIs
  if (lower.startsWith('data:')) {
    if (!/^data:image\/(jpeg|png|jpg|webp);base64,/i.test(clean)) {
      throw Errors.validation(`${fieldName} must be a valid image data URI (JPEG, PNG, or WEBP).`);
    }
    // Limit to 10MB
    if (clean.length > 10 * 1024 * 1024 * 1.37) {
      throw Errors.validation(`${fieldName} exceeds the 10MB file size limit.`);
    }
    return clean;
  }

  // Validate HTTP/HTTPS protocol
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw Errors.validation(`${fieldName} must use HTTP or HTTPS protocol.`);
    }
    return clean;
  } catch {
    throw Errors.validation(`${fieldName} is not a valid URL.`);
  }
}

/**
 * Validates text strings: strips null bytes, trims whitespace, checks length bounds.
 */
export function validateString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number; required?: boolean } = {}
): string {
  const { minLength = 0, maxLength = 1000, required = false } = options;

  if (value === undefined || value === null) {
    if (required) {
      throw Errors.validation(`${fieldName} is required.`);
    }
    return '';
  }

  if (typeof value !== 'string') {
    throw Errors.validation(`${fieldName} must be text.`);
  }

  // Strip null bytes
  const sanitized = value.replace(/\0/g, '').trim();

  if (required && sanitized.length === 0) {
    throw Errors.validation(`${fieldName} is required.`);
  }

  if (sanitized.length < minLength) {
    throw Errors.validation(`${fieldName} must be at least ${minLength} characters.`);
  }

  if (sanitized.length > maxLength) {
    throw Errors.validation(`${fieldName} cannot exceed ${maxLength} characters.`);
  }

  return sanitized;
}

/**
 * Sanitizes a withdrawal record for non-administrative user responses.
 * Strips internal administrative metadata (e.g. reviewedBy, internal admin notes)
 * to prevent sensitive data leakage.
 */
export function sanitizeUserWithdrawal(w: any) {
  if (!w) return null;
  return {
    id: String(w.id),
    reference: w.reference,
    userId: String(w.userId),
    requestedAmount: Number(w.requestedAmount),
    feePercentage: Number(w.feePercentage),
    feeAmount: Number(w.feeAmount),
    netAmount: Number(w.netAmount),
    destinationAddress: w.destinationAddress,
    network: w.network || 'BEP-20',
    status: w.status,
    createdAt: w.createdAt,
    reviewedAt: w.reviewedAt,
    paidAt: w.paidAt,
    txHash: w.txHash,
    userNotes: w.userNotes,
    // Only share rejectionReason with the user if status is rejected
    rejectionReason: w.status === 'rejected' ? w.adminNotes || 'Withdrawal rejected by administrator' : undefined,
  };
}
