import { createApp } from './app';
import { PgPersistence } from './persistence';
import { openStore } from './store';

const port = Number(process.env.PORT ?? 8787);
const databaseUrl = process.env.DATABASE_URL;

async function start() {
  if (!databaseUrl) {
    const { server } = createApp();
    server().listen(port, () => {
      console.log(`RTA API on http://localhost:${port} — in-memory only (set DATABASE_URL to keep data across restarts)`);
    });
    return;
  }
  const persistence = await PgPersistence.connect(databaseUrl);
  const { store, seeded } = await openStore(persistence);
  const { server } = createApp({ store, persistence });
  const srv = server().listen(port, () => {
    console.log(`RTA API on http://localhost:${port} — PostgreSQL persistence${seeded ? ' (new database seeded with demo data)' : ''}`);
  });
  const shutdown = () => srv.close(() => void persistence.close().then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
