import { describe, it, expect } from 'vitest';
import type { PlayerView, Card } from '@poker/core';
import { cardFromString } from '@poker/core';
import { parseRange, rangeCombos } from '../src/range';
import { bucketize, inferRanges } from '../src/rangeModel';

function c(s: string): Card {
  return cardFromString(s);
}

describe('bucketize', () => {
  it('pct 在 0..1 之间且单调不减', () => {
    const combos = rangeCombos(parseRange('22+, A2s+, KTs+'), []);
    const buckets = bucketize(combos, [c('As'), c('Ks'), c('Qs')]);
    expect(buckets.length).toBe(combos.length);
    let prev = 0;
    for (const b of buckets) {
      expect(b.pct).toBeGreaterThanOrEqual(0);
      expect(b.pct).toBeLessThanOrEqual(1);
      expect(b.pct).toBeGreaterThanOrEqual(prev);
      prev = b.pct;
    }
  });
});

describe('inferRanges', () => {
  function view(history: PlayerView['history']): PlayerView {
    const n = 6;
    return {
      seat: 5,
      holeCards: [c('As'), c('Ad')],
      stack: 100,
      streetBet: 0,
      committed: 0,
      players: Array.from({ length: n }, (_, i) => ({
        seat: i,
        stack: 100,
        streetBet: 0,
        committed: 0,
        status: 'active' as const,
      })),
      board: [],
      street: 'preflop',
      pot: 0,
      smallBlind: 5,
      bigBlind: 10,
      buttonSeat: 0,
      currentSeat: 5,
      highestBet: 10,
      minRaiseIncrement: 10,
      toCall: 0,
      phase: 'betting',
      history,
      shown: [],
    };
  }

  it('UTG 开池的对手翻前范围宽度接近表宽', () => {
    // UTG(seat3) 开池 raise
    const v = view([{ seq: 0, street: 'preflop', seat: 3, kind: 'raise', to: 30, allIn: false }]);
    const ranges = inferRanges(v, 5);
    expect(ranges.has(3)).toBe(true);
    const combos = ranges.get(3)!;
    const totalWeight = combos.reduce((s, x) => s + x.w, 0);
    // 6max UTG rfi ≈ 0.17 * 1326 ≈ 225，减去 hero AA 的卡牌移除
    expect(totalWeight).toBeGreaterThan(150);
    expect(totalWeight).toBeLessThan(260);
  });
});
