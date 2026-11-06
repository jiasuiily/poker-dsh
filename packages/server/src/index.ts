import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { TableRoom } from './TableRoom';
import { serveStatic } from './static';
import { openDb, LedgerRepo, PersistentLedger } from '@poker/storage';
import { MockProvider, HttpProvider, PersonalityEngine } from '@poker/llm';
import { createDb } from './db/client';
import { AuthService } from './db/auth-service';
import { HistoryRepo } from './db/history-repo';
import { AnalysisService } from './analysis/service';
import { startApi } from './api';

async function main(): Promise<void> {
  // 钱包账本：沿用 node:sqlite（钱包托管不在本次范围）
  const dbPath = process.env.DB_PATH ?? 'data/poker.db';
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqliteDb = openDb(dbPath);
  const ledger = PersistentLedger.load(new LedgerRepo(sqliteDb));

  // 人格层：设了 LLM_API_KEY 用真实大模型，否则本地模板
  const llmProvider = process.env.LLM_API_KEY
    ? new HttpProvider({
        baseUrl: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/chat/completions',
        apiKey: process.env.LLM_API_KEY,
        model: process.env.LLM_MODEL ?? 'deepseek-chat',
      })
    : new MockProvider();
  const personality = new PersonalityEngine(llmProvider);

  // Drizzle（PGlite）数据库：认证 + 牌谱 + 复盘
  const pgliteDir = process.env.PGLITE_DIR ?? 'data/pglite';
  mkdirSync(dirname(pgliteDir), { recursive: true });
  const db = await createDb(pgliteDir);
  const auth = await AuthService.init(db);
  const history = new HistoryRepo(db);
  const analysis = new AnalysisService(db, llmProvider);

  const server = new Server({ transport: new WebSocketTransport() });
  server.define('table', TableRoom, { ledger, personality, history });

  const port = Number(process.env.PORT ?? 2568);
  await server
    .listen(port)
    .then(() => {
      console.log(`Colyseus server listening on ws://localhost:${port}`);
      console.log(`数据库：${dbPath} · 人类钱包余额：${ledger.balance('player:human')}`);
    })
    .catch((err) => {
      console.error('failed to start server', err);
      process.exit(1);
    });

  // HTTP API（认证 + 牌谱 + 复盘）
  const apiPort = Number(process.env.API_PORT ?? 8081);
  startApi(apiPort, { auth, history, analysis });

  // 静态站点（托管前端构建产物，供生产/Docker 使用）
  const webPort = Number(process.env.WEB_PORT ?? 8080);
  const webDir = process.env.WEB_DIR ?? join(process.cwd(), '..', 'web', 'dist');
  serveStatic(webDir, webPort);
}

main().catch((err) => {
  console.error('failed to start server', err);
  process.exit(1);
});
