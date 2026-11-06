import { describe, it, expect } from 'vitest';
import type { PlayerView } from '@poker/core';
import { chartFor, chartFreq, preflopSituation } from '../src/charts';
import { rangeWidth } from '../src/range';

function width(entry: { raise: Map<string, number>; call: Map<string, number> }) {
  return rangeWidth(entry.raise) + rangeWidth(entry.call);
}

function expectWidth(target: number, actual: number, label: string) {
  expect(Math.abs(actual - target), `${label}: ${actual} vs ${target}`).toBeLessThanOrEqual(0.04);
}

describe('翻前表宽度', () => {
  it('6max rfi 宽度', () => {
    const targets: Record<string, number> = { UTG: 0.17, HJ: 0.21, CO: 0.28, BTN: 0.45, SB: 0.4 };
    for (const [pos, t] of Object.entries(targets)) {
      const e = chartFor('6max', { kind: 'rfi', pos: pos as never })!;
      expectWidth(t, rangeWidth(e.raise), `6max rfi ${pos}`);
    }
  });

  it('9max rfi 宽度', () => {
    const targets: Record<string, number> = {
      UTG: 0.11, UTG1: 0.13, MP: 0.15, LJ: 0.18, HJ: 0.22, CO: 0.28, BTN: 0.45, SB: 0.4,
    };
    for (const [pos, t] of Object.entries(targets)) {
      const e = chartFor('9max', { kind: 'rfi', pos: pos as never })!;
      expectWidth(t, rangeWidth(e.raise), `9max rfi ${pos}`);
    }
  });

  it('hu SB rfi 约 0.80', () => {
    const e = chartFor('hu', { kind: 'rfi', pos: 'SB' })!;
    expectWidth(0.8, rangeWidth(e.raise), 'hu SB rfi');
  });
});

describe('频率', () => {
  it('AA 在每个 rfi 表中 raise = 1', () => {
    const six = ['UTG', 'HJ', 'CO', 'BTN', 'SB'] as const;
    const nine = ['UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB'] as const;
    for (const pos of six) {
      const e = chartFor('6max', { kind: 'rfi', pos })!;
      expect(chartFreq(e, 'AA').raise, `6max ${pos} AA`).toBe(1);
    }
    for (const pos of nine) {
      const e = chartFor('9max', { kind: 'rfi', pos })!;
      expect(chartFreq(e, 'AA').raise, `9max ${pos} AA`).toBe(1);
    }
  });

  it('72o 在 6max UTG 中 fold = 1', () => {
    const e = chartFor('6max', { kind: 'rfi', pos: 'UTG' })!;
    expect(chartFreq(e, '72o').fold).toBe(1);
  });

  it('所有权重在 0..1，同一类别 raise+call ≤ 1', () => {
    for (const fmt of ['hu', '6max', '9max'] as const) {
      for (const sit of [
        { kind: 'rfi', pos: 'UTG' },
        { kind: 'vsOpen', pos: 'BB', opener: 'UTG' },
        { kind: 'vs3bet', pos: 'CO' },
      ] as const) {
        const e = chartFor(fmt, sit as never);
        if (!e) continue;
        for (const [cls, w] of e.raise) {
          expect(w, `${fmt} ${cls} raise`).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThanOrEqual(1);
          expect(w + (e.call.get(cls) ?? 0)).toBeLessThanOrEqual(1);
        }
        for (const [cls, w] of e.call) {
          expect(w).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('preflopSituation', () => {
  function view(button: number, history: PlayerView['history']): PlayerView {
    const n = 6;
    return {
      seat: 5,
      holeCards: [],
      stack: 100,
      streetBet: 0,
      committed: 0,
      players: Array.from({ length: n }, (_, i) => ({ seat: i, stack: 100, streetBet: 0, committed: 0, status: 'active' as const })),
      board: [],
      street: 'preflop',
      pot: 0,
      smallBlind: 5,
      bigBlind: 10,
      buttonSeat: button,
      currentSeat: 5,
      highestBet: 10,
      minRaiseIncrement: 10,
      toCall: 0,
      phase: 'betting',
      history,
      shown: [],
    };
  }

  const e = (seat: number, kind: string, to: number) => ({ seq: 0, street: 'preflop' as const, seat, kind: kind as never, to, allIn: false });

  it('无人入池时轮到 CO → rfi', () => {
    const v = view(0, []);
    expect(preflopSituation(v, 5)).toEqual({ kind: 'rfi', pos: 'CO' });
  });

  it('UTG 开池后轮到 CO → vsOpen', () => {
    const v = view(0, [e(3, 'raise', 20)]); // UTG(seat3) 开池
    expect(preflopSituation(v, 5)).toEqual({ kind: 'vsOpen', pos: 'CO', opener: 'UTG' });
  });

  it('主角开池、被再加注后 → vs3bet', () => {
    // seat 5 (CO) 开池 raise，seat 3 (UTG) 再加注 raise
    const v = view(0, [e(5, 'raise', 20), e(3, 'raise', 60)]);
    expect(preflopSituation(v, 5)).toEqual({ kind: 'vs3bet', pos: 'CO' });
  });

  it('有人溜入池 → other', () => {
    const v = view(0, [e(2, 'call', 10)]);
    expect(preflopSituation(v, 5)).toEqual({ kind: 'other' });
  });
});
