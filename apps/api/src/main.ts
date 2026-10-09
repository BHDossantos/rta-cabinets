import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { PgPersistence } from './persistence';
import { staticHandler } from './static';
import { openStore } from './store';

const port = Number(process.env.PORT ?? 8787);
const databaseUrl = process.env.DATABASE_URL;
const webDir = process.env.WEB_DIST_DIR ?? fileURLToPath(new URL('../../web/dist/', import.meta.url));
/** Test payments stay off in production unless a demo deployment turns them on explicitly. */
const mockPayments = process.env.ENABLE_TEST_PAYMENTS === 'true' || process.env.NODE_ENV !== 'production';

async function start() {
  const persistence = databaseUrl ? await PgPersistence.connect(databaseUrl) : undefined;
  const opened = persistence ? await openStore(persistence) : undefined;
  const app = createApp({ store: opened?.store, persistence, mockPayments });
  const serveWeb = existsSync(webDir) ? staticHandler(webDir) : null;

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!;
    if (path === '/api' || path.startsWith('/api/') || !serveWeb) return void app.handle(req, res);
    void serveWeb(req, res).catch(() => res.writeHead(500).end());
  });

  server.listen(port, () => {
    const storage = persistence ? `PostgreSQL${opened?.seeded ? ' (new database seeded with demo data)' : ''}` : 'in-memory only (set DATABASE_URL to keep data)';
    console.log(`RTA Cabinet Factory on http://localhost:${port} — ${storage}; web app ${serveWeb ? `served from ${webDir}` : 'not built (API only)'}; test payments ${mockPayments ? 'on' : 'off'}`);
  });
  const shutdown = () => server.close(() => void (persistence?.close() ?? Promise.resolve()).then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
