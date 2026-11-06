import { describe, it, expect } from 'vitest';
import type { Rng } from '../src/cards';
import { createGame, applyAction, replayHand, sampleAction, type Action } from '../src/game';

function intRng(seed: number): Rng {
  let a = seed >>> 0;
  return (maxExclusive) => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive);
  };
}

describe('牌谱回放', () => {
  it('同初始牌序 + 同动作日志 → 同最终状态', () => {
    const config = {
      seats: [
        { id: 'a', stack: 100 },
        { id: 'b', stack: 100 },
        { id: 'c', stack: 100 },
      ],
      smallBlind: 5,
      bigBlind: 10,
      buttonSeat: 0,
      handId: 'h',
    };
    const g1 = createGame({ ...config, rng: intRng(42) });
    const initialDeck = g1.initialDeck.slice();

    const actions: Action[] = [];
    let g = g1;
    const rng = intRng(7);
    while (g.phase === 'betting' && actions.length < 500) {
      const a = sampleAction(g, rng);
      actions.push(a);
      g = applyAction(g, a);
    }
    expect(g.phase).toBe('complete');

    const g2 = replayHand(config, initialDeck, actions);
    expect(g2.phase).toBe('complete');
    expect(g2.players.map((p) => p.stack)).toEqual(g.players.map((p) => p.stack));
    expect(g2.board).toEqual(g.board);
    expect(g2.winners).toEqual(g.winners);
  });

  it('回放只依赖初始牌序，与随机数种子无关', () => {
    const config = {
      seats: [
        { id: 'a', stack: 200 },
        { id: 'b', stack: 200 },
      ],
      smallBlind: 5,
      bigBlind: 10,
      buttonSeat: 0,
      handId: 'h',
    };
    const g = createGame({ ...config, rng: intRng(1) });
    const deck = g.initialDeck.slice();
    const actions: Action[] = [];
    let cur = g;
    const rng = intRng(3);
    while (cur.phase === 'betting' && actions.length < 500) {
      const a = sampleAction(cur, rng);
      actions.push(a);
      cur = applyAction(cur, a);
    }
    // 用不同的 rng（但 replayHand 用 deck 覆盖了洗牌，rng 无关）重放
    const r = replayHand({ ...config, rng: intRng(999) }, deck, actions);
    expect(r.players.map((p) => p.stack)).toEqual(cur.players.map((p) => p.stack));
    expect(r.board).toEqual(cur.board);
  });
});
