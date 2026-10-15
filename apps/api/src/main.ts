import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { PgPersistence } from './persistence';
import { staticHandler } from './static';
import { hashPassword, normalizeEmail, validateCredentials } from './auth';
import { openStore } from './store';

const port = Number(process.env.PORT ?? 8787);
const databaseUrl = process.env.DATABASE_URL;
const webDir = process.env.WEB_DIST_DIR ?? fileURLToPath(new URL('../../web/dist/', import.meta.url));
const production = process.env.NODE_ENV === 'production';
/** Test payments and demo accounts stay off in production unless a demo deployment turns them on. */
const mockPayments = process.env.ENABLE_TEST_PAYMENTS === 'true' || !production;
const demoAuth = process.env.ALLOW_DEMO_ACCOUNTS === 'true' || !production;

async function start() {
  const persistence = databaseUrl ? await PgPersistence.connect(databaseUrl) : undefined;
  const opened = persistence ? await openStore(persistence) : undefined;
  const app = createApp({ store: opened?.store, persistence, mockPayments, demoAuth, secureCookies: production, enforceOrigin: production });
  await bootstrapAdmin(app);
  const serveWeb = existsSync(webDir) ? staticHandler(webDir) : null;

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!;
    if (path === '/api' || path.startsWith('/api/') || !serveWeb) return void app.handle(req, res);
    void serveWeb(req, res).catch(() => res.writeHead(500).end());
  });

  server.listen(port, () => {
    const storage = persistence ? `PostgreSQL${opened?.seeded ? ' (new database seeded with demo data)' : ''}` : 'in-memory only (set DATABASE_URL to keep data)';
    console.log(`RTA Cabinet Factory on http://localhost:${port} — ${storage}; web app ${serveWeb ? `served from ${webDir}` : 'not built (API only)'}; test payments ${mockPayments ? 'on' : 'off'}; demo accounts ${demoAuth ? 'on' : 'off'}`);
  });
  const shutdown = () => server.close(() => void (persistence?.close() ?? Promise.resolve()).then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * First administrator: set ADMIN_EMAIL and ADMIN_PASSWORD once. If no account has
 * that email, one is created with the admin role; existing accounts are left alone.
 * The admin then grants staff roles from the account page.
 */
async function bootstrapAdmin(app: ReturnType<typeof createApp>) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const exists = [...app.store.users.values()].some((u) => normalizeEmail(u.email) === normalizeEmail(email));
  if (exists) return;
  validateCredentials(email, password);
  const id = app.store.id('usr');
  app.store.users.set(id, {
    id, name: 'Administrator', email: normalizeEmail(email), orgIds: ['org_factory'], roles: ['admin'],
    passwordHash: hashPassword(password), createdAt: new Date().toISOString(),
  });
  await app.persist();
  console.log(`Created administrator account ${email}`);
}

start().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
