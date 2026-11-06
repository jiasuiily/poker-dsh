import { describe, it, expect } from 'vitest';
import type { Rng } from '@poker/core';
import { BOT_STYLES, STYLE_NAMES, type StyleId } from '../src/styles';
import { makeBeginnerBot } from '../src/beginner';
import { getBot } from '../src/index';
import { simulate } from '../src/simulate';
import { vpipRate } from '../src/stats';

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

describe('BOT_STYLES', () => {
  it('五种预设数值等于规格表', () => {
    expect(BOT_STYLES.tag).toEqual({ id: 'tag', looseness: 0.9, aggression: 1.3, bluff: 1.0, stickiness: 0.9, sizing: 1.0 });
    expect(BOT_STYLES.lag).toEqual({ id: 'lag', looseness: 1.4, aggression: 1.5, bluff: 1.4, stickiness: 1.0, sizing: 1.1 });
    expect(BOT_STYLES.nit).toEqual({ id: 'nit', looseness: 0.6, aggression: 0.7, bluff: 0.3, stickiness: 0.7, sizing: 0.9 });
    expect(BOT_STYLES.station).toEqual({ id: 'station', looseness: 1.5, aggression: 0.5, bluff: 0.4, stickiness: 1.8, sizing: 0.8 });
    expect(BOT_STYLES.maniac).toEqual({ id: 'maniac', looseness: 2.0, aggression: 2.2, bluff: 2.5, stickiness: 1.2, sizing: 1.4 });
  });

  it('STYLE_NAMES 中文名', () => {
    expect(STYLE_NAMES.tag).toBe('紧凶');
    expect(STYLE_NAMES.nit).toBe('岩石');
  });
});

describe('getBot', () => {
  it('返回对应风格实例且缓存', () => {
    const a = getBot('beginner', 'station');
    expect(a.style).toBe('station');
    expect(a.level).toBe('beginner');
    expect(getBot('beginner', 'station')).toBe(a); // 缓存
  });
});

describe('初级 AI 风格 VPIP 排序', () => {
  function vpip(style: StyleId, hands: number, seed: number): number {
    const bot = makeBeginnerBot(BOT_STYLES[style]);
    const { stats } = simulate({ bots: Array.from({ length: 6 }, () => bot), hands, rng: intRng(seed) });
    return vpipRate(stats.get(0)!);
  }

  it('nit < tag < lag < maniac', () => {
    const nit = vpip('nit', 2000, 1);
    const tag = vpip('tag', 2000, 1);
    const lag = vpip('lag', 2000, 1);
    const maniac = vpip('maniac', 2000, 1);
    expect(nit).toBeLessThan(tag);
    expect(tag).toBeLessThan(lag);
    expect(lag).toBeLessThan(maniac);
  });
});
