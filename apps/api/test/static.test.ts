import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { staticHandler } from '../src/static';

/** Raw GET so "../" is sent as-is (fetch would normalize it). */
function rawGet(port: number, path: string): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    }).on('error', reject).end();
  });
}

describe('static web serving', () => {
  it('serves files, falls back to index.html, and never leaves the build folder', async () => {
    const root = mkdtempSync(join(tmpdir(), 'rta-web-'));
    mkdirSync(join(root, 'assets'));
    writeFileSync(join(root, 'index.html'), '<title>app</title>');
    writeFileSync(join(root, 'assets', 'a.js'), 'console.log(1)');
    writeFileSync(join(tmpdir(), 'rta-secret.txt'), 'secret');
    const serve = staticHandler(root);
    const srv = createServer((req, res) => void serve(req, res));
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as AddressInfo).port;

    const asset = await rawGet(port, '/assets/a.js');
    expect(asset.body).toBe('console.log(1)');
    expect(asset.headers['cache-control']).toContain('immutable');
    expect((await rawGet(port, '/design/anything')).body).toBe('<title>app</title>');
    for (const evil of ['/../rta-secret.txt', '/%2e%2e/rta-secret.txt', '/assets/../../rta-secret.txt']) {
      expect((await rawGet(port, evil)).body).not.toContain('secret');
    }
    await new Promise<void>((r) => srv.close(() => r()));
  });
});
