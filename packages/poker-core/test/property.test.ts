import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Rng } from '../src/cards';
import {
  createGame,
  applyAction,
  sampleAction,
  validateAction,
  legalActions,
  potOf,
  type Action,
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

describe('属性测试', () => {
  it('随机对局：筹码守恒、无负筹码、动作始终合法', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 20, max: 200 }), { minLength: 2, maxLength: 6 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        (stacks, smallBlind, seed) => {
          const bigBlind = smallBlind * 2;
          const buttonSeat = seed % stacks.length;
          const initialTotal = stacks.reduce((a, b) => a + b, 0);
          const seats = stacks.map((stack, i) => ({ id: `p${i}`, stack }));
          let game = createGame({
            seats,
            smallBlind,
            bigBlind,
            buttonSeat,
            rng: intRng(seed),
            handId: 'prop',
          });
          const actionRng = intRng((seed ^ 0x9e3779b9) >>> 0);
          let guard = 0;
          while (game.phase === 'betting' && guard < 2000) {
            const total = game.players.reduce((s, p) => s + p.stack, 0) + potOf(game);
            expect(total).toBe(initialTotal);
            for (const p of game.players) expect(p.stack).toBeGreaterThanOrEqual(0);
            expect(legalActions(game).length).toBeGreaterThan(0);
            const action = sampleAction(game, actionRng);
            expect(validateAction(game, action)).toBeNull();
            game = applyAction(game, action);
            guard++;
          }
          const finalTotal = game.players.reduce((s, p) => s + p.stack, 0) + potOf(game);
          expect(finalTotal).toBe(initialTotal);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('重放一致性：同种子 + 同动作序列 → 同结果', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        (seatCount, smallBlind, seed) => {
          const bigBlind = smallBlind * 2;
          const seats = Array.from({ length: seatCount }, (_, i) => ({ id: `p${i}`, stack: 100 }));
          const cfg = { seats, smallBlind, bigBlind, buttonSeat: seed % seatCount, handId: 'rep' };
          let g1 = createGame({ ...cfg, rng: intRng(seed) });
          const actionRng = intRng((seed ^ 0xabcdef) >>> 0);
          const actions: Action[] = [];
          let guard = 0;
          while (g1.phase === 'betting' && guard < 500) {
            const a = sampleAction(g1, actionRng);
            actions.push(a);
            g1 = applyAction(g1, a);
            guard++;
          }
          let g2 = createGame({ ...cfg, rng: intRng(seed) });
          for (const a of actions) g2 = applyAction(g2, a);
          expect(g2.players.map((p) => p.stack)).toEqual(g1.players.map((p) => p.stack));
          expect(g2.board).toEqual(g1.board);
          expect(g2.winners).toEqual(g1.winners);
        },
      ),
      { numRuns: 100 },
    );
  });
});
