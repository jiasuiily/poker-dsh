import { describe, it, expect } from 'vitest';
import type { Card, Rng, PlayerView } from '@poker/core';
import { cardFromString, createGame, applyAction } from '@poker/core';
import { evaluateDecision, analyzeHand } from '../src/index';

function c(s: string): Card {
  return cardFromString(s);
}

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

function mkView(over: Partial<PlayerView>): PlayerView {
  return {
    seat: 0,
    holeCards: [],
    stack: 1000,
    streetBet: 0,
    committed: 0,
    players: [],
    board: [],
    street: 'preflop',
    pot: 0,
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
    currentSeat: 0,
    highestBet: 0,
    minRaiseIncrement: 10,
    toCall: 0,
    phase: 'betting',
    history: [],
    shown: [],
    ...over,
  };
}

function preflopView(hero: [Card, Card], heroSeat: number): PlayerView {
  const n = 6;
  return mkView({
    seat: heroSeat,
    holeCards: hero,
    players: Array.from({ length: n }, (_, i) => ({
      seat: i,
      stack: 100,
      streetBet: i === 1 ? 5 : i === 2 ? 10 : 0,
      committed: i === 1 ? 5 : i === 2 ? 10 : 0,
      status: 'active' as const,
    })),
    street: 'preflop',
    pot: 15,
    currentSeat: heroSeat,
    highestBet: 10,
    toCall: 10,
  });
}

function riverView(hero: [Card, Card], board: Card[], pot: number, toCall: number): PlayerView {
  return mkView({
    seat: 0,
    holeCards: hero,
    players: [
      { seat: 0, stack: 1000, streetBet: 0, committed: pot / 2, status: 'active' },
      { seat: 1, stack: 1000, streetBet: toCall, committed: pot / 2 + toCall, status: 'active' },
    ],
    board,
    street: 'river',
    pot,
    currentSeat: 0,
    highestBet: toCall,
    toCall,
  });
}

describe('evaluateDecision 翻前查表', () => {
  it('UTG 弃掉 AA 是失误（chart）', () => {
    const r = evaluateDecision(preflopView([c('As'), c('Ad')], 3), { type: 'fold' });
    expect(r.method).toBe('chart');
    expect(r.verdict).toBe('mistake');
  });

  it('UTG 弃掉 72o 是合理（chart）', () => {
    const r = evaluateDecision(preflopView([c('7s'), c('2h')], 3), { type: 'fold' });
    expect(r.method).toBe('chart');
    expect(r.verdict).toBe('good');
  });
});

describe('evaluateDecision 翻后 EV', () => {
  it('河牌坚果面对下注弃牌是失误', () => {
    const r = evaluateDecision(
      riverView([c('As'), c('Ks')], [c('Qs'), c('Js'), c('Ts'), c('2c'), c('2d')], 100, 100),
      { type: 'fold' },
    );
    expect(r.verdict).toBe('mistake');
    expect(r.recommended.type).not.toBe('fold');
  });

  it('坚果面对下注，跟注的 EV 为正', () => {
    const r = evaluateDecision(
      riverView([c('As'), c('Ks')], [c('Qs'), c('Js'), c('Ts'), c('2c'), c('2d')], 100, 100),
      { type: 'call' },
    );
    const callOpt = r.options.find((o) => o.action.type === 'call');
    expect(callOpt?.ev).toBeGreaterThan(0);
  });
});

describe('analyzeHand', () => {
  it('英雄只下盲注且全弃牌时返回空', () => {
    const config = {
      seats: [
        { id: 'a', stack: 100 },
        { id: 'b', stack: 100 },
        { id: 'c', stack: 100 },
      ],
      smallBlind: 5,
      bigBlind: 10,
      buttonSeat: 0,
      handId: 'h',
    };
    const g = createGame({ ...config, rng: intRng(1) });
    const deck = g.initialDeck.slice();
    let s = g;
    s = applyAction(s, { type: 'fold' }); // UTG(seat0)
    s = applyAction(s, { type: 'fold' }); // SB(seat1) → BB(seat2) 赢
    expect(s.phase).toBe('complete');
    const reports = analyzeHand(config, deck, s.log, 2);
    expect(reports).toEqual([]);
  });

  it('确定性：同日志两次分析结果一致', () => {
    const config = {
      seats: [
        { id: 'a', stack: 100 },
        { id: 'b', stack: 100 },
        { id: 'c', stack: 100 },
      ],
      smallBlind: 5,
      bigBlind: 10,
      buttonSeat: 0,
      handId: 'h',
    };
    const g = createGame({ ...config, rng: intRng(2) });
    const deck = g.initialDeck.slice();
    let s = g;
    // UTG(0) raise、SB(1) call、BB(2) call → 翻牌，BB check、UTG bet、SB fold、BB fold
    s = applyAction(s, { type: 'raise', amount: 30 });
    s = applyAction(s, { type: 'call' });
    s = applyAction(s, { type: 'call' });
    const r1 = analyzeHand(config, deck, s.log, 0);
    const r2 = analyzeHand(config, deck, s.log, 0);
    expect(r1).toEqual(r2);
  });
});
