import { describe, it, expect } from 'vitest';
import type { Rng } from '@poker/core';
import { createGame, applyAction, sampleAction } from '@poker/core';
import { MockProvider } from '@poker/llm';
import { createDb } from '../src/db/client';
import { HistoryRepo } from '../src/db/history-repo';
import { AnalysisService } from '../src/analysis/service';

function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return (maxExclusive) => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive);
  };
}

function playHand() {
  const config = {
    seats: [
      { id: 'a', stack: 100 },
      { id: 'b', stack: 100 },
      { id: 'c', stack: 100 },
    ],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
    handId: 'h1',
  };
  const g = createGame({ ...config, rng: seededRng(1) });
  const deck = g.initialDeck.slice();
  let s = g;
  const rng = seededRng(7);
  let guard = 0;
  while (s.phase === 'betting' && guard < 200) {
    s = applyAction(s, sampleAction(s, rng));
    guard++;
  }
  const result = {
    winners: s.winners.map((w) => w.seat),
    net: Object.fromEntries(s.players.map((p) => [String(p.seat), p.stack - config.seats[p.seat].stack])),
  };
  return { config, initialDeck: deck, log: s.log, result };
}

describe('牌谱 + 分析服务', () => {
  it('保存 + 列表 + 读取 + 分析 + 缓存', async () => {
    const db = await createDb('memory://');
    const repo = new HistoryRepo(db);
    const { config, initialDeck, log, result } = playHand();

    await repo.save({ id: 'h1', engineVersion: 1, config, initialDeck, log, result });

    const list = await repo.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('h1');

    const got = await repo.get('h1');
    expect(got).not.toBeNull();
    expect(got!.initialDeck.length).toBe(52);
    expect(got!.log.length).toBeGreaterThan(0);

    const svc = new AnalysisService(db, new MockProvider());
    const first = await svc.analyze(got!, 0);
    expect(first.cached).toBe(false);
    expect(first.summary.length).toBeGreaterThan(0);
    expect(first.verdicts.length).toBeGreaterThan(0);

    const second = await svc.analyze(got!, 0);
    expect(second.cached).toBe(true);
    expect(second.summary).toBe(first.summary);
  });
});
