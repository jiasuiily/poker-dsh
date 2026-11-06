import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { TableRoom } from './TableRoom';
import { serveStatic } from './static';
import { openDb, LedgerRepo, PersistentLedger } from '@poker/storage';
import { MockProvider, HttpProvider, PersonalityEngine } from '@poker/llm';

const dbPath = process.env.DB_PATH ?? 'data/poker.db';
mkdirSync(dirname(dbPath), { recursive: true });

const db = openDb(dbPath);
const ledger = PersistentLedger.load(new LedgerRepo(db));

// 人格层：设了 LLM_API_KEY 用真实大模型（DeepSeek/千问/智谱等 OpenAI 兼容），否则本地模板
const llmProvider = process.env.LLM_API_KEY
  ? new HttpProvider({
      baseUrl: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/chat/completions',
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL ?? 'deepseek-chat',
    })
  : new MockProvider();
const personality = new PersonalityEngine(llmProvider);

const server = new Server({ transport: new WebSocketTransport() });
server.define('table', TableRoom, { ledger, personality });

const port = Number(process.env.PORT ?? 2568);
server
  .listen(port)
  .then(() => {
    console.log(`Colyseus server listening on ws://localhost:${port}`);
    console.log(`数据库：${dbPath} · 人类钱包余额：${ledger.balance('player:human')}`);
  })
  .catch((err) => {
    console.error('failed to start server', err);
    process.exit(1);
  });

// 静态站点（托管前端构建产物，供生产/Docker 使用）
const webPort = Number(process.env.WEB_PORT ?? 8080);
const webDir = process.env.WEB_DIR ?? join(process.cwd(), '..', 'web', 'dist');
serveStatic(webDir, webPort);
