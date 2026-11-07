import "server-only";
import { MIGRATIONS } from "./migrations";
import { bootstrap } from "./bootstrap";

export type Row = Record<string, unknown>;
export interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}
export interface Database extends Queryable {
  /** Runs fn in one transaction; any throw rolls everything back. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  readonly storage: StorageMode;
  close(): Promise<void>;
}
/** postgres: DATABASE_URL. local: PGlite on disk. ephemeral: PGlite in /tmp on a serverless host (demo only). memory: tests. */
export type StorageMode = "postgres" | "local" | "ephemeral" | "memory";

async function connectPostgres(url: string): Promise<Database> {
  const { default: postgres } = await import("postgres");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const sql = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // safe with transaction-mode poolers (Supabase/Neon)
    ssl: local || /sslmode=disable/.test(url) ? false : "require",
    onnotice: () => {},
    connection: { application_name: "beansandbeats", TimeZone: "UTC" },
  });
  const wrap = (runner: { unsafe: (text: string, params?: never[]) => Promise<unknown> }): Queryable => ({
    async query<T>(text: string, params: unknown[] = []) {
      return [...((await runner.unsafe(text, params as never[])) as unknown as T[])];
    },
  });
  const root = wrap(sql as never);
  return {
    storage: "postgres",
    query: root.query,
    tx: fn => sql.begin(async tx => fn(wrap(tx as never))) as never,
    close: () => sql.end({ timeout: 5 }),
  };
}

export async function connectPglite(dataDir?: string, storage: StorageMode = "local"): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dataDir, { recursive: true });
  }
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  return {
    storage,
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query<T>(text, params)).rows;
    },
    tx: fn => pg.transaction(async tx => fn({ query: async <T,>(text: string, params: unknown[] = []) => (await tx.query<T>(text, params)).rows })),
    close: () => pg.close(),
  };
}

export async function migrate(db: Database): Promise<void> {
  await db.query("create schema if not exists bb");
  await db.query("create table if not exists bb.schema_migrations(version text primary key, applied_at timestamptz not null default now())");
  for (const migration of MIGRATIONS) {
    await db.tx(async q => {
      // Serialise concurrent cold starts across serverless instances.
      await q.query("select pg_advisory_xact_lock(724113)");
      const done = await q.query("select 1 from bb.schema_migrations where version = $1", [migration.version]);
      if (done.length) return;
      for (const statement of migration.statements) await q.query(statement);
      await q.query("insert into bb.schema_migrations(version) values ($1)", [migration.version]);
    });
  }
}

type Holder = { promise?: Promise<Database> };
const holder = ((globalThis as { __bbDatabase?: Holder }).__bbDatabase ??= {});

/** Accepts the names the Vercel Neon integration may create, depending on the chosen prefix. */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.STORAGE_URL || undefined;
}

export function storageModeFromEnv(): StorageMode {
  if (databaseUrl()) return "postgres";
  return process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME ? "ephemeral" : "local";
}

/** Lazily connects, migrates and bootstraps once per server instance. */
export function getDb(): Promise<Database> {
  holder.promise ??= (async () => {
    const mode = storageModeFromEnv();
    const db = mode === "postgres"
      ? await connectPostgres(databaseUrl()!)
      : await connectPglite(mode === "ephemeral" ? "/tmp/beansandbeats-pglite" : process.env.PGLITE_DIR ?? ".data/pglite", mode);
    await migrate(db);
    await bootstrap(db);
    return db;
  })().catch(error => {
    holder.promise = undefined;
    throw error;
  });
  return holder.promise;
}

let previousTestDb: Database | null = null;

/**
 * Test helper: an isolated database with the full schema. In-memory PGlite by default; set
 * TEST_DATABASE_URL to run the same suite through the production `postgres` driver.
 */
export async function createMemoryDb(options: { seed?: boolean } = {}): Promise<Database> {
  let db: Database;
  if (process.env.TEST_DATABASE_URL) {
    await previousTestDb?.close().catch(() => {});
    db = previousTestDb = await connectPostgres(process.env.TEST_DATABASE_URL);
    await db.query("drop schema if exists bb cascade");
  } else {
    db = await connectPglite(undefined, "memory");
  }
  await migrate(db);
  if (options.seed !== false) await bootstrap(db, { env: {} });
  return db;
}

export function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}
