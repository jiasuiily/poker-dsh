/**
 * 极简 HTTP API（无框架）：认证 + 牌谱 + 复盘。
 * 路由：
 *   POST /api/auth/register  { username, password, inviteCode }
 *   POST /api/auth/login     { username, password }
 *   GET  /api/hands          牌谱列表
 *   GET  /api/hands/:id      牌谱详情（含观战者回放帧）
 *   GET  /api/hands/:id/analysis  复盘分析（判定 + 解说）
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { buildReplayFrames } from '@poker/core';
import type { AuthService } from './db/auth-service';
import type { HistoryRepo } from './db/history-repo';
import type { AnalysisService } from './analysis/service';

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

export function startApi(
  port: number,
  deps: { auth: AuthService; history: HistoryRepo; analysis: AnalysisService },
): void {
  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      res.end();
      return;
    }
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);
    try {
      if (req.method === 'POST' && url.pathname === '/api/auth/register') {
        const b = await readJson(req);
        const r = await deps.auth.register(String(b.username ?? ''), String(b.password ?? ''), String(b.inviteCode ?? ''));
        json(res, r.ok ? 200 : 400, r.ok ? { token: r.token } : { error: r.error });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        const b = await readJson(req);
        const r = await deps.auth.login(String(b.username ?? ''), String(b.password ?? ''));
        json(res, r.ok ? 200 : 401, r.ok ? { token: r.token } : { error: r.error });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/hands') {
        const list = await deps.history.list();
        json(res, 200, list.map((h) => ({ id: h.id, engineVersion: h.engineVersion, result: h.result, createdAt: h.createdAt })));
        return;
      }
      const handMatch = url.pathname.match(/^\/api\/hands\/([^/]+)(\/analysis)?$/);
      if (req.method === 'GET' && handMatch) {
        const id = handMatch[1];
        const hand = await deps.history.get(id);
        if (!hand) {
          json(res, 404, { error: 'not found' });
          return;
        }
        if (handMatch[2] === '/analysis') {
          // 观战者视角：seat 取 0（无登录态时默认第一视角）
          const heroSeat = 0;
          const result = await deps.analysis.analyze(hand, heroSeat);
          json(res, 200, { verdicts: result.verdicts, summary: result.summary, cached: result.cached });
          return;
        }
        const frames = buildReplayFrames(hand.config, hand.initialDeck, hand.log, null);
        json(res, 200, { ...hand, frames });
        return;
      }
      json(res, 404, { error: 'not found' });
    } catch (e) {
      json(res, 500, { error: (e as Error).message });
    }
  });
  server.listen(port, () => console.log(`HTTP API listening on http://localhost:${port}`));
}
