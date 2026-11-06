import { describe, it, expect } from 'vitest';
import type { Rng } from '../src/cards';
import { cardFromString } from '../src/cards';
import { monteCarloEquity } from '../src/equity';

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

describe('monteCarloEquity', () => {
  it('AA 翻前对 1 名对手胜率约 85%', () => {
    const eq = monteCarloEquity([cardFromString('As'), cardFromString('Ad')], [], 1, 2000, intRng(1));
    expect(eq).toBeGreaterThan(0.78);
    expect(eq).toBeLessThan(0.92);
  });

  it('AA 翻前对 3 名对手胜率约 60%+', () => {
    const eq = monteCarloEquity([cardFromString('As'), cardFromString('Ad')], [], 3, 2000, intRng(2));
    expect(eq).toBeGreaterThan(0.55);
  });

  it('72o 翻前对 1 名对手胜率约 35%', () => {
    const eq = monteCarloEquity([cardFromString('7s'), cardFromString('2h')], [], 1, 2000, intRng(3));
    expect(eq).toBeLessThan(0.45);
  });

  it('河牌已成同花顺，对 1 名对手胜率接近 1', () => {
    const board = ['7s', '6s', '5s', '2h', '2d'].map(cardFromString);
    const eq = monteCarloEquity([cardFromString('9s'), cardFromString('8s')], board, 1, 2000, intRng(4));
    expect(eq).toBeGreaterThan(0.95);
  });
});
