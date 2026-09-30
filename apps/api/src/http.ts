import type { IncomingMessage, ServerResponse } from 'node:http';
import { DomainError, type ErrorCode } from '@rta/core';

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  rawBody: string;
  headers: IncomingMessage['headers'];
}

export type Handler = (ctx: Ctx) => unknown | Promise<unknown>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  on(method: string, path: string, handler: Handler): this {
    const keys: string[] = [];
    const pattern = new RegExp(`^${path.replace(/:(\w+)/g, (_, k: string) => { keys.push(k); return '([^/]+)'; })}$`);
    this.routes.push({ method, pattern, keys, handler });
    return this;
  }

  match(method: string, path: string): { handler: Handler; params: Record<string, string> } | 'method_not_allowed' | undefined {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.pattern.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)));
      return { handler: r.handler, params };
    }
    return pathMatched ? 'method_not_allowed' : undefined;
  }
}

const STATUS: Record<ErrorCode, number> = {
  validation: 422, conflict: 409, not_found: 404, forbidden: 403, unauthorized: 401, invalid_transition: 409,
  insufficient_stock: 409, idempotency_conflict: 422, entitlement_required: 403, gate_failed: 409, provider_unavailable: 503,
};

export function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(json);
}

/** Field-level errors, stable machine-readable codes and a user-safe message (spec section 24). */
export function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof DomainError) {
    send(res, STATUS[err.code], { error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof SyntaxError) {
    send(res, 400, { error: { code: 'bad_request', message: 'Request body is not valid JSON' } });
    return;
  }
  console.error(err);
  send(res, 500, { error: { code: 'internal', message: 'Unexpected error' } });
}

export async function readBody(req: IncomingMessage, limitBytes = 2_000_000): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limitBytes) throw new DomainError('validation', 'Request body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}
