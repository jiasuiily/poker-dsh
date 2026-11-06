import { describe, it, expect } from 'vitest';
import { cardFromString, type Card } from '../src/cards';
import { evaluate, compareCards, compareHandRanks, handScore, CATEGORY } from '../src/evaluator';

function hand(...strs: string[]): Card[] {
  return strs.map(cardFromString);
}

describe('evaluator 牌型识别', () => {
  it('皇家同花顺', () => {
    const r = evaluate(hand('As', 'Ks', 'Qs', 'Js', 'Ts'));
    expect(r.category).toBe(CATEGORY.STRAIGHT_FLUSH);
    expect(r.tiebreakers).toEqual([12]);
  });

  it('轮子同花顺（A2345 为 5 高）', () => {
    const r = evaluate(hand('As', '2s', '3s', '4s', '5s'));
    expect(r.category).toBe(CATEGORY.STRAIGHT_FLUSH);
    expect(r.tiebreakers).toEqual([3]);
  });

  it('四条', () => {
    const r = evaluate(hand('9s', '9h', '9d', '9c', 'Kh'));
    expect(r.category).toBe(CATEGORY.FOUR_OF_A_KIND);
    expect(r.tiebreakers).toEqual([7, 11]); // 9=7, K=11
  });

  it('葫芦', () => {
    const r = evaluate(hand('Qh', 'Qs', 'Qd', '7c', '7s'));
    expect(r.category).toBe(CATEGORY.FULL_HOUSE);
    expect(r.tiebreakers).toEqual([10, 5]); // Q=10, 7=5
  });

  it('同花', () => {
    const r = evaluate(hand('Ah', 'Kh', '9h', '5h', '2h'));
    expect(r.category).toBe(CATEGORY.FLUSH);
    expect(r.tiebreakers).toEqual([12, 11, 7, 3, 0]);
  });

  it('顺子', () => {
    const r = evaluate(hand('9s', '8h', '7d', '6c', '5s'));
    expect(r.category).toBe(CATEGORY.STRAIGHT);
    expect(r.tiebreakers).toEqual([7]); // 9 高
  });

  it('轮子顺子（A2345 为 5 高）', () => {
    const r = evaluate(hand('As', '2h', '3d', '4c', '5s'));
    expect(r.category).toBe(CATEGORY.STRAIGHT);
    expect(r.tiebreakers).toEqual([3]);
  });

  it('三条', () => {
    const r = evaluate(hand('8s', '8h', '8d', 'Kc', '3s'));
    expect(r.category).toBe(CATEGORY.THREE_OF_A_KIND);
    expect(r.tiebreakers).toEqual([6, 11, 1]); // 8=6, K=11, 3=1
  });

  it('两对', () => {
    const r = evaluate(hand('Js', 'Jh', '4d', '4c', 'As'));
    expect(r.category).toBe(CATEGORY.TWO_PAIR);
    expect(r.tiebreakers).toEqual([9, 2, 12]); // J=9, 4=2, A=12
  });

  it('一对', () => {
    const r = evaluate(hand('Ts', 'Th', 'Ad', '7c', '3s'));
    expect(r.category).toBe(CATEGORY.ONE_PAIR);
    expect(r.tiebreakers).toEqual([8, 12, 5, 1]); // T=8, A=12, 7=5, 3=1
  });

  it('高牌', () => {
    const r = evaluate(hand('As', 'Qh', '9d', '6c', '3s'));
    expect(r.category).toBe(CATEGORY.HIGH_CARD);
    expect(r.tiebreakers).toEqual([12, 10, 7, 4, 1]);
  });
});

describe('evaluator 7 张牌取最优', () => {
  it('7 张里取最优 5 张（成顺子压过对子）', () => {
    const r = evaluate(hand('As', 'Ad', 'Ks', 'Qd', 'Js', 'Ts', '2c'));
    expect(r.category).toBe(CATEGORY.STRAIGHT);
    expect(r.tiebreakers).toEqual([12]); // A 高顺
  });

  it('7 张里识别同花', () => {
    const r = evaluate(hand('Ah', 'Kh', '9h', '5h', '2h', '2d', '2c'));
    expect(r.category).toBe(CATEGORY.FLUSH);
    expect(r.tiebreakers).toEqual([12, 11, 7, 3, 0]);
  });

  it('7 张里识别葫芦', () => {
    const r = evaluate(hand('8s', '8h', '8d', '4c', '4s', '2h', '2d'));
    expect(r.category).toBe(CATEGORY.FULL_HOUSE);
    expect(r.tiebreakers).toEqual([6, 2]); // 8 上 4（三张8 + 一对4）
  });
});

describe('evaluator 比较', () => {
  it('牌型大小顺序正确', () => {
    const list = [
      hand('As', 'Ks', 'Qs', 'Js', 'Ts'), // 皇家同花顺
      hand('9s', '9h', '9d', '9c', 'Kh'), // 四条
      hand('Qh', 'Qs', 'Qd', '7c', '7s'), // 葫芦
      hand('Ah', 'Kh', '9h', '5h', '2h'), // 同花
      hand('9s', '8h', '7d', '6c', '5s'), // 顺子
      hand('8s', '8h', '8d', 'Kc', '3s'), // 三条
      hand('Js', 'Jh', '4d', '4c', 'As'), // 两对
      hand('Ts', 'Th', 'Ad', '7c', '3s'), // 一对
      hand('As', 'Qh', '9d', '6c', '3s'), // 高牌
    ];
    for (let i = 0; i < list.length - 1; i++) {
      expect(compareCards(list[i], list[i + 1])).toBeGreaterThan(0);
      expect(compareCards(list[i + 1], list[i])).toBeLessThan(0);
    }
  });

  it('同花比最大牌', () => {
    const a = hand('Ah', 'Kh', '9h', '5h', '2h');
    const b = hand('As', 'Qs', '9s', '5s', '2s');
    expect(compareCards(a, b)).toBeGreaterThan(0);
  });

  it('相同牌型与次序相等', () => {
    const a = hand('As', 'Kh', '9d', '6c', '3s');
    const b = hand('Ah', 'Ks', '9c', '6d', '3h');
    expect(compareCards(a, b)).toBe(0);
  });

  it('顺子 vs 三条，顺子更大', () => {
    expect(compareCards(hand('9s', '8h', '7d', '6c', '5s'), hand('8s', '8h', '8d', 'Kc', '3s'))).toBeGreaterThan(0);
  });

  it('handScore 与 compareHandRanks 单调一致', () => {
    const a = evaluate(hand('Qh', 'Qs', 'Qd', '7c', '7s'));
    const b = evaluate(hand('Ah', 'Kh', '9h', '5h', '2h'));
    expect(Math.sign(handScore(a) - handScore(b))).toBe(Math.sign(compareHandRanks(a, b)));
  });
});
