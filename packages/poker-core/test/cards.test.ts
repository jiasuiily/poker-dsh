import { describe, it, expect } from 'vitest';
import { cardFromString, cardName, createDeck, rankOf, suitOf, shuffle, secureRng } from '../src/cards';

describe('cards', () => {
  it('createDeck 返回 52 张互不相同的牌', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck).size).toBe(52);
  });

  it('rankOf / suitOf 正确', () => {
    // As = 黑桃A = suit 0, rank 12
    const as = cardFromString('As');
    expect(suitOf(as)).toBe(0);
    expect(rankOf(as)).toBe(12);
    // 2d = 方块2 = suit 2, rank 0
    const td = cardFromString('2d');
    expect(suitOf(td)).toBe(2);
    expect(rankOf(td)).toBe(0);
  });

  it('cardFromString / cardName 往返', () => {
    const cases: Array<[string, string]> = [
      ['As', 'A♠'],
      ['Kh', 'K♥'],
      ['Td', 'T♦'],
      ['2c', '2♣'],
      ['Js', 'J♠'],
      ['9h', '9♥'],
    ];
    for (const [input, expected] of cases) {
      expect(cardName(cardFromString(input))).toBe(expected);
    }
  });

  it('cardFromString 大小写不敏感', () => {
    expect(cardFromString('as')).toBe(cardFromString('As'));
    expect(cardFromString('kh')).toBe(cardFromString('KH'));
  });

  it('shuffle 返回原牌堆的一个排列（不修改原数组）', () => {
    const deck = createDeck();
    const copy = deck.slice();
    const shuffled = shuffle(deck);
    expect(shuffled).toHaveLength(52);
    expect(new Set(shuffled).size).toBe(52);
    expect([...shuffled].sort((a, b) => a - b)).toEqual([...deck].sort((a, b) => a - b));
    // 原数组未被修改
    expect(deck).toEqual(copy);
  });

  it('shuffle 使用注入的确定性 RNG', () => {
    const deck = [0, 1, 2, 3, 4];
    // 恒返回 0 的 rng
    const rng = () => 0;
    expect(shuffle(deck, rng)).toEqual([1, 2, 3, 4, 0]);
  });

  it('secureRng 返回 [0, max) 内的整数', () => {
    for (let i = 0; i < 1000; i++) {
      const x = secureRng(52);
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(52);
    }
  });
});
