/** Stable, machine-readable domain error (spec section 24, response conventions). */
export type ErrorCode =
  | 'validation'
  | 'conflict'
  | 'not_found'
  | 'forbidden'
  | 'unauthorized'
  | 'invalid_transition'
  | 'insufficient_stock'
  | 'idempotency_conflict'
  | 'entitlement_required'
  | 'gate_failed'
  | 'provider_unavailable';

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function assert(condition: unknown, code: ErrorCode, message: string, details?: Record<string, unknown>): asserts condition {
  if (!condition) throw new DomainError(code, message, details);
}
