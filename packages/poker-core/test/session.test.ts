import { describe, it, expect } from 'vitest';
import type { Rng } from '../src/cards';
import {
  createSession,
  dealHand,
  commitHand,
  currentBlinds,
  currentLevelIndex,
  survivors,
  isTournamentOver,
} from '../src/session';
import { applyAction, sampleAction } from '../src/game';

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

describe('盲注结构', () => {
  it('按手数升级，且升级只在下一手生效、超出封顶', () => {
    const s = createSession({
      stacks: [100, 100],
      startingButtonSeat: 0,
      levels: [
        { smallBlind: 5, bigBlind: 10 },
        { smallBlind: 10, bigBlind: 20 },
        { smallBlind: 20, bigBlind: 40 },
      ],
      handsPerLevel: 10,
    });
    expect(currentBlinds(s)).toEqual({ smallBlind: 5, bigBlind: 10 });
    expect(currentLevelIndex(s)).toBe(0);
    expect(currentBlinds({ ...s, handNumber: 10 })).toEqual({ smallBlind: 5, bigBlind: 10 });
    expect(currentBlinds({ ...s, handNumber: 11 })).toEqual({ smallBlind: 10, bigBlind: 20 });
    expect(currentBlinds({ ...s, handNumber: 21 })).toEqual({ smallBlind: 20, bigBlind: 40 });
    expect(currentBlinds({ ...s, handNumber: 100 })).toEqual({ smallBlind: 20, bigBlind: 40 });
  });
});

describe('发牌与按钮', () => {
  it('发牌用当前盲注与按钮，且跳过已淘汰座位', () => {
    const s = createSession({
      stacks: [0, 100, 100],
      startingButtonSeat: 1,
      levels: [{ smallBlind: 5, bigBlind: 10 }],
      handsPerLevel: 1,
    });
    expect(survivors(s)).toEqual([1, 2]);
    const { game, seatMap } = dealHand(s, intRng(1));
    expect(game.players).toHaveLength(2);
    expect(seatMap).toEqual([1, 2]);
    expect(game.smallBlind).toBe(5);
    expect(game.bigBlind).toBe(10);
  });

  it('一手牌后筹码回写、按钮推进、手数 +1', () => {
    const s = createSession({
      stacks: [100, 100, 100],
      startingButtonSeat: 0,
      levels: [{ smallBlind: 5, bigBlind: 10 }],
      handsPerLevel: 100,
    });
    const { game, seatMap } = dealHand(s, intRng(1));
    let g = applyAction(game, { type: 'fold' }); // UTG 弃牌
    g = applyAction(g, { type: 'fold' }); // SB 弃牌 → BB 赢
    expect(g.phase).toBe('complete');
    const s2 = commitHand(s, { game: g, seatMap });
    expect(s2.stacks).toEqual([100, 95, 105]);
    expect(s2.buttonSeat).toBe(1);
    expect(s2.handNumber).toBe(2);
  });
});

describe('锦标赛模拟', () => {
  it('盲注递增直至一人淘汰，筹码守恒', () => {
    let s = createSession({
      stacks: [100, 100],
      startingButtonSeat: 0,
      levels: [
        { smallBlind: 5, bigBlind: 10 },
        { smallBlind: 10, bigBlind: 20 },
        { smallBlind: 20, bigBlind: 40 },
        { smallBlind: 40, bigBlind: 80 },
        { smallBlind: 80, bigBlind: 160 },
        { smallBlind: 160, bigBlind: 320 },
      ],
      handsPerLevel: 1,
    });
    const rng = intRng(42);
    let hands = 0;
    while (!isTournamentOver(s) && hands < 200) {
      const { game, seatMap } = dealHand(s, intRng(hands + 1));
      let g = game;
      let guard = 0;
      while (g.phase === 'betting' && guard < 500) {
        g = applyAction(g, sampleAction(g, rng));
        guard++;
      }
      s = commitHand(s, { game: g, seatMap });
      hands++;
    }
    expect(isTournamentOver(s)).toBe(true);
    expect(s.stacks.reduce((a, b) => a + b, 0)).toBe(200);
    expect(hands).toBeLessThan(200);
  });
});
