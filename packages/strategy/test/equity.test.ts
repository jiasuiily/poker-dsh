import { describe, it, expect } from 'vitest';
import type { Rng, Card } from '@poker/core';
import { cardFromString } from '@poker/core';
import { equityVsRanges } from '../src/equity';
import { parseRange, rangeCombos } from '../src/range';

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

function c(s: string): Card {
  return cardFromString(s);
}

describe('equityVsRanges', () => {
  it('AA 对 KK 约 0.82', () => {
    const hero: [Card, Card] = [c('As'), c('Ad')];
    const villains = [rangeCombos(parseRange('KK'), [c('As'), c('Ad')])];
    const eq = equityVsRanges(hero, [], villains, { iterations: 20000, randomInt: intRng(1) });
    expect(eq).toBeGreaterThan(0.805);
    expect(eq).toBeLessThan(0.835);
  });

  it('AKs 对 QQ 约 0.46', () => {
    const hero: [Card, Card] = [c('Ah'), c('Kh')];
    const villains = [rangeCombos(parseRange('QQ'), [c('Ah'), c('Kh')])];
    const eq = equityVsRanges(hero, [], villains, { iterations: 20000, randomInt: intRng(2) });
    expect(eq).toBeGreaterThan(0.445);
    expect(eq).toBeLessThan(0.475);
  });

  it('坚果同花顺 = 1', () => {
    const hero: [Card, Card] = [c('Ah'), c('Kh')];
    const board = [c('Qh'), c('Jh'), c('Th'), c('2c'), c('2d')];
    const villains = [rangeCombos(parseRange('QQ+'), [...hero, ...board])];
    const eq = equityVsRanges(hero, board, villains, { iterations: 2000, randomInt: intRng(3) });
    expect(eq).toBe(1);
  });

  it('同种子结果一致', () => {
    const hero: [Card, Card] = [c('As'), c('Ad')];
    const villains = [rangeCombos(parseRange('KK'), [c('As'), c('Ad')])];
    const a = equityVsRanges(hero, [], villains, { iterations: 5000, randomInt: intRng(7) });
    const b = equityVsRanges(hero, [], villains, { iterations: 5000, randomInt: intRng(7) });
    expect(a).toBe(b);
  });

  it('卡牌移除：AA 对 AA，只剩 1 组合', () => {
    const hero: [Card, Card] = [c('As'), c('Ad')];
    const combos = rangeCombos(parseRange('AA'), [...hero]);
    expect(combos.length).toBe(1);
  });
});
