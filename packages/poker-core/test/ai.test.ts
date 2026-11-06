import { describe, it, expect } from 'vitest';
import type { Rng } from '../src/cards';
import { createGame, applyAction, validateAction, potOf } from '../src/game';
import { projectView } from '../src/view';
import { decideBeginner } from '../src/ai';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function intRng(seed: number): Rng {
  const r = mulberry32(seed);
  return (maxExclusive) => Math.floor(r() * maxExclusive);
}

function game4() {
  return createGame({
    seats: [
      { id: 'p0', stack: 100 },
      { id: 'p1', stack: 100 },
      { id: 'p2', stack: 100 },
      { id: 'p3', stack: 100 },
    ],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
    rng: intRng(1),
    handId: 'ai',
  });
}

describe('PlayerView 信息隔离', () => {
  it('只含自己的底牌，不泄漏其他玩家底牌', () => {
    const g = game4();
    const view = projectView(g, 0);
    expect(view.holeCards).toHaveLength(2);
    expect(view.holeCards).toEqual(g.players[0].holeCards);
    // 结构上其他玩家没有 holeCards 字段
    for (const p of view.players) {
      expect(p).not.toHaveProperty('holeCards');
    }
    expect(view.toCall).toBe(g.highestBet - g.players[0].streetBet);
  });
});

describe('初级 AI', () => {
  it('配合兜底：始终产生合法动作，且能打完一手牌、筹码守恒', () => {
    const rng = intRng(42);
    const initial = 400;
    let g = game4();
    let guard = 0;
    while (g.phase === 'betting' && guard < 500) {
      const seat = g.currentSeat;
      const view = projectView(g, seat);
      let action = decideBeginner(view, rng);
      if (validateAction(g, action) !== null) {
        const toCall = g.highestBet - g.players[seat].streetBet;
        action = toCall === 0 ? { type: 'check' } : { type: 'call' };
      }
      g = applyAction(g, action);
      guard++;
    }
    expect(g.phase).toBe('complete');
    const total = g.players.reduce((s, p) => s + p.stack, 0) + potOf(g);
    expect(total).toBe(initial);
  });
});
