import { describe, it, expect } from 'vitest';
import type { Rng } from '../src/cards';
import { cardFromString } from '../src/cards';
import {
  createGame,
  applyAction,
  validateAction,
  computeSidePots,
  resolveShowdown,
  type GameState,
  type Player,
} from '../src/game';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function intRng(seed: number): Rng {
  const r = mulberry32(seed);
  return (maxExclusive) => Math.floor(r() * maxExclusive);
}

function game3() {
  return createGame({
    seats: [
      { id: 'a', stack: 100 },
      { id: 'b', stack: 100 },
      { id: 'c', stack: 100 },
    ],
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: 0,
    rng: intRng(1),
    handId: 'h',
  });
}

function mkPlayer(seat: number, committed: number, status: Player['status'] = 'active'): Player {
  return { id: `p${seat}`, seat, stack: 0, status, holeCards: [], streetBet: 0, committed };
}

function showdownState(spec: {
  contenders: Array<{ seat: number; hole: [string, string]; committed: number }>;
  folded?: Array<{ seat: number; committed: number }>;
  board: string[];
  buttonSeat: number;
  seatCount: number;
}): GameState {
  const players: Player[] = Array.from({ length: spec.seatCount }, (_, seat) => ({
    id: `p${seat}`,
    seat,
    stack: 0,
    status: 'folded' as const,
    holeCards: [],
    streetBet: 0,
    committed: 0,
  }));
  for (const c of spec.contenders) {
    players[c.seat] = {
      ...players[c.seat],
      status: 'active',
      holeCards: c.hole.map(cardFromString),
      committed: c.committed,
    };
  }
  for (const f of spec.folded ?? []) {
    players[f.seat] = { ...players[f.seat], status: 'folded', committed: f.committed };
  }
  return {
    handId: 't',
    players,
    deck: [],
    initialDeck: [],
    board: spec.board.map(cardFromString),
    street: 'river',
    smallBlind: 5,
    bigBlind: 10,
    buttonSeat: spec.buttonSeat,
    currentSeat: -1,
    highestBet: 0,
    minRaiseIncrement: 10,
    lastAggressorSeat: -1,
    lastRaiseIncomplete: false,
    actedSeats: [],
    phase: 'betting',
    winners: [],
    revealed: [],
    log: [],
    seq: 0,
  };
}

describe('创建牌局', () => {
  it('下盲注、发两张底牌、UTG 先行动', () => {
    const g = game3();
    expect(g.players[1].committed).toBe(5);
    expect(g.players[2].committed).toBe(10);
    expect(g.players[0].committed).toBe(0);
    expect(g.players[1].stack).toBe(95);
    expect(g.players[2].stack).toBe(90);
    expect(g.currentSeat).toBe(0);
    for (const p of g.players) expect(p.holeCards).toHaveLength(2);
  });

  it('单挑：按钮=小盲，翻前小盲先动、翻后大盲先动', () => {
    const g = createGame({
      seats: [
        { id: 'a', stack: 100 },
        { id: 'b', stack: 100 },
      ],
      smallBlind: 5,
      bigBlind: 10,
      buttonSeat: 0,
      rng: intRng(1),
      handId: 'h',
    });
    expect(g.players[0].committed).toBe(5);
    expect(g.players[1].committed).toBe(10);
    expect(g.currentSeat).toBe(0);
    let s = applyAction(g, { type: 'call' });
    expect(s.currentSeat).toBe(1);
    s = applyAction(s, { type: 'check' });
    expect(s.street).toBe('flop');
    expect(s.board).toHaveLength(3);
    expect(s.currentSeat).toBe(1);
  });
});

describe('下注与弃牌', () => {
  it('弃牌到只剩一人直接赢底池', () => {
    let s = game3();
    s = applyAction(s, { type: 'fold' });
    s = applyAction(s, { type: 'fold' });
    expect(s.phase).toBe('complete');
    expect(s.winners).toEqual([{ seat: 2, amount: 15 }]);
    expect(s.players[2].stack).toBe(105);
  });

  it('最小加注与过牌校验', () => {
    const s = game3();
    expect(validateAction(s, { type: 'check' })).toBeTruthy();
    expect(validateAction(s, { type: 'call' })).toBeNull();
    expect(validateAction(s, { type: 'raise', amount: 19 })).toBeTruthy();
    expect(validateAction(s, { type: 'raise', amount: 20 })).toBeNull();
  });
});

describe('不完整加注', () => {
  it('不足额全下不重开加注权', () => {
    let s = createGame({
      seats: [
        { id: 'a', stack: 1000 },
        { id: 'b', stack: 15 },
      ],
      smallBlind: 5,
      bigBlind: 10,
      buttonSeat: 0,
      rng: intRng(1),
      handId: 'h',
    });
    s = applyAction(s, { type: 'call' }); // A 跟注到 10
    expect(s.currentSeat).toBe(1);
    s = applyAction(s, { type: 'allin' }); // B 全下 15（增量 5 < 10，不足额）
    expect(s.highestBet).toBe(15);
    expect(s.currentSeat).toBe(0);
    expect(validateAction(s, { type: 'raise', amount: 25 })).toBeTruthy(); // 不能再加注
    expect(validateAction(s, { type: 'call' })).toBeNull(); // 只能跟注
    expect(validateAction(s, { type: 'fold' })).toBeNull();
  });
});

describe('边池', () => {
  it('未被跟注部分退回（超额下注）', () => {
    const pots = computeSidePots([mkPlayer(0, 1000), mkPlayer(1, 300)]);
    expect(pots).toEqual([
      { amount: 600, eligibleSeats: [0, 1] },
      { amount: 700, eligibleSeats: [0] },
    ]);
  });

  it('三人不同投入分层', () => {
    const pots = computeSidePots([mkPlayer(0, 100), mkPlayer(1, 100), mkPlayer(2, 50)]);
    expect(pots).toEqual([
      { amount: 150, eligibleSeats: [0, 1, 2] },
      { amount: 100, eligibleSeats: [0, 1] },
    ]);
  });
});

describe('摊牌与胜负', () => {
  it('顺子胜过两对', () => {
    const s = showdownState({
      contenders: [
        { seat: 0, hole: ['As', 'Ad'], committed: 100 },
        { seat: 1, hole: ['9s', '8c'], committed: 100 },
      ],
      board: ['7d', '6h', '5c', '2h', '2d'],
      buttonSeat: 0,
      seatCount: 2,
    });
    const r = resolveShowdown(s);
    expect(r.phase).toBe('complete');
    expect(r.winners).toEqual([{ seat: 1, amount: 200 }]);
    expect(r.players[1].stack).toBe(200);
  });

  it('平分底池', () => {
    const s = showdownState({
      contenders: [
        { seat: 0, hole: ['As', 'Kd'], committed: 100 },
        { seat: 1, hole: ['Ah', 'Ks'], committed: 100 },
      ],
      board: ['7d', '6h', '5c', '2h', '2d'],
      buttonSeat: 0,
      seatCount: 2,
    });
    const r = resolveShowdown(s);
    const bySeat = Object.fromEntries(r.winners.map((w) => [w.seat, w.amount]));
    expect(bySeat).toEqual({ 0: 100, 1: 100 });
  });

  it('奇数筹码归按钮左侧第一位', () => {
    const s = showdownState({
      contenders: [
        { seat: 1, hole: ['As', 'Kd'], committed: 10 },
        { seat: 2, hole: ['Ah', 'Ks'], committed: 10 },
      ],
      folded: [{ seat: 0, committed: 1 }],
      board: ['7d', '6h', '5c', '2h', '2d'],
      buttonSeat: 0,
      seatCount: 3,
    });
    const r = resolveShowdown(s);
    const bySeat: Record<number, number> = {};
    for (const w of r.winners) bySeat[w.seat] = (bySeat[w.seat] ?? 0) + w.amount;
    expect(bySeat[1] + bySeat[2]).toBe(21);
    expect(bySeat[1]).toBe(11); // 余数给按钮左侧第一位 seat1
    expect(bySeat[2]).toBe(10);
  });
});
