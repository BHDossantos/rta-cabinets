/**
 * Idempotency keys and webhook deduplication (spec sections 13, 20, 24).
 * Reusing a key with the same payload returns the original result; reusing it
 * with a different payload is a conflict.
 */
import { stableStringify } from './design';
import { DomainError } from './errors';

interface Entry<T> {
  fingerprint: string;
  result: T;
}

export class IdempotencyStore<T> {
  private entries = new Map<string, Entry<T>>();

  run(scope: string, key: string, payload: unknown, execute: () => T): { result: T; replayed: boolean } {
    if (!key) throw new DomainError('validation', 'Idempotency-Key is required');
    const id = `${scope}:${key}`;
    const fingerprint = stableStringify(payload);
    const existing = this.entries.get(id);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new DomainError('idempotency_conflict', 'Idempotency key reused with a different payload', { key });
      }
      return { result: existing.result, replayed: true };
    }
    const result = execute();
    this.entries.set(id, { fingerprint, result });
    return { result, replayed: false };
  }
}

/** Records provider event IDs; a duplicate delivery has no further effect. */
export class WebhookReceiptLog {
  private seen = new Map<string, { receivedAt: string; type: string }>();

  /** Returns true when the event is new and should be processed. */
  record(provider: string, eventId: string, type: string, now: Date): boolean {
    const key = `${provider}:${eventId}`;
    if (this.seen.has(key)) return false;
    this.seen.set(key, { receivedAt: now.toISOString(), type });
    return true;
  }

  has(provider: string, eventId: string): boolean {
    return this.seen.has(`${provider}:${eventId}`);
  }
}
