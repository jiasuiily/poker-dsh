import { describe, it, expect } from 'vitest';
import type { Rng } from '@poker/core';
import { getBot } from '../src/index';
import { makeAdvancedBot } from '../src/advanced';
import { BOT_STYLES } from '../src/styles';
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

describe('高级 AI', () => {
  it('makeAdvancedBot 返回高级实例', () => {
    const bot = makeAdvancedBot(BOT_STYLES.lag);
    expect(bot.level).toBe('advanced');
    expect(bot.style).toBe('lag');
  });

  it('高级 AI 平均净赢超过初级 AI（300 手）', () => {
    const advanced = Array.from({ length: 3 }, () => getBot('advanced', 'tag'));
    const beginner = Array.from({ length: 3 }, () => getBot('beginner', 'tag'));
    const { perHandNet } = simulate({
      bots: [...advanced, ...beginner],
      hands: 300,
      rng: intRng(42),
    });
    const advMean = [0, 1, 2].flatMap((i) => perHandNet[i]).reduce((s, x) => s + x, 0) / (3 * 300);
    const begMean = [3, 4, 5].flatMap((i) => perHandNet[i]).reduce((s, x) => s + x, 0) / (3 * 300);
    expect(advMean).toBeGreaterThan(begMean);
  });
});
