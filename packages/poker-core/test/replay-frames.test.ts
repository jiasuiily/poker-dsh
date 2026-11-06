import { describe, it, expect } from 'vitest';
import type { Rng } from '../src/cards';
import {
  createGame,
  applyAction,
  sampleAction,
  buildReplayFrames,
  type Action,
} from '../src/index';

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

const seats3 = [
  { id: 'a', stack: 100 },
  { id: 'b', stack: 100 },
  { id: 'c', stack: 100 },
];

describe('公开动作日志', () => {
  it('raise 记为 raise，翻牌后下注记为 bet', () => {
    let s = createGame({ seats: seats3, smallBlind: 5, bigBlind: 10, buttonSeat: 0, rng: intRng(1), handId: 'h' });
    s = applyAction(s, { type: 'raise', amount: 30 }); // UTG(seat0) 加注到 30
    expect(s.log[0]).toMatchObject({ street: 'preflop', seat: 0, kind: 'raise', to: 30, allIn: false });
    s = applyAction(s, { type: 'fold' }); // SB(seat1) 弃牌
    s = applyAction(s, { type: 'call' }); // BB(seat2) 跟注 → 翻牌
    expect(s.street).toBe('flop');
    expect(s.currentSeat).toBe(2); // 翻牌后 BB 先动
    s = applyAction(s, { type: 'bet', amount: 10 });
    expect(s.log[s.log.length - 1]).toMatchObject({ street: 'flop', seat: 2, kind: 'bet', to: 10 });
  });
});

describe('回放帧', () => {
  it('帧序列：start + 每动作一帧 + 每街一帧（3/1/1）', () => {
    const config = { seats: [seats3[0], seats3[1]], smallBlind: 5, bigBlind: 10, buttonSeat: 0, handId: 'h' };
    const g = createGame({ ...config, rng: intRng(1) });
    const deck = g.initialDeck.slice();
    // 单挑过牌到摊牌：call + 7 个 check
    const actions: Action[] = [
      { type: 'call' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
      { type: 'check' },
    ];
    let s = g;
    for (const a of actions) s = applyAction(s, a);
    expect(s.phase).toBe('complete');

    const frames = buildReplayFrames(config, deck, s.log, 0);
    expect(frames[0].kind).toBe('start');
    expect(frames.filter((f) => f.kind === 'action').length).toBe(8);
    const streets = frames.filter((f) => f.kind === 'street');
    expect(streets.length).toBe(3);
    expect(streets.map((f) => (f.kind === 'street' ? f.cards.length : 0))).toEqual([3, 1, 1]);
  });

  it('观看者回放：只有自己的底牌，对手底牌仅在摊牌后以 shown 出现', () => {
    const config = { seats: seats3, smallBlind: 5, bigBlind: 10, buttonSeat: 0, handId: 'h' };
    const g = createGame({ ...config, rng: intRng(1) });
    const deck = g.initialDeck.slice();
    let s = g;
    const rng = intRng(7);
    while (s.phase === 'betting') s = applyAction(s, sampleAction(s, rng));

    const frames = buildReplayFrames(config, deck, s.log, 1);
    for (const f of frames) {
      // 观看者自己的底牌始终可见
      expect(f.view.holeCards).toEqual(g.players[1].holeCards);
      // players 结构上不含底牌
      for (const p of f.view.players) {
        expect((p as unknown as { holeCards?: unknown }).holeCards).toBeUndefined();
      }
      // 摊牌前 shown 为空；摊牌后 shown 只含未弃牌者
      if (f.view.phase !== 'complete') {
        expect(f.view.shown).toEqual([]);
      } else {
        const shownSeats = f.view.shown.map((x) => x.seat);
        for (const p of g.players) {
          if (p.status === 'folded') expect(shownSeats).not.toContain(p.seat);
        }
      }
    }
  });

  it('观战者回放：全程无任何底牌', () => {
    const config = { seats: seats3, smallBlind: 5, bigBlind: 10, buttonSeat: 0, handId: 'h' };
    const g = createGame({ ...config, rng: intRng(2) });
    const deck = g.initialDeck.slice();
    let s = g;
    const rng = intRng(9);
    while (s.phase === 'betting') s = applyAction(s, sampleAction(s, rng));

    const frames = buildReplayFrames(config, deck, s.log, null);
    for (const f of frames) {
      expect(f.view.holeCards).toEqual([]);
    }
  });
});
