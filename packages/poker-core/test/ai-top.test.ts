import { describe, it, expect } from 'vitest';
import type { Rng } from '../src/cards';
import { createGame, applyAction, validateAction, potOf } from '../src/game';
import { projectView } from '../src/view';
import { decideTop } from '../src/ai';
import { newPlayerStats, type PlayerStats } from '../src/stats';

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

describe('顶级 AI', () => {
  it('配合兜底：始终产生合法动作，且能打完一手牌、筹码守恒', () => {
    const rng = intRng(42);
    const stats = new Map<number, PlayerStats>();
    for (let i = 0; i < 4; i++) stats.set(i, newPlayerStats());
    let g = createGame({
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
      handId: 'top',
    });
    let guard = 0;
    while (g.phase === 'betting' && guard < 500) {
      const seat = g.currentSeat;
      const view = projectView(g, seat);
      let action = decideTop(view, rng, stats);
      if (validateAction(g, action) !== null) {
        const toCall = g.highestBet - g.players[seat].streetBet;
        action = toCall === 0 ? { type: 'check' } : { type: 'call' };
      }
      g = applyAction(g, action);
      guard++;
    }
    expect(g.phase).toBe('complete');
    const total = g.players.reduce((s, p) => s + p.stack, 0) + potOf(g);
    expect(total).toBe(400);
  });
});
