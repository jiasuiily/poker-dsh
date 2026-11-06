import { describe, it, expect } from 'vitest';
import type { Rng } from '@poker/core';
import { BOT_STYLES } from '../src/styles';
import { makeBeginnerBot } from '../src/beginner';
import { makeAdvancedBot } from '../src/advanced';
import { simulate } from '../src/simulate';

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

describe('AI 合法性', () => {
  it('初级/高级 bot 自对弈 500 手不抛异常', () => {
    const bots = [
      makeBeginnerBot(BOT_STYLES.tag),
      makeAdvancedBot(BOT_STYLES.tag),
      makeBeginnerBot(BOT_STYLES.lag),
      makeAdvancedBot(BOT_STYLES.lag),
      makeBeginnerBot(BOT_STYLES.nit),
      makeBeginnerBot(BOT_STYLES.maniac),
    ];
    const { perHandNet } = simulate({ bots, hands: 100, rng: intRng(7) });
    expect(perHandNet).toHaveLength(6);
    expect(perHandNet[0].length).toBe(100);
  });
});
