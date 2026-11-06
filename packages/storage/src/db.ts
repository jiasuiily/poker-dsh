import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';

// Vite/Vitest 的解析器不认识较新的 node:sqlite 内置模块，
// 这里用 Node 原生 require 在运行时加载，绕开 Vite 的模块解析。
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: SqliteDatabase } = nodeRequire('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSync;
};

/** 打开（或创建）数据库并建表 */
export function openDb(path: string): DatabaseSync {
  const db = new SqliteDatabase(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(type, ref_id)
    );
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      amount INTEGER NOT NULL
    );
  `);
  return db;
}
