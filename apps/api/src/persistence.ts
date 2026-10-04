/**
 * Durable write-through persistence for the pilot (see db/migrations). Each
 * mutating request ends with one transaction containing exactly the rows that
 * changed; if that transaction fails, the in-memory state is reloaded from the
 * database so memory and storage never disagree.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { EntityKind, EntityRow } from './store';

export interface Persistence {
  load(): Promise<EntityRow[]>;
  apply(upserts: EntityRow[], deletes: { kind: EntityKind; id: string }[]): Promise<void>;
  close(): Promise<void>;
}

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../db/migrations/', import.meta.url));
/** Arbitrary constant key: only one API instance may own a database at a time. */
const SINGLE_WRITER_LOCK = 734_120_001;

export class PgPersistence implements Persistence {
  private constructor(private readonly pool: pg.Pool, private readonly lockClient: pg.PoolClient) {}

  static async connect(connectionString: string): Promise<PgPersistence> {
    const pool = new pg.Pool({ connectionString, max: 4 });
    const lockClient = await pool.connect();
    const { rows } = await lockClient.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [SINGLE_WRITER_LOCK]);
    if (!rows[0]?.ok) {
      lockClient.release();
      await pool.end();
      throw new Error('Another API instance is already using this database. The pilot persistence layer supports one instance per database.');
    }
    const p = new PgPersistence(pool, lockClient);
    await p.migrate();
    return p;
  }

  /** Apply db/migrations/*.sql in order, once each. */
  async migrate(): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const done = new Set((await client.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
      const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
      const applied: string[] = [];
      for (const f of files) {
        if (done.has(f)) continue;
        const sql = await readFile(MIGRATIONS_DIR + f, 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [f]);
          await client.query('COMMIT');
          applied.push(f);
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        }
      }
      return applied;
    } finally {
      client.release();
    }
  }

  async load(): Promise<EntityRow[]> {
    const { rows } = await this.pool.query<EntityRow>('SELECT kind, id, data FROM pilot_entity');
    return rows;
  }

  async apply(upserts: EntityRow[], deletes: { kind: EntityKind; id: string }[]): Promise<void> {
    if (upserts.length === 0 && deletes.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (upserts.length) {
        await client.query(
          `INSERT INTO pilot_entity (kind, id, data, updated_at)
           SELECT k, i, d, now() FROM unnest($1::text[], $2::text[], $3::jsonb[]) AS t(k, i, d)
           ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [upserts.map((r) => r.kind), upserts.map((r) => r.id), upserts.map((r) => JSON.stringify(r.data))],
        );
      }
      if (deletes.length) {
        await client.query(
          'DELETE FROM pilot_entity WHERE (kind, id) IN (SELECT * FROM unnest($1::text[], $2::text[]))',
          [deletes.map((d) => d.kind), deletes.map((d) => d.id)],
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.lockClient.query('SELECT pg_advisory_unlock($1)', [SINGLE_WRITER_LOCK]).catch(() => undefined);
    this.lockClient.release();
    await this.pool.end();
  }
}

/**
 * Tracks what was last written so each flush sends only changed and removed rows.
 * Serialization cost grows with total state; fine for a pilot, and the reason the
 * normalized schema is the scale-out path.
 */
export class StateSync {
  private written = new Map<string, string>();

  constructor(private readonly persistence: Persistence) {}

  private static key(kind: string, id: string) {
    return `${kind}\u0000${id}`;
  }

  /** Mark rows as already stored (after a load or a fresh seed write). */
  baseline(rows: EntityRow[]): void {
    this.written = new Map(rows.map((r) => [StateSync.key(r.kind, r.id), JSON.stringify(r.data)]));
  }

  async flush(rows: EntityRow[]): Promise<{ upserts: number; deletes: number }> {
    const next = new Map<string, string>();
    const upserts: EntityRow[] = [];
    for (const r of rows) {
      const k = StateSync.key(r.kind, r.id);
      const json = JSON.stringify(r.data);
      next.set(k, json);
      if (this.written.get(k) !== json) upserts.push(r);
    }
    const deletes = [...this.written.keys()].filter((k) => !next.has(k)).map((k) => {
      const [kind, id] = k.split('\u0000') as [EntityKind, string];
      return { kind, id };
    });
    await this.persistence.apply(upserts, deletes);
    this.written = next;
    return { upserts: upserts.length, deletes: deletes.length };
  }
}
