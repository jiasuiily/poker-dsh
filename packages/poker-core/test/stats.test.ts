import { describe, it, expect } from 'vitest';
import {
  newPlayerStats,
  updateStats,
  vpipRate,
  pfrRate,
  aggressionRate,
} from '../src/stats';

describe('对手建模统计', () => {
  it('VPIP / PFR 统计翻前主动入池与加注', () => {
    let s = newPlayerStats();
    s.hands = 6;
    s = updateStats(s, { type: 'call' }, 'preflop');
    s = updateStats(s, { type: 'raise', amount: 20 }, 'preflop');
    s = updateStats(s, { type: 'fold' }, 'preflop');
    s = updateStats(s, { type: 'call' }, 'preflop');
    s = updateStats(s, { type: 'bet', amount: 30 }, 'preflop');
    s = updateStats(s, { type: 'fold' }, 'preflop');
    expect(s.vpipCount).toBe(4); // call, raise, call, bet
    expect(vpipRate(s)).toBeCloseTo(4 / 6);
    expect(s.pfrCount).toBe(2); // raise, bet
    expect(pfrRate(s)).toBeCloseTo(2 / 6);
  });

  it('激进度统计翻后下注/加注频率', () => {
    let s = newPlayerStats();
    s = updateStats(s, { type: 'bet', amount: 10 }, 'flop');
    s = updateStats(s, { type: 'check' }, 'flop');
    s = updateStats(s, { type: 'raise', amount: 20 }, 'turn');
    s = updateStats(s, { type: 'check' }, 'turn');
    s = updateStats(s, { type: 'fold' }, 'river');
    expect(s.aggressionCount).toBe(2); // bet + raise
    expect(s.postflopCount).toBe(5);
    expect(aggressionRate(s)).toBeCloseTo(2 / 5);
  });

  it('updateStats 不修改原对象', () => {
    const s = newPlayerStats();
    const next = updateStats(s, { type: 'call' }, 'preflop');
    expect(s.vpipCount).toBe(0);
    expect(next.vpipCount).toBe(1);
  });
});
