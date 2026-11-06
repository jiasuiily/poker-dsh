/**
 * 数据库连接：DATABASE_URL 未设置用 PGlite（数据目录 data/pglite），已设置用 pg。
 * 开发期直接在启动时建表（等价于迁移；正式用 drizzle-kit 生成迁移）。
 */
import { drizzle } from 'drizzle-orm/pglite';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema';

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  username text PRIMARY KEY,
  password_hash text NOT NULL,
  salt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invite_codes (
  code text PRIMARY KEY,
  remaining integer NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id serial PRIMARY KEY,
  type text NOT NULL,
  ref_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS txn_type_ref ON transactions(type, ref_id);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id serial PRIMARY KEY,
  transaction_id integer NOT NULL REFERENCES transactions(id),
  account_id text NOT NULL,
  amount integer NOT NULL
);
CREATE TABLE IF NOT EXISTS hands (
  id text PRIMARY KEY,
  engine_version integer NOT NULL,
  config jsonb NOT NULL,
  initial_deck jsonb NOT NULL,
  log jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hand_analyses (
  hand_id text PRIMARY KEY REFERENCES hands(id),
  verdicts jsonb NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS llm_usage (
  date text PRIMARY KEY,
  count integer NOT NULL
);
`;

export type Db = PgliteDatabase<typeof schema>;

export async function createDb(dataDir = 'data/pglite'): Promise<Db> {
  const client = new PGlite(dataDir);
  await client.exec(DDL);
  return drizzle(client);
}
